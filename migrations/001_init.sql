-- +goose Up
-- +goose StatementBegin
CREATE TABLE users (
  id             TEXT PRIMARY KEY,
  email          TEXT NOT NULL UNIQUE,
  name           TEXT NOT NULL,
  auth_type      TEXT NOT NULL,                    -- oidc | local
  password_hash  TEXT,                             -- local only
  oidc_subject   TEXT UNIQUE,                      -- oidc only
  status         TEXT NOT NULL DEFAULT 'active',   -- active | disabled
  role           TEXT NOT NULL DEFAULT 'admin',    -- reserved, not enforced yet
  token_version  INTEGER NOT NULL DEFAULT 0,       -- reserved, for instant revocation
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE TABLE holder_entities (
  id               TEXT PRIMARY KEY,
  type             TEXT NOT NULL,                  -- company | location | department | ...
  name             TEXT NOT NULL,
  parent_id        TEXT REFERENCES holder_entities(id),
  is_default_stock INTEGER NOT NULL DEFAULT 0,
  attrs            TEXT NOT NULL DEFAULT '{}',
  archived_at      TEXT,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  UNIQUE(type, name, parent_id)
);
-- +goose StatementEnd

-- +goose StatementBegin
-- At most one default stock point across the whole system.
CREATE UNIQUE INDEX ux_default_stock
  ON holder_entities(is_default_stock) WHERE is_default_stock = 1;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE TABLE categories (
  id          TEXT PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  parent_id   TEXT REFERENCES categories(id),
  path        TEXT NOT NULL,                       -- '/root/child/self/'
  sn_template TEXT,                                -- empty inherits from the parent chain
  archived_at TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE INDEX ix_categories_path ON categories(path);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE TABLE field_definitions (
  id          TEXT PRIMARY KEY,
  key         TEXT NOT NULL UNIQUE,
  label       TEXT NOT NULL,
  type        TEXT NOT NULL,                       -- text|number|boolean|date|enum
                                                   -- |reference|mac|ip|url|computed
  options     TEXT NOT NULL DEFAULT '{}',
  is_unique   INTEGER NOT NULL DEFAULT 0,
  archived_at TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE TABLE category_fields (
  category_id TEXT NOT NULL REFERENCES categories(id),
  field_id    TEXT NOT NULL REFERENCES field_definitions(id),
  required    INTEGER NOT NULL DEFAULT 0,
  sort        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (category_id, field_id)
);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE TABLE product_models (
  id            TEXT PRIMARY KEY,
  category_id   TEXT NOT NULL REFERENCES categories(id),
  name          TEXT NOT NULL,
  vendor        TEXT,
  image_url     TEXT,
  attr_defaults TEXT NOT NULL DEFAULT '{}',
  archived_at   TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  UNIQUE(category_id, name)
);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE TABLE assets (
  id          TEXT PRIMARY KEY,
  sn          TEXT NOT NULL UNIQUE,
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
CREATE INDEX ix_assets_cat_status ON assets(category_id, status);
-- +goose StatementEnd
-- +goose StatementBegin
CREATE INDEX ix_assets_owner ON assets(owner_id);
-- +goose StatementEnd
-- +goose StatementBegin
CREATE INDEX ix_assets_holder ON assets(holder_type, holder_id);
-- +goose StatementEnd
-- +goose StatementBegin
-- Expression index: uniqueness checks and search both go through it.
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
CREATE TABLE asset_transfers (
  id               TEXT PRIMARY KEY,
  asset_id         TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  batch_id         TEXT,
  kind             TEXT NOT NULL,                  -- create|checkout|checkin
                                                   -- |transfer|reassign|status_change
  from_status      TEXT,
  from_holder_type TEXT,
  from_holder_id   TEXT,
  from_owner_id    TEXT,
  to_status        TEXT NOT NULL,
  to_holder_type   TEXT NOT NULL,
  to_holder_id     TEXT NOT NULL,
  to_owner_id      TEXT NOT NULL,
  note             TEXT,
  due_at           TEXT,
  actor_id         TEXT NOT NULL REFERENCES users(id),
  created_at       TEXT NOT NULL,
  edited_at        TEXT,
  edited_by        TEXT,
  original         TEXT
);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE INDEX ix_transfers_asset ON asset_transfers(asset_id, created_at DESC);
-- +goose StatementEnd
-- +goose StatementBegin
CREATE INDEX ix_transfers_batch ON asset_transfers(batch_id);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE TABLE audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id    TEXT NOT NULL,
  action      TEXT NOT NULL,                       -- create|update|archive|delete|recompute
  target_type TEXT NOT NULL,
  target_id   TEXT NOT NULL,
  before      TEXT,
  after       TEXT,
  created_at  TEXT NOT NULL
);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE INDEX ix_audit_target ON audit_log(target_type, target_id, created_at DESC);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS audit_log;
DROP TABLE IF EXISTS asset_transfers;
DROP TABLE IF EXISTS asset_sn_history;
DROP TABLE IF EXISTS assets;
DROP TABLE IF EXISTS product_models;
DROP TABLE IF EXISTS category_fields;
DROP TABLE IF EXISTS field_definitions;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS holder_entities;
DROP TABLE IF EXISTS users;
-- +goose StatementEnd
