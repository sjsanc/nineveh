package device

import "nineveh/internal/metadata"

// Device represents a connected ebook reader.
type Device interface {
	ID() string
	Name() string
	FreeSpace() (int64, error)
	ListBooks() ([]*metadata.BookFile, error)
	SendBook(book *metadata.Book, format metadata.Format) error
	RemoveBook(path string) error
}

// DeviceInfo is a JSON-serializable summary of a connected device.
type DeviceInfo struct {
	ID        string `json:"ID"`
	Name      string `json:"Name"`
	FreeSpace int64  `json:"FreeSpace"`
}
