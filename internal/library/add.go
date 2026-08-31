package library

import (
	"crypto/sha256"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"strings"

	"nineveh/internal/metadata"
)

var supportedFormats = map[metadata.Format]metadata.Parser{
	metadata.FormatEPUB: metadata.NewEPUBParser(),
	metadata.FormatPDF:  metadata.NewPDFParser(),
	metadata.FormatMOBI: metadata.NewMOBIParser(),
	metadata.FormatAZW:  metadata.NewMOBIParser(),
	metadata.FormatAZW3: metadata.NewAZW3Parser(),
}

// conflictPolicy controls how addFile handles a same-book/same-format
// collision: policyAsk returns it as an AddOutcome.Conflict for the
// caller to resolve; policyKeepBoth auto-resolves it as if the user chose
// ConflictKeepBoth, for paths with no interactive UI (AddDir, device sync).
type conflictPolicy int

const (
	policyAsk conflictPolicy = iota
	policyKeepBoth
)

// AddFile adds a single ebook file to the library, matching it against an
// existing book by ISBN (if the file has one) or by title+primary-author.
// Returns ErrDuplicate if the file's content hash exactly matches a
// format already in the library. Returns an AddOutcome with Conflict set
// (not an error) when the file matches an existing book that already has
// a format of the same type — call ResolveConflict to proceed.
func (l *Library) AddFile(srcPath string) (*AddOutcome, error) {
	return l.addFile(srcPath, policyAsk)
}

func (l *Library) addFile(srcPath string, policy conflictPolicy) (*AddOutcome, error) {
	ext := metadata.Format(strings.ToLower(strings.TrimPrefix(filepath.Ext(srcPath), ".")))
	parser, ok := supportedFormats[ext]
	if !ok {
		return nil, fmt.Errorf("unsupported format: %s", ext)
	}

	hash, err := hashFile(srcPath)
	if err != nil {
		return nil, fmt.Errorf("hash file: %w", err)
	}

	book, err := parser.Parse(srcPath)
	if err != nil {
		return nil, fmt.Errorf("parse metadata: %w", err)
	}
	if book.Title == "" {
		book.Title = strings.TrimSuffix(filepath.Base(srcPath), filepath.Ext(srcPath))
	}
	book.DateAdded = "" // always stamp the Nineveh add time, not any embedded timestamp

	l.mu.Lock()
	defer l.mu.Unlock()

	if existing, err := l.db.GetBookByHash(hash); err != nil {
		return nil, fmt.Errorf("check duplicate: %w", err)
	} else if existing != nil {
		return nil, fmt.Errorf("%w: %s", ErrDuplicate, existing.Title)
	}

	matched, err := l.findMatch(book)
	if err != nil {
		return nil, fmt.Errorf("match existing book: %w", err)
	}

	if matched == nil {
		newBook, err := l.addAsNewBookLocked(srcPath, book, hash, ext)
		if err != nil {
			return nil, err
		}
		return &AddOutcome{Book: newBook}, nil
	}

	if existingFmt, ok := findFormat(matched.Formats, ext); ok {
		if policy == policyKeepBoth {
			updated, err := l.attachFormatLocked(matched, srcPath, hash, ext)
			if err != nil {
				return nil, err
			}
			return &AddOutcome{Book: updated}, nil
		}

		info, _ := os.Stat(srcPath)
		var incomingSize int64
		if info != nil {
			incomingSize = info.Size()
		}
		return &AddOutcome{Conflict: &FormatConflict{
			BookID:       matched.ID,
			BookTitle:    matched.Title,
			Format:       ext,
			ExistingPath: existingFmt.Path,
			ExistingSize: existingFmt.Size,
			ExistingHash: existingFmt.Hash,
			IncomingPath: srcPath,
			IncomingSize: incomingSize,
			IncomingHash: hash,
		}}, nil
	}

	updated, err := l.attachFormatLocked(matched, srcPath, hash, ext)
	if err != nil {
		return nil, err
	}
	return &AddOutcome{Book: updated}, nil
}

// findMatch matches by ISBN when the new file has one (no fallback to
// title+author if that lookup misses); otherwise by title+primary-author,
// only when both are present. Returns (nil, nil) when nothing matches.
func (l *Library) findMatch(book *metadata.Book) (*metadata.Book, error) {
	if book.ISBN != "" {
		return l.db.GetBookByISBN(book.ISBN)
	}
	if book.Title != "" && len(book.Authors) > 0 && book.Authors[0] != "" {
		return l.db.GetBookByTitleAuthor(book.Title, book.Authors[0])
	}
	return nil, nil
}

func findFormat(formats []metadata.BookFile, ext metadata.Format) (metadata.BookFile, bool) {
	for _, f := range formats {
		if f.Format == ext {
			return f, true
		}
	}
	return metadata.BookFile{}, false
}

// addAsNewBookLocked creates a new book row with a single format from
// srcPath. Caller must hold l.mu.
func (l *Library) addAsNewBookLocked(srcPath string, book *metadata.Book, hash string, ext metadata.Format) (*metadata.Book, error) {
	destPath, err := l.copyToLibrary(srcPath, book, ext, false)
	if err != nil {
		return nil, fmt.Errorf("copy to library: %w", err)
	}

	if len(book.CoverData) > 0 {
		coverPath, err := l.writeCover(book.CoverData, hash)
		if err == nil {
			book.CoverPath = coverPath
		}
		book.CoverData = nil // don't persist bytes in the struct
	}

	id, err := l.db.InsertBook(book)
	if err != nil {
		os.Remove(destPath)
		return nil, fmt.Errorf("insert book: %w", err)
	}
	book.ID = id

	info, _ := os.Stat(destPath)
	size := int64(0)
	if info != nil {
		size = info.Size()
	}

	bf := &metadata.BookFile{
		Path:   destPath,
		Format: ext,
		Size:   size,
		Hash:   hash,
	}
	if err := l.db.InsertFormat(id, bf); err != nil {
		return nil, fmt.Errorf("insert format: %w", err)
	}
	book.Formats = []metadata.BookFile{*bf}

	return book, nil
}

// attachFormatLocked copies srcPath in as a new format on an existing
// book (no new book row) and returns the refreshed book. Caller must hold
// l.mu.
func (l *Library) attachFormatLocked(book *metadata.Book, srcPath, hash string, ext metadata.Format) (*metadata.Book, error) {
	destPath, err := l.copyToLibrary(srcPath, book, ext, false)
	if err != nil {
		return nil, fmt.Errorf("copy to library: %w", err)
	}

	info, _ := os.Stat(destPath)
	size := int64(0)
	if info != nil {
		size = info.Size()
	}

	bf := &metadata.BookFile{Path: destPath, Format: ext, Size: size, Hash: hash}
	if err := l.db.InsertFormat(book.ID, bf); err != nil {
		os.Remove(destPath)
		return nil, fmt.Errorf("insert format: %w", err)
	}
	return l.db.GetBook(book.ID)
}

// ResolveConflict finishes handling a FormatConflict returned by AddFile,
// per the user's chosen action.
func (l *Library) ResolveConflict(c FormatConflict, action ConflictAction) (*metadata.Book, error) {
	l.mu.Lock()
	defer l.mu.Unlock()

	switch action {
	case ConflictKeepExisting:
		return l.db.GetBook(c.BookID)

	case ConflictReplace:
		return l.resolveReplaceLocked(c)

	case ConflictKeepBoth:
		book, err := l.db.GetBook(c.BookID)
		if err != nil {
			return nil, fmt.Errorf("get book: %w", err)
		}
		hash, err := hashFile(c.IncomingPath)
		if err != nil {
			return nil, fmt.Errorf("hash file: %w", err)
		}
		if hash != c.IncomingHash {
			return nil, fmt.Errorf("source file changed since this conflict was detected — please retry")
		}
		return l.attachFormatLocked(book, c.IncomingPath, hash, c.Format)

	default:
		return nil, fmt.Errorf("unknown conflict action: %s", action)
	}
}

// resolveReplaceLocked overwrites the existing format's file/DB row with
// the incoming file's content. Caller must hold l.mu.
func (l *Library) resolveReplaceLocked(c FormatConflict) (*metadata.Book, error) {
	book, err := l.db.GetBook(c.BookID)
	if err != nil {
		return nil, fmt.Errorf("get book: %w", err)
	}

	hash, err := hashFile(c.IncomingPath)
	if err != nil {
		return nil, fmt.Errorf("hash file: %w", err)
	}
	if hash != c.IncomingHash {
		return nil, fmt.Errorf("source file changed since this conflict was detected — please retry")
	}

	destPath, err := l.copyToLibrary(c.IncomingPath, book, c.Format, true)
	if err != nil {
		return nil, fmt.Errorf("copy to library: %w", err)
	}
	if destPath != c.ExistingPath {
		// The book may have been renamed since the conflict was detected,
		// landing the replacement in a different folder — best-effort
		// cleanup of the orphaned old file.
		os.Remove(c.ExistingPath)
	}

	info, _ := os.Stat(destPath)
	size := int64(0)
	if info != nil {
		size = info.Size()
	}

	if err := l.db.ReplaceFormat(c.ExistingHash, &metadata.BookFile{
		Path: destPath, Format: c.Format, Size: size, Hash: hash,
	}); err != nil {
		return nil, fmt.Errorf("replace format: %w", err)
	}
	return l.db.GetBook(c.BookID)
}

// AddPaths adds each path without blocking on user input: a format
// conflict auto-resolves as keep-both (never destructive — the worst
// outcome is a redundant format row). Used by AddDir and by device-sync
// adds, neither of which have a per-file resolution UI.
func (l *Library) AddPaths(paths []string) ([]*metadata.Book, []error) {
	var books []*metadata.Book
	var errs []error
	for _, p := range paths {
		outcome, err := l.addFile(p, policyKeepBoth)
		if err != nil {
			errs = append(errs, fmt.Errorf("%s: %w", filepath.Base(p), err))
			continue
		}
		books = append(books, outcome.Book) // never nil under policyKeepBoth
	}
	return books, errs
}

// AddDir walks a directory and adds all supported ebook files.
// Errors per file are collected and returned alongside successful adds.
func (l *Library) AddDir(dir string) ([]*metadata.Book, []error) {
	var paths []string
	var errs []error

	err := filepath.WalkDir(dir, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			errs = append(errs, err)
			return nil
		}
		if d.IsDir() {
			return nil
		}

		ext := metadata.Format(strings.ToLower(strings.TrimPrefix(filepath.Ext(path), ".")))
		if _, ok := supportedFormats[ext]; ok {
			paths = append(paths, path)
		}
		return nil
	})
	if err != nil {
		errs = append(errs, err)
	}

	books, addErrs := l.AddPaths(paths)
	return books, append(errs, addErrs...)
}

// copyToLibrary copies srcPath into <root>/<Author>/<Title>/<Title>.<ext>.
// When overwrite is false and that path already exists, the destination
// is disambiguated ("<Title> (2).<ext>", "(3)", ...) instead of
// clobbering whatever is already there. overwrite=true is used only by an
// explicit user-initiated replace action.
func (l *Library) copyToLibrary(srcPath string, book *metadata.Book, ext metadata.Format, overwrite bool) (string, error) {
	author := "Unknown"
	if len(book.Authors) > 0 {
		author = sanitizeName(book.Authors[0])
	}
	title := sanitizeName(book.Title)

	destDir := filepath.Join(l.rootDir, author, title)
	if err := os.MkdirAll(destDir, 0755); err != nil {
		return "", err
	}

	destPath := filepath.Join(destDir, fmt.Sprintf("%s.%s", title, ext))
	if !overwrite {
		destPath = disambiguatePath(destPath)
	}

	if err := copyFile(srcPath, destPath); err != nil {
		return "", err
	}
	return destPath, nil
}

// disambiguatePath returns path unchanged if nothing exists there yet,
// otherwise appends " (2)", " (3)", ... before the extension until it
// finds one that's free.
func disambiguatePath(path string) string {
	if _, err := os.Stat(path); err != nil {
		return path
	}
	ext := filepath.Ext(path)
	base := strings.TrimSuffix(path, ext)
	for i := 2; ; i++ {
		candidate := fmt.Sprintf("%s (%d)%s", base, i, ext)
		if _, err := os.Stat(candidate); err != nil {
			return candidate
		}
	}
}

// --- helpers ---

func hashFile(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()

	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}
	return fmt.Sprintf("%x", h.Sum(nil)), nil
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()

	_, err = io.Copy(out, in)
	return err
}

// sanitizeName strips characters that are invalid in file/directory names.
func sanitizeName(s string) string {
	replacer := strings.NewReplacer(
		"/", "-", "\\", "-", ":", "-", "*", "-",
		"?", "", "\"", "", "<", "", ">", "", "|", "",
	)
	s = strings.TrimSpace(replacer.Replace(s))
	if s == "" {
		return "Unknown"
	}
	return s
}
