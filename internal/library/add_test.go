package library

import (
	"archive/zip"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"nineveh/internal/db"
	"nineveh/internal/metadata"
)

// makeEPUB writes a minimal valid EPUB to dir and returns its path.
func makeEPUB(t *testing.T, dir, title, author string) string {
	t.Helper()
	return makeEPUBOpts(t, dir, epubOpts{filename: title + ".epub", title: title, author: author})
}

// epubOpts configures makeEPUBOpts. marker adds a small extra zip entry so
// two otherwise-identical-metadata EPUBs still hash differently.
type epubOpts struct {
	filename string
	title    string
	author   string
	isbn     string
	marker   string
}

func makeEPUBOpts(t *testing.T, dir string, o epubOpts) string {
	t.Helper()
	path := filepath.Join(dir, o.filename)
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

	identifier := ""
	if o.isbn != "" {
		identifier = fmt.Sprintf(`<dc:identifier opf:scheme="ISBN">%s</dc:identifier>`, o.isbn)
	}
	addZipEntry(t, w, "content.opf", fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" xmlns:opf="http://www.idpf.org/2007/opf" version="2.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>%s</dc:title>
    <dc:creator>%s</dc:creator>
    %s
  </metadata>
  <manifest/>
  <spine/>
</package>`, o.title, o.author, identifier))

	if o.marker != "" {
		addZipEntry(t, w, "marker.txt", o.marker)
	}

	return path
}

// makePDF writes a minimal PDF with a /Title and /Author in its Info dict.
// The PDF parser falls back to a linear scan for "N G obj" when it can't
// parse a proper xref table, so a real cross-reference section isn't needed.
func makePDF(t *testing.T, dir, filename, title, author string) string {
	t.Helper()
	path := filepath.Join(dir, filename)
	content := fmt.Sprintf(`%%PDF-1.4
1 0 obj
<< /Title (%s) /Author (%s) >>
endobj
trailer
<< /Info 1 0 R >>
startxref
0
%%%%EOF`, title, author)
	require.NoError(t, os.WriteFile(path, []byte(content), 0644))
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

func TestAddFile_Basic(t *testing.T) {
	lib := openTestLib(t)
	epub := makeEPUB(t, t.TempDir(), "Test Book", "Test Author")

	outcome, err := lib.AddFile(epub)
	require.NoError(t, err)
	require.Nil(t, outcome.Conflict)
	book := outcome.Book
	assert.Equal(t, "Test Book", book.Title)
	assert.Equal(t, []string{"Test Author"}, book.Authors)
	assert.Positive(t, book.ID)
	require.Len(t, book.Formats, 1)
	assert.FileExists(t, book.Formats[0].Path)
}

func TestAddFile_Deduplication(t *testing.T) {
	lib := openTestLib(t)
	epub := makeEPUB(t, t.TempDir(), "Dup Book", "Dup Author")

	_, err := lib.AddFile(epub)
	require.NoError(t, err)

	_, err = lib.AddFile(epub)
	require.Error(t, err)
	assert.True(t, errors.Is(err, ErrDuplicate))
}

func TestAddFile_EmptyTitleFallsBackToFilename(t *testing.T) {
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

	outcome, err := lib.AddFile(path)
	require.NoError(t, err)
	assert.Equal(t, "my-book", outcome.Book.Title)
}

func TestAddFile_UnsupportedFormat(t *testing.T) {
	lib := openTestLib(t)
	f := filepath.Join(t.TempDir(), "book.txt")
	require.NoError(t, os.WriteFile(f, []byte("not an ebook"), 0644))

	_, err := lib.AddFile(f)
	require.Error(t, err)
}

func TestAddFile_MatchByISBN_DetectsSameBookAcrossDifferingMetadata(t *testing.T) {
	lib := openTestLib(t)
	dir := t.TempDir()

	first := makeEPUBOpts(t, dir, epubOpts{
		filename: "alpha.epub", title: "Alpha", author: "Alice",
		isbn: "978-0-14-143951-8", marker: "m1",
	})
	outcome1, err := lib.AddFile(first)
	require.NoError(t, err)
	require.NotNil(t, outcome1.Book)

	// Same ISBN (different hyphenation), deliberately differing
	// title/author, same extension — should still be recognized as the
	// same book via ISBN alone, landing as a format conflict (both are
	// .epub) rather than a second book.
	second := makeEPUBOpts(t, dir, epubOpts{
		filename: "beta.epub", title: "Beta", author: "Bob",
		isbn: "9780141439518", marker: "m2",
	})
	outcome2, err := lib.AddFile(second)
	require.NoError(t, err)
	require.NotNil(t, outcome2.Conflict)
	assert.Equal(t, outcome1.Book.ID, outcome2.Conflict.BookID)
	assert.Equal(t, "Alpha", outcome2.Conflict.BookTitle)

	books, err := lib.GetBooks()
	require.NoError(t, err)
	assert.Len(t, books, 1)

	// The second file must never have been copied to disk.
	entries, err := os.ReadDir(filepath.Dir(outcome1.Book.Formats[0].Path))
	require.NoError(t, err)
	assert.Len(t, entries, 1)
}

func TestAddFile_MatchByTitleAuthor_AttachesNewFormat(t *testing.T) {
	lib := openTestLib(t)
	dir := t.TempDir()

	epub := makeEPUB(t, dir, "Match Book", "Match Author")
	outcome1, err := lib.AddFile(epub)
	require.NoError(t, err)
	require.NotNil(t, outcome1.Book)

	// Different format, same title/author but different case — should
	// merge into the existing book as a second format, not create a new one.
	pdf := makePDF(t, dir, "match.pdf", "match book", "MATCH AUTHOR")
	outcome2, err := lib.AddFile(pdf)
	require.NoError(t, err)
	require.Nil(t, outcome2.Conflict)
	require.NotNil(t, outcome2.Book)

	assert.Equal(t, outcome1.Book.ID, outcome2.Book.ID)
	require.Len(t, outcome2.Book.Formats, 2)

	books, err := lib.GetBooks()
	require.NoError(t, err)
	assert.Len(t, books, 1)
}

func TestAddFile_FormatConflict_ReturnsOutcomeNotErrorAndSkipsDisk(t *testing.T) {
	lib := openTestLib(t)
	dir := t.TempDir()

	first := makeEPUBOpts(t, dir, epubOpts{filename: "a.epub", title: "Conflict Book", author: "Author", marker: "m1"})
	outcome1, err := lib.AddFile(first)
	require.NoError(t, err)

	second := makeEPUBOpts(t, dir, epubOpts{filename: "b.epub", title: "Conflict Book", author: "Author", marker: "m2"})
	outcome2, err := lib.AddFile(second)
	require.NoError(t, err) // a conflict is an outcome, not an error
	require.NotNil(t, outcome2.Conflict)
	assert.Nil(t, outcome2.Book)

	entries, err := os.ReadDir(filepath.Dir(outcome1.Book.Formats[0].Path))
	require.NoError(t, err)
	assert.Len(t, entries, 1, "the conflicting file must not be written until resolved")
}

func triggerConflict(t *testing.T, lib *Library) (*metadata.Book, FormatConflict) {
	t.Helper()
	dir := t.TempDir()
	first := makeEPUBOpts(t, dir, epubOpts{filename: "a.epub", title: "Resolve Book", author: "Author", marker: "m1"})
	outcome1, err := lib.AddFile(first)
	require.NoError(t, err)

	second := makeEPUBOpts(t, dir, epubOpts{filename: "b.epub", title: "Resolve Book", author: "Author", marker: "m2"})
	outcome2, err := lib.AddFile(second)
	require.NoError(t, err)
	require.NotNil(t, outcome2.Conflict)

	return outcome1.Book, *outcome2.Conflict
}

func TestResolveConflict_KeepExisting(t *testing.T) {
	lib := openTestLib(t)
	original, conflict := triggerConflict(t, lib)

	book, err := lib.ResolveConflict(conflict, ConflictKeepExisting)
	require.NoError(t, err)
	require.Len(t, book.Formats, 1)
	assert.Equal(t, original.Formats[0].Hash, book.Formats[0].Hash)

	entries, err := os.ReadDir(filepath.Dir(original.Formats[0].Path))
	require.NoError(t, err)
	assert.Len(t, entries, 1)
}

func TestResolveConflict_Replace(t *testing.T) {
	lib := openTestLib(t)
	_, conflict := triggerConflict(t, lib)

	book, err := lib.ResolveConflict(conflict, ConflictReplace)
	require.NoError(t, err)
	require.Len(t, book.Formats, 1)
	assert.Equal(t, conflict.IncomingHash, book.Formats[0].Hash)
	assert.NotEqual(t, conflict.ExistingHash, book.Formats[0].Hash)
	assert.FileExists(t, book.Formats[0].Path)
}

func TestResolveConflict_KeepBoth(t *testing.T) {
	lib := openTestLib(t)
	_, conflict := triggerConflict(t, lib)

	book, err := lib.ResolveConflict(conflict, ConflictKeepBoth)
	require.NoError(t, err)
	require.Len(t, book.Formats, 2)
	assert.NotEqual(t, book.Formats[0].Path, book.Formats[1].Path)
	assert.NotEqual(t, book.Formats[0].Hash, book.Formats[1].Hash)
	for _, f := range book.Formats {
		assert.FileExists(t, f.Path)
	}
}

func TestAddDir_CollectsErrors(t *testing.T) {
	lib := openTestLib(t)
	srcDir := t.TempDir()

	// One valid EPUB
	makeEPUB(t, srcDir, "Valid Book", "Author")
	// One invalid EPUB (not a valid ZIP)
	require.NoError(t, os.WriteFile(filepath.Join(srcDir, "broken.epub"), []byte("not a zip"), 0644))

	books, errs := lib.AddDir(srcDir)
	assert.Len(t, books, 1)
	assert.Len(t, errs, 1)
}

func TestAddDir_AutoResolvesConflictsAsKeepBoth(t *testing.T) {
	lib := openTestLib(t)
	srcDir := t.TempDir()

	makeEPUBOpts(t, srcDir, epubOpts{filename: "a.epub", title: "Auto Book", author: "Author", marker: "m1"})
	makeEPUBOpts(t, srcDir, epubOpts{filename: "b.epub", title: "Auto Book", author: "Author", marker: "m2"})

	books, errs := lib.AddDir(srcDir)
	assert.Empty(t, errs)
	require.Len(t, books, 2)
	assert.Equal(t, books[0].ID, books[1].ID)

	all, err := lib.GetBooks()
	require.NoError(t, err)
	require.Len(t, all, 1)
	assert.Len(t, all[0].Formats, 2)
}

func TestAddFile_ConcurrentSameBookRaceProducesOneBook(t *testing.T) {
	lib := openTestLib(t)
	dir := t.TempDir()

	const n = 8
	paths := make([]string, n)
	for i := range paths {
		paths[i] = makeEPUBOpts(t, dir, epubOpts{
			filename: fmt.Sprintf("race-%d.epub", i),
			title:    "Race Book", author: "Race Author",
			marker: fmt.Sprintf("filler-%d", i),
		})
	}

	var wg sync.WaitGroup
	outcomes := make([]*AddOutcome, n)
	errs := make([]error, n)
	for i := range paths {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			outcomes[i], errs[i] = lib.AddFile(paths[i])
		}(i)
	}
	wg.Wait()

	var newBooks, conflicts int
	for i := 0; i < n; i++ {
		require.NoError(t, errs[i])
		if outcomes[i].Book != nil {
			newBooks++
		} else {
			conflicts++
		}
	}
	assert.Equal(t, 1, newBooks, "exactly one goroutine should have won the new-book race")
	assert.Equal(t, n-1, conflicts, "every other goroutine should see a conflict, never a silent duplicate")

	books, err := lib.GetBooks()
	require.NoError(t, err)
	assert.Len(t, books, 1, "no duplicate book rows in the DB")
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
