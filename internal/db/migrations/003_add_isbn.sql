-- +goose Up
ALTER TABLE books ADD COLUMN isbn TEXT;

-- +goose Down
ALTER TABLE books DROP COLUMN isbn;
