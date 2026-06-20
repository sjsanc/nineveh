//go:build darwin

package device

import (
	"fmt"
	"io"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"

	"nineveh/internal/metadata"
)

var kindleFormats = map[string]metadata.Format{
	"mobi": metadata.FormatMOBI,
	"azw":  metadata.FormatAZW,
	"azw3": metadata.FormatAZW3,
	"epub": metadata.FormatEPUB,
	"pdf":  metadata.FormatPDF,
}

var deviceParsers = map[metadata.Format]metadata.Parser{
	metadata.FormatEPUB: metadata.NewEPUBParser(),
	metadata.FormatMOBI: metadata.NewMOBIParser(),
	metadata.FormatAZW:  metadata.NewMOBIParser(),
	metadata.FormatAZW3: metadata.NewAZW3Parser(),
	metadata.FormatPDF:  metadata.NewPDFParser(),
}

type kindleDevice struct {
	id   string
	name string
	root string // e.g. "/Volumes/Kindle"
}

func (d *kindleDevice) ID() string   { return d.id }
func (d *kindleDevice) Name() string { return d.name }

func (d *kindleDevice) FreeSpace() (int64, error) {
	var st syscall.Statfs_t
	if err := syscall.Statfs(d.root, &st); err != nil {
		return 0, err
	}
	// Statfs_t.Bsize is int32 on Darwin (int64 on Linux), so both operands must be cast.
	return int64(st.Bavail) * int64(st.Bsize), nil
}

func (d *kindleDevice) ListBooks() ([]*metadata.BookFile, error) {
	docsPath := filepath.Join(d.root, "documents")
	var books []*metadata.BookFile
	filepath.WalkDir(docsPath, func(path string, entry fs.DirEntry, err error) error {
		if err != nil || entry.IsDir() {
			return nil
		}
		ext := strings.ToLower(strings.TrimPrefix(filepath.Ext(path), "."))
		format, ok := kindleFormats[ext]
		if !ok {
			return nil
		}
		info, err := entry.Info()
		if err != nil {
			return nil
		}
		bf := &metadata.BookFile{
			Path:   path,
			Format: format,
			Size:   info.Size(),
		}
		if parser, ok := deviceParsers[format]; ok {
			if book, err := parser.Parse(path); err == nil {
				bf.Title = book.Title
				bf.Authors = book.Authors
			}
		}
		books = append(books, bf)
		return nil
	})
	return books, nil
}

func (d *kindleDevice) SendBook(book *metadata.Book, format metadata.Format) error {
	var srcPath string
	for _, f := range book.Formats {
		if f.Format == format {
			srcPath = f.Path
			break
		}
	}
	if srcPath == "" {
		return fmt.Errorf("format %s not found for book %d", format, book.ID)
	}
	destPath := filepath.Join(d.root, "documents", filepath.Base(srcPath))
	return copyFile(srcPath, destPath)
}

func (d *kindleDevice) RemoveBook(path string) error {
	return os.Remove(path)
}

func (d *kindleDevice) Eject() error {
	out, err := exec.Command("diskutil", "eject", d.root).CombinedOutput()
	if err != nil {
		return fmt.Errorf("eject %s: %w: %s", d.root, err, strings.TrimSpace(string(out)))
	}
	return nil
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
