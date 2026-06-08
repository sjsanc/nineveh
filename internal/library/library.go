package library

import (
	"crypto/sha256"
	"errors"
	"fmt"
	"os"
	"path/filepath"

	"nineveh/internal/db"
	"nineveh/internal/metadata"
)

var ErrDuplicate = errors.New("book already in library")

type Library struct {
	db      *db.DB
	rootDir string
}

func New(d *db.DB, rootDir string) *Library {
	return &Library{db: d, rootDir: rootDir}
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

func (l *Library) DeleteBook(id int64) error {
	return l.db.DeleteBook(id)
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
