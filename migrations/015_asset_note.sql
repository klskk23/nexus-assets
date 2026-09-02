-- A note on the device itself.
--
-- The built-in columns describe where a device is and who answers for it;
-- everything else is a category's own fields. What was missing is the sentence
-- that belongs to no category and to no scheme: "screen has a scratch", "loaned
-- to the Shanghai trial, ask before moving". Somewhere to write that down
-- otherwise becomes a text field on one category, then a second one on the
-- next, and nobody can search across them.
--
-- Distinct from the note on a transfer, which explains one movement and is
-- immutable. This one describes the device as it stands and is edited with it.

-- +goose Up
-- +goose StatementBegin
ALTER TABLE assets ADD COLUMN note TEXT NOT NULL DEFAULT '';
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE assets DROP COLUMN note;
-- +goose StatementEnd
