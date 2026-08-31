// Package metadata reads embedded ebook metadata into the canonical Book
// model. Each format has its own parser (epub.go, mobi.go, azw3.go, pdf.go)
// behind the Parser interface; opf.go holds the OPF/XML parsing shared by
// the EPUB parser and the Calibre importer (internal/library/calibre.go).
//
// golden_test.go checks each parser's output against real ebook fixtures
// under testdata/ — see testdata/README.md for where they came from and how
// to regenerate the derived formats.
package metadata

type Format string

const (
	FormatEPUB Format = "epub"
	FormatMOBI Format = "mobi"
	FormatAZW  Format = "azw"
	FormatAZW3 Format = "azw3"
	FormatPDF  Format = "pdf"
)

type BookFile struct {
	Path    string
	Format  Format
	Size    int64
	Hash    string   // sha256, for deduplication
	Missing bool     // file not found at stored path
	Title   string   // populated for device files, empty for library files
	Authors []string // populated for device files, empty for library files
}

type Book struct {
	ID            int64
	Title         string
	Authors       []string
	Publisher     string
	Series        string
	SeriesIndex   float64
	Language      string
	Description   string
	Tags          []string
	Rating        int
	CoverPath     string
	CoverData     []byte
	DateAdded     string // RFC 3339
	DatePublished string // RFC 3339, may be empty
	ISBN          string
	IsRead        bool
	Formats       []BookFile
}

// Parser is implemented by format-specific parsers.
type Parser interface {
	Parse(path string) (*Book, error)
}
