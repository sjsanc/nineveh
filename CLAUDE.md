# CLAUDE.md

Nineveh is a minimal ebook library manager built with Wails v2 (Go backend + React/TypeScript frontend). It manages a local library of ebooks, reads embedded metadata, and can transfer books to connected Kindle devices.

**Dev (hot reload):**
- Linux: `wails dev -tags webkit2_41`
- Windows/macOS: `wails dev`

**Build:**
- Linux: `wails build -tags webkit2_41`
- Windows/macOS: `wails build`

The `-tags webkit2_41` flag is required on Linux to use webkit2gtk-4.1.

## Architecture

### Backend (`app.go` + `internal/`)

`app.go` is the single Wails-bound struct (`App`). Every method on `App` is directly callable from the frontend via generated bindings in `frontend/wailsjs/go/main/App.ts`. Startup wires up all dependencies and launches `watchDevices`, which drives a `platform.Watcher` (uevent on Linux) with a poll fallback, emitting a `devices:changed` Wails event when the set changes.

Data lives in `~/.local/share/nineveh/` (XDG data home):
- `nineveh.db` — SQLite database (WAL mode, single writer)
- `.covers/` — cover images stored by SHA-256 hash

Internal packages:
- `internal/db` — SQLite via `modernc.org/sqlite` (pure Go, no cgo). Schema is applied from an embedded `schema.sql` on open.
- `internal/library` — thin layer over `db`; handles file import, Calibre import, cover persistence, and deduplication (`ErrDuplicate`).
- `internal/metadata` — format-specific parsers (EPUB, MOBI, AZW3, PDF) behind the `Parser` interface. The `Book` struct is the canonical data model.
- `internal/device` — `Device` interface with platform-specific implementations. Linux: MTP (`mtp_linux.go`) + mount-point (`detect_linux.go`). Windows: removable-drive scan (`detect_windows.go`, `mtp_windows.go`). macOS: stubs only (no device support yet).
- `internal/platform` — platform abstraction (`DeviceDetector`, `DeviceWatcher`, `Opener`), constructed once at startup via `New()`. Linux uses uevent watching + MTP/mount detection; Windows uses drive-scan detection with a stub watcher; macOS stubs detection/watching and uses `open` for file-open.
- `internal/fetcher` — queries Open Library and optionally Google Books (API key in prefs), returns `[]FetchedMetadata` candidates.
- `internal/prefs` — JSON prefs file at the XDG config path.

### Frontend (`frontend/src/`)

Single-page React app. All state lives in `App.tsx` — no global state manager. Prefs are distributed via `prefsContext.tsx`.

Key patterns:
- Wails bindings in `wailsjs/go/main/App.ts` are auto-generated — do not edit manually. Run `wails dev` or `wails generate module` to regenerate after adding/removing methods on `App`.
- The `metadata.Book` class (from `wailsjs/go/models.ts`) must be used when calling `UpdateBook` — plain objects are not accepted by the binding layer.
- Cover images are served at `/covers/<hash>.jpg` by a custom handler in `main.go`. The frontend fetches them via `GetCoverData` (returns base64 data URL) rather than direct `<img src>` to work inside Wails' asset server.
- UI uses Blueprint v6 + Tailwind v4. Blueprint classes require `bp6-dark` on the root element for dark theme.
- `@tanstack/react-table` + `@tanstack/react-virtual` for virtualized book/device tables.
- Shared hooks live in `src/lib/` (e.g. `useCoverImage`, `useShiftCtrlSelect`, `useResizablePanel`).

## Linting & Formatting

The frontend uses [Biome](https://biomejs.dev/) for linting and formatting (`frontend/biome.json`). Run it from `frontend/`:

```bash
npx biome check src/          # lint only
npx biome check --write src/  # lint + apply safe fixes
npx biome format --write src/ # format only
```

`dist/` and `wailsjs/` are excluded (build/generated output). Two rules are disabled project-wide:
- `security/noDangerouslySetInnerHtml` — DOMPurify sanitizes all HTML before rendering.
- `a11y/noNoninteractiveTabindex` — table containers require `tabIndex={0}` for keyboard navigation.

Biome must pass clean (`0 errors`) before committing frontend changes.

## Testing

### Backend

```bash
go test ./internal/...
```

### Frontend

Tests live in `frontend/src/test/`. Uses Vitest + React Testing Library with jsdom.

```bash
cd frontend
npm run typecheck   # type-check without emitting
npm test            # single run
npm run test:watch  # watch mode
```

`globals: true` is set — `describe`/`it`/`vi`/`expect` are available without imports. Mock Wails bindings at the top of any test that imports from `wailsjs/`:

```ts
vi.mock('../../../wailsjs/go/main/App', () => ({
  GetBooks: vi.fn(),
}))
```

## Releases & Deployment

### Cutting a release

```bash
git tag v1.2.3 -m "v1.2.3"
git push origin v1.2.3
```

Tag push is the sole trigger for the release pipeline.

### CI pipeline (`.github/workflows/ci-release.yml`)

- **Push/PR to master** → `test` job: `go test ./internal/...`
- **Tag push `v*`** → `test` then `release`: builds on `ubuntu-24.04`, creates a GitHub release with a Linux amd64 tarball, then updates the AUR package.

Linux build command: `wails build -tags webkit2_41 -ldflags "-s -w"` (~18 MB binary).

### AUR package (`nineveh-bin`)

`aur/PKGBUILD` — binary package, no compilation on user's machine. CI patches `pkgver`/`sha256sums`, regenerates `.SRCINFO` via Docker, and pushes to `aur@aur.archlinux.org:nineveh-bin.git`. Requires the `AUR_SSH_KEY` GitHub Actions secret (already configured).
