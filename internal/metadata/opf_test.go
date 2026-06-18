package metadata

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestOPF_DateParsing(t *testing.T) {
	cases := []struct {
		name string
		date string
		want string
	}{
		{"RFC3339", "2003-06-15T00:00:00Z", "2003-06-15T00:00:00Z"},
		{"YYYY-MM-DD", "2003-06-15", "2003-06-15T00:00:00Z"},
		{"YYYY", "2003", "2003-01-01T00:00:00Z"},
		{"empty", "", ""},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			book := (&xmlPackage{Metadata: xmlMetadata{Titles: []string{"T"}, Date: tc.date}}).toBook()
			assert.Equal(t, tc.want, book.DatePublished)
		})
	}
}

func TestOPF_CalibreRating(t *testing.T) {
	cases := []struct {
		raw  string
		want int
	}{
		{"10", 5}, {"8", 4}, {"6", 3}, {"0", 0},
	}
	for _, tc := range cases {
		t.Run(tc.raw, func(t *testing.T) {
			pkg := &xmlPackage{Metadata: xmlMetadata{
				Titles: []string{"T"},
				Metas:  []xmlMeta{{Name: "calibre:rating", Content: tc.raw}},
			}}
			assert.Equal(t, tc.want, pkg.toBook().Rating)
		})
	}
}

func TestOPF_CalibreTimestamp(t *testing.T) {
	pkg := &xmlPackage{Metadata: xmlMetadata{
		Titles: []string{"T"},
		Metas:  []xmlMeta{{Name: "calibre:timestamp", Content: "2021-03-15T12:00:00Z"}},
	}}
	assert.Equal(t, "2021-03-15T12:00:00Z", pkg.toBook().DateAdded)
}

func TestOPF_ISBNExtraction(t *testing.T) {
	pkg := &xmlPackage{Metadata: xmlMetadata{
		Titles: []string{"T"},
		Identifiers: []xmlIdentifier{
			{Scheme: "UUID", Value: "abc-def"},
			{Scheme: "ISBN", Value: "9781234567890"},
		},
	}}
	assert.Equal(t, "9781234567890", pkg.toBook().ISBN)
}

func TestOPF_SeriesOPF3(t *testing.T) {
	pkg := &xmlPackage{Metadata: xmlMetadata{
		Titles: []string{"T"},
		Metas: []xmlMeta{
			{Property: "belongs-to-collection", Value: "My Series"},
			{Property: "group-position", Value: "2"},
		},
	}}
	book := pkg.toBook()
	assert.Equal(t, "My Series", book.Series)
	assert.Equal(t, 2.0, book.SeriesIndex)
}

func TestParseOPFFile(t *testing.T) {
	content := `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:title>Sample Book</dc:title>
    <dc:creator>Jane Doe</dc:creator>
    <dc:publisher>Test Publisher</dc:publisher>
    <dc:date>2020</dc:date>
    <dc:identifier opf:scheme="ISBN">9780000000001</dc:identifier>
    <meta name="calibre:series" content="Test Series"/>
    <meta name="calibre:series_index" content="1"/>
    <meta name="calibre:rating" content="6"/>
  </metadata>
</package>`

	f := filepath.Join(t.TempDir(), "test.opf")
	require.NoError(t, os.WriteFile(f, []byte(content), 0644))

	book, err := ParseOPFFile(f)
	require.NoError(t, err)
	assert.Equal(t, "Sample Book", book.Title)
	assert.Equal(t, []string{"Jane Doe"}, book.Authors)
	assert.Equal(t, "Test Publisher", book.Publisher)
	assert.Equal(t, "2020-01-01T00:00:00Z", book.DatePublished)
	assert.Equal(t, "9780000000001", book.ISBN)
	assert.Equal(t, "Test Series", book.Series)
	assert.Equal(t, 1.0, book.SeriesIndex)
	assert.Equal(t, 3, book.Rating) // 6/2 = 3
}

func TestParseOPFFile_NotFound(t *testing.T) {
	_, err := ParseOPFFile(filepath.Join(t.TempDir(), "missing.opf"))
	require.Error(t, err)
}
