-- Selective category-field inheritance.
--
-- Direct bindings remain the source of truth. A selection row records only a
-- child category's explicit choice from the effective fields of its direct
-- parent; it is not a copied binding and carries no source or ordering data.
--
-- The second column distinguishes an ordinary searchable historical value
-- from a value that became unreachable when inheritance was withdrawn. Both
-- remain visible to ValueHistory, but only the former remains searchable.
-- +goose Up
-- +goose StatementBegin
CREATE TABLE category_field_selections (
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  field_id    TEXT NOT NULL REFERENCES field_definitions(id) ON DELETE CASCADE,
  PRIMARY KEY (category_id, field_id)
);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE INDEX ix_category_field_selections_field
  ON category_field_selections(field_id, category_id);
-- +goose StatementEnd

-- +goose StatementBegin
ALTER TABLE asset_unique_values
  ADD COLUMN search_suppressed INTEGER NOT NULL DEFAULT 0
  CHECK (search_suppressed IN (0, 1));
-- +goose StatementEnd

-- Preserve the old automatic-inheritance result. For every non-root category,
-- insert each field directly bound on a strict ancestor, in root-to-leaf order.
-- INSERT OR IGNORE makes a repeated field id retain its first occurrence. The
-- field id, rather than key, is the identity here; the existing resolver still
-- rejects same-chain key conflicts.
-- +goose StatementBegin
INSERT OR IGNORE INTO category_field_selections (category_id, field_id)
SELECT child.id, binding.field_id
  FROM categories AS child
  JOIN categories AS source
    ON source.id <> child.id
   AND child.path LIKE source.path || '%'
  JOIN category_fields AS binding
    ON binding.category_id = source.id
 ORDER BY length(source.path), source.path, binding.sort, binding.field_id,
          child.path, child.id;
-- +goose StatementEnd

-- +goose Down
-- Empty databases can still use the normal goose rollback path. Once a
-- selection or a suppressed historical value exists, refusing is safer than
-- silently destroying a user's inheritance decision or search history.
-- +goose StatementBegin
CREATE TEMP TABLE migration_024_down_guard (marker INTEGER);
CREATE TEMP TRIGGER migration_024_down_guard_trigger
BEFORE INSERT ON migration_024_down_guard
WHEN EXISTS (SELECT 1 FROM category_field_selections)
  OR EXISTS (SELECT 1 FROM asset_unique_values WHERE search_suppressed = 1)
BEGIN
  SELECT RAISE(ABORT, 'migration 024 down is unsafe after selective inheritance data exists');
END;
INSERT INTO migration_024_down_guard VALUES (1);
DROP TRIGGER migration_024_down_guard_trigger;
DROP TABLE migration_024_down_guard;
-- +goose StatementEnd
-- +goose StatementBegin
DROP INDEX IF EXISTS ix_category_field_selections_field;
DROP TABLE IF EXISTS category_field_selections;
-- +goose StatementEnd
-- +goose StatementBegin
ALTER TABLE asset_unique_values DROP COLUMN search_suppressed;
-- +goose StatementEnd
