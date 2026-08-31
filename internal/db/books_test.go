package db

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"nineveh/internal/metadata"
)

func TestNormalizeISBN(t *testing.T) {
	cases := map[string]string{
		"978-0-14-143951-8": "9780141439518",
		"9780141439518":     "9780141439518",
		"0-14-143951-x":     "014143951X",
		"":                  "",
	}
	for in, want := range cases {
		assert.Equal(t, want, normalizeISBN(in), "input %q", in)
	}
}

func TestGetBookByISBN(t *testing.T) {
	d := openTestDB(t)

	id, err := d.InsertBook(&metadata.Book{Title: "Has ISBN", ISBN: "978-0-14-143951-8"})
	require.NoError(t, err)

	// Different hyphenation should still match.
	got, err := d.GetBookByISBN("9780141439518")
	require.NoError(t, err)
	require.NotNil(t, got)
	assert.Equal(t, id, got.ID)

	// No match.
	got, err = d.GetBookByISBN("0000000000")
	require.NoError(t, err)
	assert.Nil(t, got)

	// Empty input never matches, even if some book has an empty ISBN.
	_, err = d.InsertBook(&metadata.Book{Title: "No ISBN"})
	require.NoError(t, err)
	got, err = d.GetBookByISBN("")
	require.NoError(t, err)
	assert.Nil(t, got)
}

func TestGetBookByTitleAuthor(t *testing.T) {
	d := openTestDB(t)

	id, err := d.InsertBook(&metadata.Book{Title: "Some Title", Authors: []string{"Some Author"}})
	require.NoError(t, err)

	// Case-insensitive match.
	got, err := d.GetBookByTitleAuthor("some title", "SOME AUTHOR")
	require.NoError(t, err)
	require.NotNil(t, got)
	assert.Equal(t, id, got.ID)

	// Title matches but author doesn't.
	got, err = d.GetBookByTitleAuthor("Some Title", "Nobody")
	require.NoError(t, err)
	assert.Nil(t, got)

	// Empty title or author never matches.
	got, err = d.GetBookByTitleAuthor("", "Some Author")
	require.NoError(t, err)
	assert.Nil(t, got)
}

func TestReplaceFormat(t *testing.T) {
	d := openTestDB(t)

	id, err := d.InsertBook(&metadata.Book{Title: "Replace Me"})
	require.NoError(t, err)
	require.NoError(t, d.InsertFormat(id, &metadata.BookFile{
		Path: "/old/path.epub", Format: "epub", Size: 100, Hash: "old-hash",
	}))

	err = d.ReplaceFormat("old-hash", &metadata.BookFile{
		Path: "/new/path.epub", Format: "epub", Size: 200, Hash: "new-hash",
	})
	require.NoError(t, err)

	got, err := d.GetBook(id)
	require.NoError(t, err)
	require.Len(t, got.Formats, 1)
	assert.Equal(t, "new-hash", got.Formats[0].Hash)
	assert.Equal(t, int64(200), got.Formats[0].Size)

	err = d.ReplaceFormat("no-such-hash", &metadata.BookFile{Path: "x", Format: "epub", Hash: "y"})
	assert.Error(t, err)
}
