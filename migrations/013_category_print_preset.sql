-- Where a category's labels come from.
--
-- One opaque string per category: the id of a preset in whatever print service
-- this deployment points at. Nexus does not know what a preset contains -- a
-- template, a printer, a paper profile are that service's vocabulary, and
-- storing them here would mean an installation with no printer carried a
-- pile of configuration that means nothing.

-- +goose Up
-- +goose StatementBegin
ALTER TABLE categories ADD COLUMN print_preset_id TEXT NOT NULL DEFAULT '';
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE categories DROP COLUMN print_preset_id;
-- +goose StatementEnd
