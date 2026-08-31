-- Uniqueness stops being global and becomes a question about a category.
--
-- Two rules changed together because they are the same rule at two levels:
--
--   * A field key was unique across the whole library, so two unrelated
--     categories could not both call something "port". The rule that actually
--     matters is already enforced at bind time -- a key may not appear twice
--     on one chain or subtree -- and that is the one worth keeping.
--   * A value marked unique was unique across every asset in the system. What
--     people mean by a unique rack position is unique in this category, not in
--     the whole company. Scope is the category the binding was made on,
--     descendants included, which is exactly where the field exists.
--
-- No transaction: rebuilding a table under foreign keys needs
-- PRAGMA foreign_keys=off, which is a no-op inside one.
-- +goose NO TRANSACTION

-- +goose Up
-- +goose StatementBegin
PRAGMA foreign_keys = off;
-- +goose StatementEnd

-- +goose StatementBegin
-- The key loses its global UNIQUE. Everything else about the table is
-- unchanged; SQLite cannot drop an index that a column declaration created.
CREATE TABLE field_definitions_new (
  id          TEXT PRIMARY KEY,
  key         TEXT NOT NULL,
  label       TEXT NOT NULL,
  type        TEXT NOT NULL,                       -- text|number|boolean|date
                                                   -- |mac|ip|url|computed
  options     TEXT NOT NULL DEFAULT '{}',
  is_unique   INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
-- +goose StatementEnd
-- +goose StatementBegin
INSERT INTO field_definitions_new (id, key, label, type, options, is_unique, created_at, updated_at)
SELECT id, key, label, type, options, is_unique, created_at, updated_at FROM field_definitions;
-- +goose StatementEnd
-- +goose StatementBegin
DROP TABLE field_definitions;
-- +goose StatementEnd
-- +goose StatementBegin
ALTER TABLE field_definitions_new RENAME TO field_definitions;
-- +goose StatementEnd
-- +goose StatementBegin
CREATE INDEX ix_field_key ON field_definitions(key);
-- +goose StatementEnd

-- +goose StatementBegin
-- Which category's subtree this value has to be unique inside.
ALTER TABLE asset_unique_values ADD COLUMN scope_id TEXT NOT NULL DEFAULT '';
-- +goose StatementEnd
-- +goose StatementBegin
-- The binding that governs each stored value: the category closest to the root
-- that both binds the key and contains the asset. Falls back to the asset's own
-- category for a key whose binding is already gone, which keeps the row unique
-- against itself and nothing else.
UPDATE asset_unique_values
   SET scope_id = coalesce(
     (SELECT bc.id
        FROM category_fields cf
        JOIN field_definitions f ON f.id = cf.field_id
        JOIN categories bc ON bc.id = cf.category_id
        JOIN assets a ON a.id = asset_unique_values.asset_id
        JOIN categories ac ON ac.id = a.category_id
       WHERE f.key = asset_unique_values.field_key
         AND ac.path LIKE bc.path || '%'
       ORDER BY length(bc.path)
       LIMIT 1),
     (SELECT a.category_id FROM assets a WHERE a.id = asset_unique_values.asset_id),
     '');
-- +goose StatementEnd

-- +goose StatementBegin
DROP INDEX IF EXISTS ux_uv_live;
-- +goose StatementEnd
-- +goose StatementBegin
CREATE UNIQUE INDEX ux_uv_live
  ON asset_unique_values(scope_id, field_key, value) WHERE archived_at IS NULL;
-- +goose StatementEnd

-- +goose StatementBegin
PRAGMA foreign_keys = on;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
PRAGMA foreign_keys = off;
-- +goose StatementEnd
-- +goose StatementBegin
DROP INDEX IF EXISTS ux_uv_live;
-- +goose StatementEnd
-- +goose StatementBegin
-- Going back means values that were only unique per category have to be unique
-- everywhere again. Duplicates that are legal under the new rule make this
-- index fail to build, which is the honest outcome: the rollback stops rather
-- than quietly dropping one of them.
CREATE UNIQUE INDEX ux_uv_live ON asset_unique_values(field_key, value) WHERE archived_at IS NULL;
-- +goose StatementEnd
-- +goose StatementBegin
ALTER TABLE asset_unique_values DROP COLUMN scope_id;
-- +goose StatementEnd
-- +goose StatementBegin
DROP INDEX IF EXISTS ix_field_key;
-- +goose StatementEnd
-- +goose StatementBegin
CREATE TABLE field_definitions_old (
  id          TEXT PRIMARY KEY,
  key         TEXT NOT NULL UNIQUE,
  label       TEXT NOT NULL,
  type        TEXT NOT NULL,
  options     TEXT NOT NULL DEFAULT '{}',
  is_unique   INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
-- +goose StatementEnd
-- +goose StatementBegin
INSERT INTO field_definitions_old (id, key, label, type, options, is_unique, created_at, updated_at)
SELECT id, key, label, type, options, is_unique, created_at, updated_at FROM field_definitions;
-- +goose StatementEnd
-- +goose StatementBegin
DROP TABLE field_definitions;
-- +goose StatementEnd
-- +goose StatementBegin
ALTER TABLE field_definitions_old RENAME TO field_definitions;
-- +goose StatementEnd
-- +goose StatementBegin
PRAGMA foreign_keys = on;
-- +goose StatementEnd
