package db

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"nineveh/internal/metadata"
)

const bookSelectCols = `b.id, b.title,
	COALESCE((SELECT json_group_array(a.name)
		FROM book_authors ba JOIN authors a ON a.id = ba.author_id
		WHERE ba.book_id = b.id), '[]') AS authors,
	b.publisher, b.series, b.series_index,
	b.language, b.description,
	COALESCE((SELECT json_group_array(t.name)
		FROM book_tags bt JOIN tags t ON t.id = bt.tag_id
		WHERE bt.book_id = b.id), '[]') AS tags,
	b.rating, b.cover_path, b.date_added, b.date_published, b.isbn, b.is_read`

func (d *DB) InsertBook(book *metadata.Book) (int64, error) {
	addedTime := time.Now().UTC()
	if book.DateAdded != "" {
		if t, err := time.Parse(time.RFC3339, book.DateAdded); err == nil {
			addedTime = t
		}
	}

	tx, err := d.conn.Begin()
	if err != nil {
		return 0, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback()

	res, err := tx.Exec(`
		INSERT INTO books (title, publisher, series, series_index, language, description, rating, cover_path, date_added, date_published, isbn, is_read)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		book.Title,
		nullString(book.Publisher), nullString(book.Series), nullFloat(book.SeriesIndex),
		nullString(book.Language), nullString(book.Description),
		book.Rating, nullString(book.CoverPath),
		addedTime, parsePubTime(book.DatePublished), nullString(book.ISBN), boolToInt(book.IsRead),
	)
	if err != nil {
		return 0, fmt.Errorf("insert book: %w", err)
	}
	bookID, err := res.LastInsertId()
	if err != nil {
		return 0, fmt.Errorf("last insert id: %w", err)
	}

	if err := upsertRelations(tx, bookID, book.Authors, "authors", "book_authors", "author_id"); err != nil {
		return 0, err
	}
	if err := upsertRelations(tx, bookID, book.Tags, "tags", "book_tags", "tag_id"); err != nil {
		return 0, err
	}

	if err := tx.Commit(); err != nil {
		return 0, fmt.Errorf("commit: %w", err)
	}
	return bookID, nil
}

func (d *DB) GetBook(id int64) (*metadata.Book, error) {
	row := d.conn.QueryRow(`SELECT `+bookSelectCols+` FROM books b WHERE b.id = ?`, id)
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
	rows, err := d.conn.Query(`SELECT ` + bookSelectCols + ` FROM books b ORDER BY b.title ASC`)
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
	tx, err := d.conn.Begin()
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback()

	_, err = tx.Exec(`
		UPDATE books SET
			title = ?, publisher = ?, series = ?, series_index = ?,
			language = ?, description = ?, rating = ?, cover_path = ?,
			date_published = ?, isbn = ?, is_read = ?
		WHERE id = ?`,
		book.Title,
		nullString(book.Publisher), nullString(book.Series), nullFloat(book.SeriesIndex),
		nullString(book.Language), nullString(book.Description),
		book.Rating, nullString(book.CoverPath),
		parsePubTime(book.DatePublished), nullString(book.ISBN), boolToInt(book.IsRead), book.ID,
	)
	if err != nil {
		return fmt.Errorf("update book: %w", err)
	}

	if _, err := tx.Exec(`DELETE FROM book_authors WHERE book_id = ?`, book.ID); err != nil {
		return fmt.Errorf("delete book_authors: %w", err)
	}
	if _, err := tx.Exec(`DELETE FROM book_tags WHERE book_id = ?`, book.ID); err != nil {
		return fmt.Errorf("delete book_tags: %w", err)
	}

	if err := upsertRelations(tx, book.ID, book.Authors, "authors", "book_authors", "author_id"); err != nil {
		return err
	}
	if err := upsertRelations(tx, book.ID, book.Tags, "tags", "book_tags", "tag_id"); err != nil {
		return err
	}

	return tx.Commit()
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
		SELECT `+bookSelectCols+`
		FROM books b
		WHERE b.title LIKE ?
		   OR b.series LIKE ?
		   OR EXISTS (SELECT 1 FROM book_authors ba JOIN authors a ON a.id = ba.author_id WHERE ba.book_id = b.id AND a.name LIKE ?)
		   OR EXISTS (SELECT 1 FROM book_tags bt JOIN tags t ON t.id = bt.tag_id WHERE bt.book_id = b.id AND t.name LIKE ?)
		ORDER BY b.title ASC`,
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
		SELECT `+bookSelectCols+`
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

func (d *DB) GetAllAuthors() ([]string, error) {
	return queryStringList(d.conn, `SELECT name FROM authors ORDER BY name`)
}

func (d *DB) GetAllTags() ([]string, error) {
	return queryStringList(d.conn, `SELECT name FROM tags ORDER BY name`)
}

func (d *DB) GetAllSeries() ([]string, error) {
	return queryStringList(d.conn, `SELECT DISTINCT series FROM books WHERE series IS NOT NULL AND series != '' ORDER BY series`)
}

func queryStringList(conn *sql.DB, query string) ([]string, error) {
	rows, err := conn.Query(query)
	if err != nil {
		return nil, fmt.Errorf("query: %w", err)
	}
	defer rows.Close()
	var names []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, fmt.Errorf("scan: %w", err)
		}
		names = append(names, name)
	}
	return names, rows.Err()
}

// --- relation helpers ---

func upsertRelations(tx *sql.Tx, bookID int64, names []string, table, joinTable, refCol string) error {
	for _, name := range names {
		if name == "" {
			continue
		}
		if _, err := tx.Exec(`INSERT OR IGNORE INTO `+table+`(name) VALUES (?)`, name); err != nil {
			return fmt.Errorf("upsert %s %q: %w", table, name, err)
		}
		var refID int64
		if err := tx.QueryRow(`SELECT id FROM `+table+` WHERE name = ?`, name).Scan(&refID); err != nil {
			return fmt.Errorf("get %s id for %q: %w", table, name, err)
		}
		if _, err := tx.Exec(`INSERT OR IGNORE INTO `+joinTable+`(book_id, `+refCol+`) VALUES (?, ?)`, bookID, refID); err != nil {
			return fmt.Errorf("insert %s: %w", joinTable, err)
		}
	}
	return nil
}

// --- scan helpers ---

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

// --- helpers ---

func parsePubTime(s string) sql.NullTime {
	if s == "" {
		return sql.NullTime{}
	}
	if t, err := time.Parse(time.RFC3339, s); err == nil {
		return sql.NullTime{Time: t, Valid: true}
	}
	return sql.NullTime{}
}

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
