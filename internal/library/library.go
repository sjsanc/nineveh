package library

import (
	"crypto/sha256"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"

	"nineveh/internal/db"
	"nineveh/internal/metadata"
)

var ErrDuplicate = errors.New("book already in library")

type Library struct {
	db      *db.DB
	rootDir string
	mu      sync.Mutex // guards the match-check-through-write critical section of AddFile/ResolveConflict
}

func New(d *db.DB, rootDir string) *Library {
	return &Library{db: d, rootDir: rootDir}
}

// ConflictAction is the user's chosen resolution for a FormatConflict.
type ConflictAction string

const (
	ConflictKeepExisting ConflictAction = "keep_existing"
	ConflictReplace      ConflictAction = "replace"
	ConflictKeepBoth     ConflictAction = "keep_both"
)

// AddOutcome is returned by AddFile. Exactly one of Book/Conflict is set.
type AddOutcome struct {
	Book     *metadata.Book
	Conflict *FormatConflict
}

// FormatConflict describes a same-format collision between an incoming
// file and an already-matched existing book, requiring user resolution.
type FormatConflict struct {
	BookID       int64
	BookTitle    string
	Format       metadata.Format
	ExistingPath string
	ExistingSize int64
	ExistingHash string
	IncomingPath string // original source path, reused by ResolveConflict
	IncomingSize int64
	IncomingHash string
}

func (l *Library) GetBooks() ([]*metadata.Book, error) {
	return l.db.GetBooks()
}

func (l *Library) GetBook(id int64) (*metadata.Book, error) {
	return l.db.GetBook(id)
}

func (l *Library) UpdateBook(book *metadata.Book) error {
	return l.db.UpdateBook(book)
}

// DeleteBook removes a book from the database and best-effort deletes its
// format files (and the book's now-empty library directory) from disk.
// The DB row is the source of truth: if it's gone, the book is gone, even
// if a file happened to survive cleanup (e.g. a permissions error).
func (l *Library) DeleteBook(id int64) error {
	book, err := l.db.GetBook(id)
	if err != nil {
		return fmt.Errorf("get book: %w", err)
	}

	if err := l.db.DeleteBook(id); err != nil {
		return err
	}

	var dir string
	for _, f := range book.Formats {
		if dir == "" {
			dir = filepath.Dir(f.Path)
		}
		os.Remove(f.Path)
	}
	if dir != "" {
		os.Remove(dir) // only succeeds if now empty; ignored otherwise
	}

	return nil
}

func (l *Library) Search(query string) ([]*metadata.Book, error) {
	return l.db.SearchBooks(query)
}

func (l *Library) ResetLibrary() error {
	if err := l.db.DeleteAllBooks(); err != nil {
		return err
	}
	return os.RemoveAll(l.rootDir)
}

// SaveCoverFromBytes saves raw image bytes to .covers/ and returns the cover path.
// The caller is responsible for persisting it via UpdateBook.
func (l *Library) SaveCoverFromBytes(data []byte) (string, error) {
	hash := fmt.Sprintf("%x", sha256.Sum256(data))
	return l.writeCover(data, hash)
}

func (l *Library) writeCover(data []byte, hash string) (string, error) {
	coverDir := filepath.Join(l.rootDir, ".covers")
	if err := os.MkdirAll(coverDir, 0755); err != nil {
		return "", err
	}
	if err := os.WriteFile(filepath.Join(coverDir, hash+".jpg"), data, 0644); err != nil {
		return "", err
	}
	return "/covers/" + hash + ".jpg", nil
}
