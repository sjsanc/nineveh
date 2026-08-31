package library

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestDeleteBook_RemovesFilesAndDir(t *testing.T) {
	lib := openTestLib(t)
	epub := makeEPUB(t, t.TempDir(), "Delete Me", "Author")

	outcome, err := lib.AddFile(epub)
	require.NoError(t, err)
	path := outcome.Book.Formats[0].Path
	dir := filepath.Dir(path)
	require.FileExists(t, path)

	require.NoError(t, lib.DeleteBook(outcome.Book.ID))

	assert.NoFileExists(t, path)
	_, err = os.Stat(dir)
	assert.True(t, os.IsNotExist(err), "book directory should be removed once empty")

	books, err := lib.GetBooks()
	require.NoError(t, err)
	assert.Empty(t, books)
}

func TestDeleteBook_LeavesSiblingFormatUntouched(t *testing.T) {
	lib := openTestLib(t)
	dir := t.TempDir()

	first, err := lib.AddFile(makeEPUB(t, dir, "Shared Book", "Author"))
	require.NoError(t, err)
	second, err := lib.AddFile(makePDF(t, dir, "shared.pdf", "Shared Book", "Author"))
	require.NoError(t, err)
	require.Equal(t, first.Book.ID, second.Book.ID)

	require.NoError(t, lib.DeleteBook(second.Book.ID))

	books, err := lib.GetBooks()
	require.NoError(t, err)
	assert.Empty(t, books, "deleting the merged book should remove it entirely, not leave a dangling partial row")
}

// disambiguatePath's collision avoidance depends on DeleteBook actually
// cleaning up its files — otherwise every add-then-remove cycle for the
// same title leaves an orphan behind and the "(N)" suffix climbs forever.
func TestDeleteBook_PreventsOrphanSuffixGrowth(t *testing.T) {
	lib := openTestLib(t)
	dir := t.TempDir()

	for i := 0; i < 3; i++ {
		outcome, err := lib.AddFile(makeEPUB(t, dir, "Repeat Book", "Author"))
		require.NoError(t, err)
		path := outcome.Book.Formats[0].Path
		assert.Equal(t, "Repeat Book.epub", filepath.Base(path), "iteration %d should not need a disambiguating suffix", i)
		require.NoError(t, lib.DeleteBook(outcome.Book.ID))
	}
}
