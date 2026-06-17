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

type mtpDevice struct {
	id         string
	name       string
	mountPoint string
	partDev    string // e.g. "/dev/sda1" — used for udisksctl unmount
	blockDev   string // e.g. "/dev/sda"  — used for udisksctl power-off
}

func (d *mtpDevice) ID() string   { return d.id }
func (d *mtpDevice) Name() string { return d.name }

func (d *mtpDevice) FreeSpace() (int64, error) {
	if d.mountPoint == "" {
		return 0, nil
	}
	var stat syscall.Statfs_t
	if err := syscall.Statfs(d.mountPoint, &stat); err != nil {
		return 0, err
	}
	return int64(stat.Bavail) * stat.Bsize, nil
}

func (d *mtpDevice) ListBooks() ([]*metadata.BookFile, error) {
	if d.mountPoint == "" {
		return nil, nil
	}
	docsPath := filepath.Join(d.mountPoint, "documents")

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

func (d *mtpDevice) SendBook(book *metadata.Book, format metadata.Format) error {
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
	destPath := filepath.Join(d.mountPoint, "documents", filepath.Base(srcPath))
	return copyFile(srcPath, destPath)
}

func (d *mtpDevice) RemoveBook(path string) error {
	return os.Remove(path)
}

func (d *mtpDevice) Eject() error {
	if d.blockDev == "" {
		return fmt.Errorf("cannot eject: block device unknown")
	}
	if d.partDev != "" {
		cmd := exec.Command("udisksctl", "unmount", "-b", d.partDev, "--no-user-interaction")
		if out, err := cmd.CombinedOutput(); err != nil {
			return fmt.Errorf("unmount failed: %s: %w", strings.TrimSpace(string(out)), err)
		}
	}
	cmd := exec.Command("udisksctl", "power-off", "-b", d.blockDev, "--no-user-interaction")
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("eject failed: %s: %w", strings.TrimSpace(string(out)), err)
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
