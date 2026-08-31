package metadata

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"flag"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/require"
)

// Regenerate golden files after an intentional parser change:
//
//	go test ./internal/metadata/... -run TestParsers_Golden -update
var update = flag.Bool("update", false, "write golden files instead of comparing against them")

var goldenParsers = map[Format]Parser{
	FormatEPUB: NewEPUBParser(),
	FormatMOBI: NewMOBIParser(),
	FormatAZW3: NewAZW3Parser(),
	FormatPDF:  NewPDFParser(),
}

// goldenBook mirrors Book but swaps the raw cover bytes for a hash so golden
// files stay small and diffable instead of embedding base64 image data.
type goldenBook struct {
	Title         string   `json:"title"`
	Authors       []string `json:"authors,omitempty"`
	Publisher     string   `json:"publisher,omitempty"`
	Series        string   `json:"series,omitempty"`
	SeriesIndex   float64  `json:"seriesIndex,omitempty"`
	Language      string   `json:"language,omitempty"`
	Description   string   `json:"description,omitempty"`
	Tags          []string `json:"tags,omitempty"`
	Rating        int      `json:"rating,omitempty"`
	CoverSHA256   string   `json:"coverSha256,omitempty"`
	DateAdded     string   `json:"dateAdded,omitempty"`
	DatePublished string   `json:"datePublished,omitempty"`
	ISBN          string   `json:"isbn,omitempty"`
}

func toGolden(b *Book) goldenBook {
	g := goldenBook{
		Title:         b.Title,
		Authors:       b.Authors,
		Publisher:     b.Publisher,
		Series:        b.Series,
		SeriesIndex:   b.SeriesIndex,
		Language:      b.Language,
		Description:   b.Description,
		Tags:          b.Tags,
		Rating:        b.Rating,
		DateAdded:     b.DateAdded,
		DatePublished: b.DatePublished,
		ISBN:          b.ISBN,
	}
	if len(b.CoverData) > 0 {
		sum := sha256.Sum256(b.CoverData)
		g.CoverSHA256 = hex.EncodeToString(sum[:])
	}
	return g
}

// TestParsers_Golden runs each format parser against every fixture under
// testdata/<format>/ and compares the result to a checked-in golden file.
func TestParsers_Golden(t *testing.T) {
	for format, parser := range goldenParsers {
		t.Run(string(format), func(t *testing.T) {
			dir := filepath.Join("testdata", string(format))
			entries, err := os.ReadDir(dir)
			require.NoError(t, err)

			for _, entry := range entries {
				name := entry.Name()
				if entry.IsDir() || filepath.Ext(name) != "."+string(format) {
					continue
				}

				t.Run(name, func(t *testing.T) {
					fixturePath := filepath.Join(dir, name)
					book, err := parser.Parse(fixturePath)
					require.NoError(t, err)

					got, err := json.MarshalIndent(toGolden(book), "", "  ")
					require.NoError(t, err)
					got = append(got, '\n')

					goldenPath := fixturePath + ".golden.json"

					if *update {
						require.NoError(t, os.WriteFile(goldenPath, got, 0644))
						return
					}

					want, err := os.ReadFile(goldenPath)
					require.NoError(t, err, "golden file missing — run with -update to create it")
					require.JSONEq(t, string(want), string(got))
				})
			}
		})
	}
}
