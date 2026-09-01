-- A category has more than one label.
--
-- One device carries a permanent number and a location tag that is replaced
-- whenever it moves; those are two designs, both belonging to the same kind of
-- thing. A single preset per category could only ever describe one of them, so
-- the column becomes a list and the choice moves to the moment of printing.
--
-- A JSON array rather than a join table: these ids belong to another service,
-- so there is nothing here to join them to. A table of one column with no
-- foreign key is a list wearing a costume.

-- +goose Up
-- +goose StatementBegin
ALTER TABLE categories ADD COLUMN print_preset_ids TEXT NOT NULL DEFAULT '[]';
-- +goose StatementEnd
-- +goose StatementBegin
UPDATE categories SET print_preset_ids = json_array(print_preset_id)
 WHERE print_preset_id != '';
-- +goose StatementEnd
-- +goose StatementBegin
ALTER TABLE categories DROP COLUMN print_preset_id;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE categories ADD COLUMN print_preset_id TEXT NOT NULL DEFAULT '';
-- +goose StatementEnd
-- +goose StatementBegin
-- Lossy by nature: a category with two labels goes back to having one, and the
-- second is gone. The first is kept because it is the one that was there
-- before this migration ran.
UPDATE categories SET print_preset_id = coalesce(json_extract(print_preset_ids, '$[0]'), '');
-- +goose StatementEnd
-- +goose StatementBegin
ALTER TABLE categories DROP COLUMN print_preset_ids;
-- +goose StatementEnd
