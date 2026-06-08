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

// ImportFile imports a single ebook file into the library.
// Returns the book if it was imported, or an error.
// If the file is already in the library (by hash), ErrDuplicate is returned.
func (l *Library) ImportFile(srcPath string) (*metadata.Book, error) {
	ext := metadata.Format(strings.ToLower(strings.TrimPrefix(filepath.Ext(srcPath), ".")))
	parser, ok := supportedFormats[ext]
	if !ok {
		return nil, fmt.Errorf("unsupported format: %s", ext)
	}

	hash, err := hashFile(srcPath)
	if err != nil {
		return nil, fmt.Errorf("hash file: %w", err)
	}

	existing, err := l.db.GetBookByHash(hash)
	if err != nil {
		return nil, fmt.Errorf("check duplicate: %w", err)
	}
	if existing != nil {
		return nil, fmt.Errorf("%w: %s", ErrDuplicate, existing.Title)
	}

	book, err := parser.Parse(srcPath)
	if err != nil {
		return nil, fmt.Errorf("parse metadata: %w", err)
	}

	if book.Title == "" {
		book.Title = strings.TrimSuffix(filepath.Base(srcPath), filepath.Ext(srcPath))
	}
	book.DateAdded = "" // always stamp the Nineveh import time, not any embedded timestamp

	destPath, err := l.copyToLibrary(srcPath, book, ext)
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

// ImportDir walks a directory and imports all supported ebook files.
// Errors per file are collected and returned alongside successful imports.
func (l *Library) ImportDir(dir string) ([]*metadata.Book, []error) {
	var books []*metadata.Book
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
		if _, ok := supportedFormats[ext]; !ok {
			return nil
		}

		book, err := l.ImportFile(path)
		if err != nil {
			errs = append(errs, fmt.Errorf("%s: %w", filepath.Base(path), err))
			return nil
		}
		books = append(books, book)
		return nil
	})
	if err != nil {
		errs = append(errs, err)
	}

	return books, errs
}

// copyToLibrary copies the source file into the library directory structure:
// <root>/<Author>/<Title>/<Title>.<ext>
func (l *Library) copyToLibrary(srcPath string, book *metadata.Book, ext metadata.Format) (string, error) {
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

	if err := copyFile(srcPath, destPath); err != nil {
		return "", err
	}
	return destPath, nil
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
