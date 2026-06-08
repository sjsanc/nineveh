-- +goose Up

CREATE TABLE IF NOT EXISTS books (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    title           TEXT NOT NULL,
    authors         TEXT NOT NULL DEFAULT '[]', -- JSON array
    publisher       TEXT,
    series          TEXT,
    series_index    REAL,
    language        TEXT,
    description     TEXT,
    tags            TEXT NOT NULL DEFAULT '[]', -- JSON array
    rating          INTEGER DEFAULT 0,
    cover_path      TEXT,
    date_added      DATETIME NOT NULL,
    date_published  DATETIME
);

CREATE TABLE IF NOT EXISTS formats (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    path    TEXT NOT NULL,
    format  TEXT NOT NULL,
    size    INTEGER NOT NULL,
    hash    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS devices (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    serial      TEXT NOT NULL UNIQUE,
    last_seen   DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS device_books (
    device_id   INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    book_id     INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    format      TEXT NOT NULL,
    sent_at     DATETIME NOT NULL,
    PRIMARY KEY (device_id, book_id)
);
