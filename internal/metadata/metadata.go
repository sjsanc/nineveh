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
	Hash    string // sha256, for deduplication
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
