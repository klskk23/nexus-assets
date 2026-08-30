-- Field lifecycle and model ownership.
--
-- Information items stop being archivable and become deletable: the rule "only
-- disable, never delete" exists to protect configuration that has already
-- produced data, and a field nobody ever filled in is not that. Models stop
-- belonging to exactly one category.
--
-- No transaction: rebuilding tables under foreign keys needs PRAGMA
-- foreign_keys=off, which is a no-op inside one.
-- +goose NO TRANSACTION

-- +goose Up
-- +goose StatementBegin
PRAGMA foreign_keys = off;
-- +goose StatementEnd

-- +goose StatementBegin
-- Stash the single-valued ownership before the column carrying it disappears.
CREATE TABLE pmc_seed AS SELECT id AS model_id, category_id FROM product_models;
-- +goose StatementEnd

-- +goose StatementBegin
-- Archiving leaves the information item: one way down, decided by the system.
CREATE TABLE field_definitions_new (
  id          TEXT PRIMARY KEY,
  key         TEXT NOT NULL UNIQUE,
  label       TEXT NOT NULL,
  type        TEXT NOT NULL,                       -- text|number|boolean|date|enum
                                                   -- |reference|mac|ip|url|computed
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
-- vendor must be NOT NULL: SQLite treats NULLs as distinct in a UNIQUE index,
-- so a nullable vendor would let any number of same-named models coexist while
-- the schema still looked constrained.
CREATE TABLE product_models_new (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  vendor        TEXT NOT NULL DEFAULT '',
  image_url     TEXT,
  attr_defaults TEXT NOT NULL DEFAULT '{}',
  archived_at   TEXT,                              -- models stay archivable
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  UNIQUE(vendor, name)
);
-- +goose StatementEnd
-- +goose StatementBegin
INSERT INTO product_models_new (id, name, vendor, image_url, attr_defaults, archived_at, created_at, updated_at)
SELECT id, name, coalesce(vendor, ''), image_url, attr_defaults, archived_at, created_at, updated_at
FROM product_models;
-- +goose StatementEnd
-- +goose StatementBegin
DROP TABLE product_models;
-- +goose StatementEnd
-- +goose StatementBegin
ALTER TABLE product_models_new RENAME TO product_models;
-- +goose StatementEnd

-- +goose StatementBegin
-- Created after the rename so its foreign key resolves to the rebuilt table.
CREATE TABLE product_model_categories (
  model_id    TEXT NOT NULL REFERENCES product_models(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES categories(id),
  PRIMARY KEY (model_id, category_id)
);
-- +goose StatementEnd
-- +goose StatementBegin
INSERT INTO product_model_categories (model_id, category_id)
SELECT model_id, category_id FROM pmc_seed;
-- +goose StatementEnd
-- +goose StatementBegin
DROP TABLE pmc_seed;
-- +goose StatementEnd
-- +goose StatementBegin
CREATE INDEX ix_pmc_category ON product_model_categories(category_id);
-- +goose StatementEnd

-- +goose StatementBegin
PRAGMA foreign_keys = on;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
PRAGMA foreign_keys = off;
-- +goose StatementEnd

-- +goose StatementBegin
-- Lossy by nature: many-to-many collapses to one. The schema is restored, the
-- associations beyond the first are not.
CREATE TABLE pmc_back AS
  SELECT model_id, min(category_id) AS category_id FROM product_model_categories GROUP BY model_id;
-- +goose StatementEnd
-- +goose StatementBegin
DROP TABLE product_model_categories;
-- +goose StatementEnd
-- +goose StatementBegin
CREATE TABLE product_models_old (
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
INSERT INTO product_models_old (id, category_id, name, vendor, image_url, attr_defaults, archived_at, created_at, updated_at)
SELECT m.id, coalesce(b.category_id, (SELECT id FROM categories LIMIT 1)),
       m.name, m.vendor, m.image_url, m.attr_defaults, m.archived_at, m.created_at, m.updated_at
FROM product_models m LEFT JOIN pmc_back b ON b.model_id = m.id;
-- +goose StatementEnd
-- +goose StatementBegin
DROP TABLE product_models;
-- +goose StatementEnd
-- +goose StatementBegin
ALTER TABLE product_models_old RENAME TO product_models;
-- +goose StatementEnd
-- +goose StatementBegin
DROP TABLE pmc_back;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE TABLE field_definitions_old (
  id          TEXT PRIMARY KEY,
  key         TEXT NOT NULL UNIQUE,
  label       TEXT NOT NULL,
  type        TEXT NOT NULL,
  options     TEXT NOT NULL DEFAULT '{}',
  is_unique   INTEGER NOT NULL DEFAULT 0,
  archived_at TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
-- +goose StatementEnd
-- +goose StatementBegin
INSERT INTO field_definitions_old (id, key, label, type, options, is_unique, archived_at, created_at, updated_at)
SELECT id, key, label, type, options, is_unique, NULL, created_at, updated_at FROM field_definitions;
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
