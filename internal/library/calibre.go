package library

import (
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"

	"nineveh/internal/metadata"
)

// ImportFromCalibre walks a Calibre library directory, finding each book via its
// metadata.opf file and importing all supported formats into the nineveh library.
func (l *Library) ImportFromCalibre(libraryPath string) ([]*metadata.Book, []error) {
	var books []*metadata.Book
	var errs []error

	err := filepath.WalkDir(libraryPath, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			errs = append(errs, err)
			return nil
		}
		if d.IsDir() || d.Name() != "metadata.opf" {
			return nil
		}

		book, bookErrs := l.importCalibreBook(path, filepath.Dir(path))
		if book != nil {
			books = append(books, book)
		}
		errs = append(errs, bookErrs...)
		return nil
	})
	if err != nil {
		errs = append(errs, err)
	}

	return books, errs
}

func (l *Library) importCalibreBook(opfPath, bookDir string) (*metadata.Book, []error) {
	var errs []error

	book, err := metadata.ParseOPFFile(opfPath)
	if err != nil {
		return nil, []error{fmt.Errorf("%s: parse OPF: %w", filepath.Base(bookDir), err)}
	}

	entries, err := os.ReadDir(bookDir)
	if err != nil {
		return nil, []error{fmt.Errorf("%s: read dir: %w", filepath.Base(bookDir), err)}
	}

	type formatEntry struct {
		path   string
		format metadata.Format
		hash   string
	}

	var newFormats []formatEntry
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		ext := metadata.Format(strings.ToLower(strings.TrimPrefix(filepath.Ext(e.Name()), ".")))
		if _, ok := supportedFormats[ext]; !ok {
			continue
		}
		fPath := filepath.Join(bookDir, e.Name())
		hash, err := hashFile(fPath)
		if err != nil {
			errs = append(errs, fmt.Errorf("%s: hash %s: %w", filepath.Base(bookDir), e.Name(), err))
			continue
		}
		existing, _ := l.db.GetBookByHash(hash)
		if existing != nil {
			continue
		}
		newFormats = append(newFormats, formatEntry{path: fPath, format: ext, hash: hash})
	}

	if len(newFormats) == 0 {
		return nil, errs
	}

	if data, err := os.ReadFile(filepath.Join(bookDir, "cover.jpg")); err == nil {
		book.CoverData = data
	}

	if book.Title == "" {
		book.Title = filepath.Base(bookDir)
	}

	if len(book.CoverData) > 0 {
		if cp, err := l.writeCover(book.CoverData, newFormats[0].hash); err == nil {
			book.CoverPath = cp
		}
		book.CoverData = nil
	}

	id, err := l.db.InsertBook(book)
	if err != nil {
		errs = append(errs, fmt.Errorf("%s: insert book: %w", book.Title, err))
		return nil, errs
	}
	book.ID = id

	for _, f := range newFormats {
		destPath, err := l.copyToLibrary(f.path, book, f.format)
		if err != nil {
			errs = append(errs, fmt.Errorf("%s: copy %s: %w", book.Title, f.format, err))
			continue
		}
		size := int64(0)
		if info, err := os.Stat(destPath); err == nil {
			size = info.Size()
		}
		bf := &metadata.BookFile{
			Path:   destPath,
			Format: f.format,
			Size:   size,
			Hash:   f.hash,
		}
		if err := l.db.InsertFormat(id, bf); err != nil {
			errs = append(errs, fmt.Errorf("%s: insert format %s: %w", book.Title, f.format, err))
			continue
		}
		book.Formats = append(book.Formats, *bf)
	}

	return book, errs
}
