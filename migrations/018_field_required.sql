-- +goose Up
-- Required moves from the binding to the field.
--
-- It was per binding, which let one field be required on a category and
-- optional on another. That is expressible but not explainable: the library
-- page could only summarise it as "required in some", every reader had to open
-- the field to find out which, and the rule a person actually holds in their
-- head is "this field has to be filled in". So the field owns it now, and a
-- required field is required everywhere it applies.
--
-- The backfill takes required from ANY binding rather than from all of them.
-- Somebody who marked it required on one category meant it there, and this
-- keeps that intention; the other reading would silently drop requirements
-- people had deliberately set. It does widen a partial requirement to the rest
-- of that field's bindings -- which is the point of the change, and is a
-- write-time rule either way: no existing asset is touched, and nothing is
-- refused until the next time one of them is edited.
-- +goose StatementBegin
ALTER TABLE field_definitions ADD COLUMN required INTEGER NOT NULL DEFAULT 0;
-- +goose StatementEnd

-- +goose StatementBegin
UPDATE field_definitions SET required = 1 WHERE id IN (
  SELECT field_id FROM category_fields WHERE required = 1
  UNION
  SELECT field_id FROM model_fields WHERE required = 1
);
-- +goose StatementEnd

-- The binding tables keep their columns rather than being rebuilt to drop
-- them. Two reasons: SQLite would need a full table copy under foreign keys
-- that other tables point at, and the column is what the down migration reads
-- to put the flag back where it came from. Nothing writes them any more --
-- the Go code sets required on the definition and never on a binding -- so
-- they hold the pre-018 answer and then stop changing.

-- +goose Down
-- +goose StatementBegin
UPDATE category_fields SET required = 1 WHERE field_id IN (
  SELECT id FROM field_definitions WHERE required = 1
);
-- +goose StatementEnd
-- +goose StatementBegin
UPDATE model_fields SET required = 1 WHERE field_id IN (
  SELECT id FROM field_definitions WHERE required = 1
);
-- +goose StatementEnd
-- +goose StatementBegin
ALTER TABLE field_definitions DROP COLUMN required;
-- +goose StatementEnd
