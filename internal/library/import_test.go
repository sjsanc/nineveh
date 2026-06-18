package library

import (
	"archive/zip"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"nineveh/internal/db"
)

// makeEPUB writes a minimal valid EPUB to dir and returns its path.
func makeEPUB(t *testing.T, dir, title, author string) string {
	t.Helper()
	path := filepath.Join(dir, title+".epub")
	f, err := os.Create(path)
	require.NoError(t, err)
	defer f.Close()

	w := zip.NewWriter(f)
	defer w.Close()

	addZipEntry(t, w, "META-INF/container.xml", `<?xml version="1.0" encoding="UTF-8"?>
<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0">
  <rootfiles>
    <rootfile full-path="content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`)

	addZipEntry(t, w, "content.opf", fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>%s</dc:title>
    <dc:creator>%s</dc:creator>
  </metadata>
  <manifest/>
  <spine/>
</package>`, title, author))

	return path
}

func addZipEntry(t *testing.T, w *zip.Writer, name, content string) {
	t.Helper()
	fw, err := w.Create(name)
	require.NoError(t, err)
	_, err = fw.Write([]byte(content))
	require.NoError(t, err)
}

func openTestLib(t *testing.T) *Library {
	t.Helper()
	d, err := db.Open(filepath.Join(t.TempDir(), "test.db"))
	require.NoError(t, err)
	t.Cleanup(func() { d.Close() })
	return New(d, t.TempDir())
}

func TestImportFile_Basic(t *testing.T) {
	lib := openTestLib(t)
	epub := makeEPUB(t, t.TempDir(), "Test Book", "Test Author")

	book, err := lib.ImportFile(epub)
	require.NoError(t, err)
	assert.Equal(t, "Test Book", book.Title)
	assert.Equal(t, []string{"Test Author"}, book.Authors)
	assert.Positive(t, book.ID)
	require.Len(t, book.Formats, 1)
	assert.FileExists(t, book.Formats[0].Path)
}

func TestImportFile_Deduplication(t *testing.T) {
	lib := openTestLib(t)
	epub := makeEPUB(t, t.TempDir(), "Dup Book", "Dup Author")

	_, err := lib.ImportFile(epub)
	require.NoError(t, err)

	_, err = lib.ImportFile(epub)
	require.Error(t, err)
	assert.True(t, errors.Is(err, ErrDuplicate))
}

func TestImportFile_EmptyTitleFallsBackToFilename(t *testing.T) {
	lib := openTestLib(t)
	dir := t.TempDir()

	// EPUB with no <dc:title> — title should come from the filename.
	path := filepath.Join(dir, "my-book.epub")
	f, err := os.Create(path)
	require.NoError(t, err)
	w := zip.NewWriter(f)
	addZipEntry(t, w, "META-INF/container.xml", `<?xml version="1.0" encoding="UTF-8"?>
<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0">
  <rootfiles>
    <rootfile full-path="content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`)
	addZipEntry(t, w, "content.opf", `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/"/>
  <manifest/><spine/>
</package>`)
	w.Close()
	f.Close()

	book, err := lib.ImportFile(path)
	require.NoError(t, err)
	assert.Equal(t, "my-book", book.Title)
}

func TestImportFile_UnsupportedFormat(t *testing.T) {
	lib := openTestLib(t)
	f := filepath.Join(t.TempDir(), "book.txt")
	require.NoError(t, os.WriteFile(f, []byte("not an ebook"), 0644))

	_, err := lib.ImportFile(f)
	require.Error(t, err)
}

func TestImportDir_CollectsErrors(t *testing.T) {
	lib := openTestLib(t)
	srcDir := t.TempDir()

	// One valid EPUB
	makeEPUB(t, srcDir, "Valid Book", "Author")
	// One invalid EPUB (not a valid ZIP)
	require.NoError(t, os.WriteFile(filepath.Join(srcDir, "broken.epub"), []byte("not a zip"), 0644))

	books, errs := lib.ImportDir(srcDir)
	assert.Len(t, books, 1)
	assert.Len(t, errs, 1)
}

func TestImportFromCalibre_Basic(t *testing.T) {
	lib := openTestLib(t)
	calibreDir := t.TempDir()

	// Calibre library structure: <library>/<Author>/<Title>/metadata.opf + ebook file
	bookDir := filepath.Join(calibreDir, "Test Author", "My Book")
	require.NoError(t, os.MkdirAll(bookDir, 0755))

	opf := `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>My Book</dc:title>
    <dc:creator>Test Author</dc:creator>
  </metadata>
</package>`
	require.NoError(t, os.WriteFile(filepath.Join(bookDir, "metadata.opf"), []byte(opf), 0644))

	// The Calibre importer hashes and copies the file but does not parse it
	require.NoError(t, os.WriteFile(filepath.Join(bookDir, "My_Book.epub"), []byte("dummy epub content"), 0644))

	books, errs := lib.ImportFromCalibre(calibreDir)
	assert.Len(t, errs, 0)
	require.Len(t, books, 1)
	assert.Equal(t, "My Book", books[0].Title)
}
