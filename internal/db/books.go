package db

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"nineveh/internal/metadata"
)

func (d *DB) InsertBook(book *metadata.Book) (int64, error) {
	authors, tags, pubTime, err := marshalBookParams(book)
	if err != nil {
		return 0, err
	}
	addedTime := time.Now().UTC()
	if book.DateAdded != "" {
		if t, err := time.Parse(time.RFC3339, book.DateAdded); err == nil {
			addedTime = t
		}
	}

	res, err := d.conn.Exec(`
		INSERT INTO books (title, authors, publisher, series, series_index, language, description, tags, rating, cover_path, date_added, date_published, isbn, is_read)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		book.Title, authors,
		nullString(book.Publisher), nullString(book.Series), nullFloat(book.SeriesIndex),
		nullString(book.Language), nullString(book.Description), tags,
		book.Rating, nullString(book.CoverPath),
		addedTime, pubTime, nullString(book.ISBN), boolToInt(book.IsRead),
	)
	if err != nil {
		return 0, fmt.Errorf("insert book: %w", err)
	}
	return res.LastInsertId()
}

func (d *DB) GetBook(id int64) (*metadata.Book, error) {
	row := d.conn.QueryRow(`SELECT `+bookColumns+` FROM books WHERE id = ?`, id)
	book, err := scanBook(row)
	if err != nil {
		return nil, err
	}
	formats, err := d.getFormats(id)
	if err != nil {
		return nil, err
	}
	book.Formats = formats
	return book, nil
}

func (d *DB) GetBooks() ([]*metadata.Book, error) {
	rows, err := d.conn.Query(`SELECT ` + bookColumns + ` FROM books ORDER BY title ASC`)
	if err != nil {
		return nil, fmt.Errorf("query books: %w", err)
	}
	defer rows.Close()
	books, err := scanBooks(rows)
	if err != nil {
		return nil, err
	}
	fmtMap, err := d.getAllFormats()
	if err != nil {
		return nil, err
	}
	for _, b := range books {
		b.Formats = fmtMap[b.ID]
	}
	return books, nil
}

func (d *DB) getAllFormats() (map[int64][]metadata.BookFile, error) {
	rows, err := d.conn.Query(`SELECT book_id, path, format, size, hash FROM formats`)
	if err != nil {
		return nil, fmt.Errorf("query all formats: %w", err)
	}
	defer rows.Close()
	m := make(map[int64][]metadata.BookFile)
	for rows.Next() {
		var bookID int64
		var f metadata.BookFile
		var format string
		if err := rows.Scan(&bookID, &f.Path, &format, &f.Size, &f.Hash); err != nil {
			return nil, fmt.Errorf("scan format: %w", err)
		}
		f.Format = metadata.Format(format)
		m[bookID] = append(m[bookID], f)
	}
	return m, rows.Err()
}

func (d *DB) UpdateBook(book *metadata.Book) error {
	authors, tags, pubTime, err := marshalBookParams(book)
	if err != nil {
		return err
	}
	_, err = d.conn.Exec(`
		UPDATE books SET
			title = ?, authors = ?, publisher = ?, series = ?, series_index = ?,
			language = ?, description = ?, tags = ?, rating = ?, cover_path = ?, date_published = ?, isbn = ?, is_read = ?
		WHERE id = ?`,
		book.Title, authors,
		nullString(book.Publisher), nullString(book.Series), nullFloat(book.SeriesIndex),
		nullString(book.Language), nullString(book.Description), tags,
		book.Rating, nullString(book.CoverPath),
		pubTime, nullString(book.ISBN), boolToInt(book.IsRead), book.ID,
	)
	if err != nil {
		return fmt.Errorf("update book: %w", err)
	}
	return nil
}

func (d *DB) DeleteBook(id int64) error {
	_, err := d.conn.Exec(`DELETE FROM books WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("delete book: %w", err)
	}
	return nil
}

func (d *DB) DeleteAllBooks() error {
	_, err := d.conn.Exec(`DELETE FROM books`)
	if err != nil {
		return fmt.Errorf("delete all books: %w", err)
	}
	return nil
}

func (d *DB) SearchBooks(query string) ([]*metadata.Book, error) {
	like := "%" + query + "%"
	rows, err := d.conn.Query(`
		SELECT `+bookColumns+` FROM books
		WHERE title LIKE ? OR authors LIKE ? OR series LIKE ? OR tags LIKE ?
		ORDER BY title ASC`,
		like, like, like, like,
	)
	if err != nil {
		return nil, fmt.Errorf("search books: %w", err)
	}
	defer rows.Close()
	books, err := scanBooks(rows)
	if err != nil {
		return nil, err
	}
	fmtMap, err := d.getAllFormats()
	if err != nil {
		return nil, err
	}
	for _, b := range books {
		b.Formats = fmtMap[b.ID]
	}
	return books, nil
}

func (d *DB) GetBookByHash(hash string) (*metadata.Book, error) {
	row := d.conn.QueryRow(`
		SELECT b.id, b.title, b.authors, b.publisher, b.series, b.series_index,
		       b.language, b.description, b.tags, b.rating, b.cover_path, b.date_added, b.date_published, b.isbn, b.is_read
		FROM books b
		JOIN formats f ON f.book_id = b.id
		WHERE f.hash = ?
		LIMIT 1`, hash)
	book, err := scanBook(row)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return book, err
}

func (d *DB) InsertFormat(bookID int64, f *metadata.BookFile) error {
	_, err := d.conn.Exec(`
		INSERT INTO formats (book_id, path, format, size, hash) VALUES (?, ?, ?, ?, ?)`,
		bookID, f.Path, string(f.Format), f.Size, f.Hash,
	)
	if err != nil {
		return fmt.Errorf("insert format: %w", err)
	}
	return nil
}

func (d *DB) getFormats(bookID int64) ([]metadata.BookFile, error) {
	rows, err := d.conn.Query(`SELECT path, format, size, hash FROM formats WHERE book_id = ?`, bookID)
	if err != nil {
		return nil, fmt.Errorf("query formats: %w", err)
	}
	defer rows.Close()

	var formats []metadata.BookFile
	for rows.Next() {
		var f metadata.BookFile
		var format string
		if err := rows.Scan(&f.Path, &format, &f.Size, &f.Hash); err != nil {
			return nil, fmt.Errorf("scan format: %w", err)
		}
		f.Format = metadata.Format(format)
		formats = append(formats, f)
	}
	return formats, rows.Err()
}

// --- scan helpers ---

const bookColumns = `id, title, authors, publisher, series, series_index, language, description, tags, rating, cover_path, date_added, date_published, isbn, is_read`

func scanBookRow(scan func(dest ...any) error) (*metadata.Book, error) {
	var b metadata.Book
	var authors, tags string
	var publisher, series, language, description, coverPath, isbn sql.NullString
	var seriesIndex sql.NullFloat64
	var dateAdded time.Time
	var datePublished sql.NullTime

	var isRead int
	if err := scan(
		&b.ID, &b.Title, &authors, &publisher, &series, &seriesIndex,
		&language, &description, &tags, &b.Rating, &coverPath,
		&dateAdded, &datePublished, &isbn, &isRead,
	); err != nil {
		return nil, err
	}

	if err := json.Unmarshal([]byte(authors), &b.Authors); err != nil {
		b.Authors = []string{}
	}
	if err := json.Unmarshal([]byte(tags), &b.Tags); err != nil {
		b.Tags = []string{}
	}

	b.Publisher = publisher.String
	b.Series = series.String
	b.SeriesIndex = seriesIndex.Float64
	b.Language = language.String
	b.Description = description.String
	b.CoverPath = coverPath.String
	b.DateAdded = dateAdded.UTC().Format(time.RFC3339)
	if datePublished.Valid {
		b.DatePublished = datePublished.Time.UTC().Format(time.RFC3339)
	}
	b.ISBN = isbn.String
	b.IsRead = isRead != 0

	return &b, nil
}

func scanBook(row *sql.Row) (*metadata.Book, error) {
	return scanBookRow(row.Scan)
}

func scanBooks(rows *sql.Rows) ([]*metadata.Book, error) {
	var books []*metadata.Book
	for rows.Next() {
		b, err := scanBookRow(rows.Scan)
		if err != nil {
			return nil, err
		}
		books = append(books, b)
	}
	return books, rows.Err()
}

// --- marshal helpers ---

func marshalBookParams(book *metadata.Book) (authorsJSON, tagsJSON string, pubTime sql.NullTime, err error) {
	a, e := json.Marshal(book.Authors)
	if e != nil {
		return "", "", sql.NullTime{}, fmt.Errorf("marshal authors: %w", e)
	}
	t, e := json.Marshal(book.Tags)
	if e != nil {
		return "", "", sql.NullTime{}, fmt.Errorf("marshal tags: %w", e)
	}
	if book.DatePublished != "" {
		if pt, e := time.Parse(time.RFC3339, book.DatePublished); e == nil {
			pubTime = sql.NullTime{Time: pt, Valid: true}
		}
	}
	return string(a), string(t), pubTime, nil
}

// --- null helpers ---

func nullString(s string) sql.NullString {
	return sql.NullString{String: s, Valid: s != ""}
}

func nullFloat(f float64) sql.NullFloat64 {
	return sql.NullFloat64{Float64: f, Valid: f != 0}
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}

