-- Holder entities become deletable, and archiving goes away.
--
-- The same move information items made in 003: archiving existed to protect
-- history, and it does protect it -- but it protected a warehouse created by
-- mistake just as firmly as one with a decade of transfers behind it, and the
-- system can tell those apart by itself. Deleting is refused while anything
-- points at the entity; only-in-history is a warning, exactly as it is for a
-- status (v4 decision 60).
--
-- A column nothing can set is worse than no column: the next reader has to
-- work out that archiving is gone before they can trust anything they read.

-- +goose Up
-- +goose StatementBegin
ALTER TABLE holder_entities DROP COLUMN archived_at;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
-- Lossy by nature: which entities had been archived is not recoverable, so
-- this restores the shape and leaves every row active.
ALTER TABLE holder_entities ADD COLUMN archived_at TEXT;
-- +goose StatementEnd
