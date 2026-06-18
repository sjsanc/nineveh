//go:build windows

package device

import (
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"strings"

	"golang.org/x/sys/windows"
	"nineveh/internal/metadata"
)

// IOCTL codes for volume lock, dismount, and eject.
const (
	fsctlLockVolume       = 0x00090018
	fsctlDismountVolume   = 0x00090020
	ioctlStorageEjectMedia = 0x2D4808
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
	root string // e.g. "E:\"
}

func (d *kindleDevice) ID() string   { return d.id }
func (d *kindleDevice) Name() string { return d.name }

func (d *kindleDevice) FreeSpace() (int64, error) {
	rootPtr, err := windows.UTF16PtrFromString(d.root)
	if err != nil {
		return 0, err
	}
	var free, total, totalFree uint64
	if err := windows.GetDiskFreeSpaceEx(rootPtr, &free, &total, &totalFree); err != nil {
		return 0, err
	}
	return int64(free), nil
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
	// Open the volume via UNC device path (e.g. \\.\E:).
	volPath := `\\.\` + d.root[:2]
	volPtr, err := windows.UTF16PtrFromString(volPath)
	if err != nil {
		return err
	}
	h, err := windows.CreateFile(
		volPtr,
		windows.GENERIC_READ|windows.GENERIC_WRITE,
		windows.FILE_SHARE_READ|windows.FILE_SHARE_WRITE,
		nil,
		windows.OPEN_EXISTING,
		0,
		0,
	)
	if err != nil {
		return fmt.Errorf("open volume %s: %w", volPath, err)
	}
	defer windows.CloseHandle(h)

	var n uint32
	_ = windows.DeviceIoControl(h, fsctlLockVolume, nil, 0, nil, 0, &n, nil)
	_ = windows.DeviceIoControl(h, fsctlDismountVolume, nil, 0, nil, 0, &n, nil)
	if err := windows.DeviceIoControl(h, ioctlStorageEjectMedia, nil, 0, nil, 0, &n, nil); err != nil {
		return fmt.Errorf("eject %s: %w", d.root, err)
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
