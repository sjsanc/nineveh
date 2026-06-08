-- +goose Up
ALTER TABLE books ADD COLUMN is_read INTEGER NOT NULL DEFAULT 0;

-- +goose Down
ALTER TABLE books DROP COLUMN is_read;
