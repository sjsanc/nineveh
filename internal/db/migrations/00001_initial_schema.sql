-- +goose Up
CREATE TABLE IF NOT EXISTS books (
	id             INTEGER PRIMARY KEY AUTOINCREMENT,
	title          TEXT NOT NULL,
	publisher      TEXT,
	series         TEXT,
	series_index   REAL,
	language       TEXT,
	description    TEXT,
	rating         INTEGER NOT NULL DEFAULT 0,
	cover_path     TEXT,
	date_added     DATETIME NOT NULL,
	date_published DATETIME,
	isbn           TEXT,
	is_read        INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_books_series ON books(series);

CREATE TABLE IF NOT EXISTS authors (
	id   INTEGER PRIMARY KEY AUTOINCREMENT,
	name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS book_authors (
	book_id   INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
	author_id INTEGER NOT NULL REFERENCES authors(id) ON DELETE CASCADE,
	PRIMARY KEY (book_id, author_id)
);

CREATE TABLE IF NOT EXISTS tags (
	id   INTEGER PRIMARY KEY AUTOINCREMENT,
	name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS book_tags (
	book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
	tag_id  INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
	PRIMARY KEY (book_id, tag_id)
);

CREATE TABLE IF NOT EXISTS formats (
	id      INTEGER PRIMARY KEY AUTOINCREMENT,
	book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
	path    TEXT NOT NULL,
	format  TEXT NOT NULL,
	size    INTEGER NOT NULL,
	hash    TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS devices (
	id         INTEGER PRIMARY KEY AUTOINCREMENT,
	identifier TEXT NOT NULL UNIQUE,
	name       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS device_books (
	device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
	book_id   INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
	PRIMARY KEY (device_id, book_id)
);

-- +goose Down
DROP TABLE IF EXISTS device_books;
DROP TABLE IF EXISTS devices;
DROP TABLE IF EXISTS formats;
DROP TABLE IF EXISTS book_tags;
DROP TABLE IF EXISTS tags;
DROP TABLE IF EXISTS book_authors;
DROP TABLE IF EXISTS authors;
DROP INDEX IF EXISTS idx_books_series;
DROP TABLE IF EXISTS books;
