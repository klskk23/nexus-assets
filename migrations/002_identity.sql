-- Identity model rewrite: the serial number stops being a column on assets and
-- becomes an ordinary information item that a category may nominate.
--
-- No transaction: rebuilding a table under foreign keys needs PRAGMA
-- foreign_keys=off, which is a no-op inside one.
-- +goose NO TRANSACTION

-- +goose Up
-- +goose StatementBegin
PRAGMA foreign_keys = off;
-- +goose StatementEnd

-- +goose StatementBegin
DROP TABLE IF EXISTS asset_sn_history;
-- +goose StatementEnd

-- +goose StatementBegin
-- The unique-value table takes over both exact-match lookups and uniqueness,
-- so a per-key expression index is no longer worth carrying.
DROP INDEX IF EXISTS ix_assets_mac;
-- +goose StatementEnd

-- +goose StatementBegin
-- assets is rebuilt rather than altered: sn carries a UNIQUE constraint, and
-- SQLite refuses to drop an indexed column.
CREATE TABLE assets_new (
  id          TEXT PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES categories(id),
  model_id    TEXT REFERENCES product_models(id),
  status      TEXT NOT NULL,                       -- in_stock|in_use|in_repair|lost|retired
  owner_id    TEXT NOT NULL REFERENCES users(id),
  holder_type TEXT NOT NULL,                       -- user | entity
  holder_id   TEXT NOT NULL,
  attrs       TEXT NOT NULL DEFAULT '{}',
  version     INTEGER NOT NULL DEFAULT 1,
  deleted_at  TEXT,                                -- reserved; demo uses hard delete
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
-- +goose StatementEnd

-- +goose StatementBegin
INSERT INTO assets_new
  (id, category_id, model_id, status, owner_id, holder_type, holder_id,
   attrs, version, deleted_at, created_at, updated_at)
SELECT id, category_id, model_id, status, owner_id, holder_type, holder_id,
       attrs, version, deleted_at, created_at, updated_at
FROM assets;
-- +goose StatementEnd

-- +goose StatementBegin
DROP TABLE assets;
-- +goose StatementEnd
-- +goose StatementBegin
ALTER TABLE assets_new RENAME TO assets;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE INDEX ix_assets_cat_status ON assets(category_id, status);
-- +goose StatementEnd
-- +goose StatementBegin
CREATE INDEX ix_assets_owner ON assets(owner_id);
-- +goose StatementEnd
-- +goose StatementBegin
CREATE INDEX ix_assets_holder ON assets(holder_type, holder_id);
-- +goose StatementEnd

-- +goose StatementBegin
-- The numbering rule moves out of the category and into the field library; the
-- category only nominates which bound field is the one people read aloud.
ALTER TABLE categories DROP COLUMN sn_template;
-- +goose StatementEnd
-- +goose StatementBegin
ALTER TABLE categories ADD COLUMN display_key TEXT;
-- +goose StatementEnd

-- +goose StatementBegin
-- Derived from assets.attrs, maintained inside the same write transaction.
-- Rows with archived_at set are previous values: still searchable, no longer
-- occupying the uniqueness slot.
CREATE TABLE asset_unique_values (
  asset_id    TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  field_key   TEXT NOT NULL,
  value       TEXT NOT NULL,
  archived_at TEXT,
  created_at  TEXT NOT NULL
);
-- +goose StatementEnd

-- +goose StatementBegin
-- The partial index is what turns uniqueness into a database-level guarantee;
-- the application no longer relies on writes being serialised for correctness.
CREATE UNIQUE INDEX ux_uv_live ON asset_unique_values(field_key, value) WHERE archived_at IS NULL;
-- +goose StatementEnd
-- +goose StatementBegin
CREATE INDEX ix_uv_value ON asset_unique_values(value);
-- +goose StatementEnd
-- +goose StatementBegin
CREATE INDEX ix_uv_asset ON asset_unique_values(asset_id);
-- +goose StatementEnd

-- +goose StatementBegin
PRAGMA foreign_keys = on;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
PRAGMA foreign_keys = off;
-- +goose StatementEnd
-- +goose StatementBegin
DROP TABLE IF EXISTS asset_unique_values;
-- +goose StatementEnd
-- +goose StatementBegin
ALTER TABLE categories DROP COLUMN display_key;
-- +goose StatementEnd
-- +goose StatementBegin
ALTER TABLE categories ADD COLUMN sn_template TEXT;
-- +goose StatementEnd
-- +goose StatementBegin
CREATE TABLE assets_old (
  id          TEXT PRIMARY KEY,
  sn          TEXT NOT NULL UNIQUE,
  category_id TEXT NOT NULL REFERENCES categories(id),
  model_id    TEXT REFERENCES product_models(id),
  status      TEXT NOT NULL,
  owner_id    TEXT NOT NULL REFERENCES users(id),
  holder_type TEXT NOT NULL,
  holder_id   TEXT NOT NULL,
  attrs       TEXT NOT NULL DEFAULT '{}',
  version     INTEGER NOT NULL DEFAULT 1,
  deleted_at  TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
-- +goose StatementEnd
-- +goose StatementBegin
INSERT INTO assets_old
  (id, sn, category_id, model_id, status, owner_id, holder_type, holder_id,
   attrs, version, deleted_at, created_at, updated_at)
SELECT id, substr(id, 1, 8), category_id, model_id, status, owner_id, holder_type, holder_id,
       attrs, version, deleted_at, created_at, updated_at
FROM assets;
-- +goose StatementEnd
-- +goose StatementBegin
DROP TABLE assets;
-- +goose StatementEnd
-- +goose StatementBegin
ALTER TABLE assets_old RENAME TO assets;
-- +goose StatementEnd
-- +goose StatementBegin
CREATE INDEX ix_assets_cat_status ON assets(category_id, status);
-- +goose StatementEnd
-- +goose StatementBegin
CREATE INDEX ix_assets_owner ON assets(owner_id);
-- +goose StatementEnd
-- +goose StatementBegin
CREATE INDEX ix_assets_holder ON assets(holder_type, holder_id);
-- +goose StatementEnd
-- +goose StatementBegin
CREATE INDEX ix_assets_mac ON assets(json_extract(attrs, '$.mac'));
-- +goose StatementEnd
-- +goose StatementBegin
CREATE TABLE asset_sn_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id    TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  sn          TEXT NOT NULL,
  replaced_at TEXT NOT NULL
);
-- +goose StatementEnd
-- +goose StatementBegin
CREATE INDEX ix_sn_history ON asset_sn_history(sn);
-- +goose StatementEnd
-- +goose StatementBegin
PRAGMA foreign_keys = on;
-- +goose StatementEnd
