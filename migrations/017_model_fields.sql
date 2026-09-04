-- +goose Up
-- Bindings that hang a field on a model rather than on a category (015).
--
-- Shaped exactly like category_fields, because a binding means the same thing
-- either way: this field applies here, with its own required flag and sort.
-- Keeping the two tables the same shape is what lets the mutual-exclusion
-- check be one question -- "is this field_id in the other table?" -- rather
-- than a special case.
--
-- Nothing is backfilled: model bindings did not exist before this migration.
-- +goose StatementBegin
CREATE TABLE model_fields (
  model_id TEXT NOT NULL REFERENCES product_models(id) ON DELETE CASCADE,
  field_id TEXT NOT NULL REFERENCES field_definitions(id),
  required INTEGER NOT NULL DEFAULT 0,
  sort     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (model_id, field_id)
);
-- +goose StatementEnd

-- The primary key answers "which fields does this model have". This answers
-- the other direction -- "which models is this field on" -- which the field
-- list, the unbind guard and the uniqueness scope all ask.
-- +goose StatementBegin
CREATE INDEX ix_model_fields_field ON model_fields(field_id);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP INDEX IF EXISTS ix_model_fields_field;
-- +goose StatementEnd
-- +goose StatementBegin
DROP TABLE IF EXISTS model_fields;
-- +goose StatementEnd
