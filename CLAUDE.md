# CLAUDE.md

Nineveh is a minimal ebook library manager for Linux, built with Wails v2 (Go backend + React/TypeScript frontend). It manages a local library of ebooks, reads embedded metadata, and can transfer books to connected Kindle devices over MTP or mount-point detection.

**Dev (hot reload):**

`wails dev -tags webkit2_41`

**Build:**

`wails build -tags webkit2_41`

The `-tags webkit2_41` flag is required on Linux to use webkit2gtk-4.1.

## Architecture

### Backend (`app.go` + `internal/`)

`app.go` is the single Wails-bound struct (`App`). Every method on `App` is directly callable from the frontend via generated bindings in `frontend/wailsjs/go/main/App.ts`. Startup wires up all dependencies and launches a background goroutine (`watchDevices`) that polls for USB device changes every 3 seconds, emitting a `devices:changed` Wails event when the set changes.

Data lives in `~/.local/share/nineveh/` (XDG data home):
- `nineveh.db` — SQLite database (WAL mode, single writer)
- `.covers/` — cover images stored by SHA-256 hash
- `events.log` — append-only event log (JSON lines)

Internal packages:
- `internal/db` — SQLite via `modernc.org/sqlite` (pure Go, no cgo). Migrations run automatically via `goose` from embedded SQL files in `internal/db/migrations/`.
- `internal/library` — thin layer over `db`; handles file import, Calibre import, cover persistence, and deduplication (`ErrDuplicate`).
- `internal/metadata` — format-specific parsers (EPUB, MOBI, AZW3, PDF) behind the `Parser` interface. The `Book` struct is the canonical data model shared across the whole app.
- `internal/device` — `Device` interface with two implementations: MTP (`mtp.go`) and mount-point (`detect.go`). `Detect()` returns whichever devices are currently accessible.
- `internal/fetcher` — queries Open Library and optionally Google Books (API key in prefs) and returns `[]FetchedMetadata` candidates.
- `internal/prefs` — JSON prefs file at the XDG config path.
- `internal/eventlog` — append-only log of library/device actions.

### Frontend (`frontend/src/`)

Single-page React app. All state lives in `App.tsx` — there is no global state manager. The three main sections (library, devices, log) are toggled via `activeSection` state.

Key patterns:
- Wails bindings in `wailsjs/go/main/App.ts` are auto-generated; do not edit them manually. Run `wails dev` or `wails generate module` to regenerate after adding/removing methods on `App`.
- The `metadata.Book` class (from `wailsjs/go/models.ts`) must be used when calling `UpdateBook` — plain objects are not accepted by the binding layer.
- Cover images are served by a custom `http.Handler` in `main.go` at `/covers/<hash>.jpg`. The frontend requests them via `GetCoverData` (returns base64 data URL) rather than direct `<img src>` to work inside Wails' asset server.
- UI uses Blueprint v6 + Tailwind v4. Blueprint classes require the `bp6-dark` class on the root element for dark theme.
- `@tanstack/react-table` + `@tanstack/react-virtual` for the book/device tables with virtualized rows.
