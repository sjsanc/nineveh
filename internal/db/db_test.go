package db

import (
	"database/sql"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"nineveh/internal/metadata"
)

func openTestDB(t *testing.T) *DB {
	t.Helper()
	d, err := Open(filepath.Join(t.TempDir(), "test.db"))
	require.NoError(t, err)
	t.Cleanup(func() { d.Close() })
	return d
}

func TestInsertAndGetBook(t *testing.T) {
	d := openTestDB(t)

	book := &metadata.Book{
		Title:     "Test Book",
		Authors:   []string{"Alice", "Bob"},
		Tags:      []string{"fiction", "test"},
		Publisher: "Test Press",
		Rating:    3,
	}

	id, err := d.InsertBook(book)
	require.NoError(t, err)
	assert.Positive(t, id)

	got, err := d.GetBook(id)
	require.NoError(t, err)
	assert.Equal(t, "Test Book", got.Title)
	assert.ElementsMatch(t, []string{"Alice", "Bob"}, got.Authors)
	assert.ElementsMatch(t, []string{"fiction", "test"}, got.Tags)
	assert.Equal(t, "Test Press", got.Publisher)
	assert.Equal(t, 3, got.Rating)
}

func TestGetBooks_OrderedByTitle(t *testing.T) {
	d := openTestDB(t)

	for _, title := range []string{"Book C", "Book A", "Book B"} {
		_, err := d.InsertBook(&metadata.Book{Title: title})
		require.NoError(t, err)
	}

	books, err := d.GetBooks()
	require.NoError(t, err)
	require.Len(t, books, 3)
	assert.Equal(t, "Book A", books[0].Title)
	assert.Equal(t, "Book B", books[1].Title)
	assert.Equal(t, "Book C", books[2].Title)
}

func TestUpdateBook_ReplacesAuthorsAndTags(t *testing.T) {
	d := openTestDB(t)

	id, err := d.InsertBook(&metadata.Book{
		Title:   "Original",
		Authors: []string{"Alice"},
		Tags:    []string{"old-tag"},
	})
	require.NoError(t, err)

	book, err := d.GetBook(id)
	require.NoError(t, err)

	book.Title = "Updated"
	book.Authors = []string{"Bob"}
	book.Tags = []string{"new-tag"}
	require.NoError(t, d.UpdateBook(book))

	got, err := d.GetBook(id)
	require.NoError(t, err)
	assert.Equal(t, "Updated", got.Title)
	assert.Equal(t, []string{"Bob"}, got.Authors)
	assert.Equal(t, []string{"new-tag"}, got.Tags)
}

func TestDeleteBook(t *testing.T) {
	d := openTestDB(t)

	id, err := d.InsertBook(&metadata.Book{Title: "To Delete"})
	require.NoError(t, err)

	require.NoError(t, d.DeleteBook(id))

	_, err = d.GetBook(id)
	assert.ErrorIs(t, err, sql.ErrNoRows)
}

func TestGetBookByHash(t *testing.T) {
	d := openTestDB(t)

	id, err := d.InsertBook(&metadata.Book{Title: "Hash Test"})
	require.NoError(t, err)

	bf := &metadata.BookFile{
		Path:   "/tmp/test.epub",
		Format: metadata.FormatEPUB,
		Size:   1234,
		Hash:   "abc123hash",
	}
	require.NoError(t, d.InsertFormat(id, bf))

	got, err := d.GetBookByHash("abc123hash")
	require.NoError(t, err)
	require.NotNil(t, got)
	assert.Equal(t, "Hash Test", got.Title)

	// Non-existent hash returns nil, no error
	none, err := d.GetBookByHash("nonexistent")
	require.NoError(t, err)
	assert.Nil(t, none)
}

func TestSearchBooks(t *testing.T) {
	d := openTestDB(t)

	_, err := d.InsertBook(&metadata.Book{Title: "Dune", Authors: []string{"Frank Herbert"}, Tags: []string{"sci-fi"}})
	require.NoError(t, err)
	_, err = d.InsertBook(&metadata.Book{Title: "Foundation", Authors: []string{"Isaac Asimov"}})
	require.NoError(t, err)

	t.Run("by title", func(t *testing.T) {
		results, err := d.SearchBooks("Dune")
		require.NoError(t, err)
		require.Len(t, results, 1)
		assert.Equal(t, "Dune", results[0].Title)
	})

	t.Run("by author", func(t *testing.T) {
		results, err := d.SearchBooks("Asimov")
		require.NoError(t, err)
		require.Len(t, results, 1)
		assert.Equal(t, "Foundation", results[0].Title)
	})

	t.Run("by tag", func(t *testing.T) {
		results, err := d.SearchBooks("sci-fi")
		require.NoError(t, err)
		require.Len(t, results, 1)
		assert.Equal(t, "Dune", results[0].Title)
	})

	t.Run("no match", func(t *testing.T) {
		results, err := d.SearchBooks("zzz-no-match")
		require.NoError(t, err)
		assert.Empty(t, results)
	})
}

func TestInsertFormat_DeduplicatesByHash(t *testing.T) {
	d := openTestDB(t)

	id, err := d.InsertBook(&metadata.Book{Title: "Book"})
	require.NoError(t, err)

	bf := &metadata.BookFile{Path: "/a.epub", Format: metadata.FormatEPUB, Size: 100, Hash: "deadbeef"}
	require.NoError(t, d.InsertFormat(id, bf))

	// Same hash should fail (UNIQUE constraint on formats.hash)
	err = d.InsertFormat(id, &metadata.BookFile{Path: "/b.epub", Format: metadata.FormatEPUB, Size: 100, Hash: "deadbeef"})
	require.Error(t, err)
}
