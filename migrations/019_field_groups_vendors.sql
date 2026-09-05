-- Field groups, and vendors as a thing rather than a string.
--
-- Two independent additions that share a migration because both touch what a
-- field can be bound to.
--
-- A field group is a shortcut, not a structure: binding a group writes the same
-- rows a person would have written one at a time, so nothing downstream ever
-- learns that groups exist. That is why there is no group column on any
-- binding table -- the expansion leaves no trace, deliberately.
--
-- A vendor is the opposite: models inherit from it live, so a model created
-- next month arrives with its vendor's fields and nobody has to remember.
--
-- No transaction: product_models has to be rebuilt to shed its inline
-- UNIQUE(vendor, name), and rebuilding a table that others reference needs
-- PRAGMA foreign_keys=off, which is a no-op inside one. Same reason as 003.
-- +goose NO TRANSACTION

-- +goose Up
-- +goose StatementBegin
PRAGMA foreign_keys = off;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE TABLE vendors (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
-- +goose StatementEnd

-- One vendor per distinct string, verbatim. Dell, DELL and 戴尔 stay three
-- vendors.
--
-- Not tidiness lost, but a migration that cannot fail: merging them would put
-- two models that legitimately coexist as (Dell, X1) and (DELL, X1) under one
-- vendor with one name, and the unique index below would refuse to build --
-- on somebody's production database, halfway through an upgrade. Because the
-- backfill does not merge, the new (vendor_id, name) pairs are one-to-one with
-- the old (vendor, name) pairs, so the index is guaranteed to build.
--
-- Merging is a later, manual act that can look at what it is about to collide
-- and say so.
-- +goose StatementBegin
INSERT INTO vendors (id, name, created_at, updated_at)
SELECT lower(hex(randomblob(16))), vendor,
       strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM (SELECT DISTINCT vendor FROM product_models WHERE vendor <> '');
-- +goose StatementEnd

-- Rebuilt rather than altered: the old UNIQUE(vendor, name) is an inline table
-- constraint, and SQLite will not drop the auto-index behind one. Leaving it
-- would be worse than it sounds -- new rows default vendor to '', so two new
-- models of different vendors sharing a name would collide on a column nothing
-- writes any more.
--
-- The vendor text column survives the rebuild. The down migration reads it,
-- and it is the only thing left to check the backfill against.
-- +goose StatementBegin
CREATE TABLE product_models_new (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  vendor        TEXT NOT NULL DEFAULT '',   -- pre-019 value; nothing writes it now
  vendor_id     TEXT REFERENCES vendors(id),
  image_url     TEXT,
  attr_defaults TEXT NOT NULL DEFAULT '{}',
  archived_at   TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
-- +goose StatementEnd

-- +goose StatementBegin
INSERT INTO product_models_new
  (id, name, vendor, vendor_id, image_url, attr_defaults, archived_at, created_at, updated_at)
SELECT m.id, m.name, m.vendor,
       (SELECT v.id FROM vendors v WHERE v.name = m.vendor),
       m.image_url, m.attr_defaults, m.archived_at, m.created_at, m.updated_at
FROM product_models m;
-- +goose StatementEnd

-- +goose StatementBegin
DROP TABLE product_models;
-- +goose StatementEnd
-- +goose StatementBegin
ALTER TABLE product_models_new RENAME TO product_models;
-- +goose StatementEnd

-- ifnull() is the whole point. A plain UNIQUE(vendor_id, name) would let any
-- number of same-named vendorless models coexist, because SQLite treats NULLs
-- as distinct -- which is the bug migration 003 exists to prevent, and it would
-- come straight back the moment vendor_id became nullable. Folding every "no
-- vendor" onto one value keeps the guarantee without inventing a fake
-- "unspecified" vendor that would show up in lists and could be bound to.
-- +goose StatementBegin
CREATE UNIQUE INDEX ux_models_vendor_name ON product_models(ifnull(vendor_id,''), name);
-- +goose StatementEnd

-- Shaped exactly like model_fields (017), which is shaped like category_fields.
-- Three identical shapes is what lets "is this field bound somewhere else?" be
-- one question asked three times instead of three special cases.
--
-- field_id carries no cascade, on purpose: deleting a field must go through
-- deleteFieldTx, which removes these rows explicitly. 017 left that out for
-- model_fields and deleting a model-bound field returned 500 until v0.8.3.
-- +goose StatementBegin
CREATE TABLE vendor_fields (
  vendor_id TEXT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  field_id  TEXT NOT NULL REFERENCES field_definitions(id),
  sort      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (vendor_id, field_id)
);
-- +goose StatementEnd
-- +goose StatementBegin
CREATE INDEX ix_vendor_fields_field ON vendor_fields(field_id);
-- +goose StatementEnd

-- Group membership cascades on both sides, unlike every binding table above.
-- The difference is what is lost: a binding row losing its field would orphan
-- values people typed, while a membership row losing either end costs nobody
-- anything -- the group was only ever a way of naming a handful of fields at
-- once.
-- +goose StatementBegin
CREATE TABLE field_groups (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
-- +goose StatementEnd
-- +goose StatementBegin
CREATE TABLE field_group_members (
  group_id TEXT NOT NULL REFERENCES field_groups(id) ON DELETE CASCADE,
  field_id TEXT NOT NULL REFERENCES field_definitions(id) ON DELETE CASCADE,
  sort     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (group_id, field_id)
);
-- +goose StatementEnd
-- +goose StatementBegin
CREATE INDEX ix_group_members_field ON field_group_members(field_id);
-- +goose StatementEnd

-- +goose StatementBegin
PRAGMA foreign_keys = on;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
PRAGMA foreign_keys = off;
-- +goose StatementEnd

-- +goose StatementBegin
DROP TABLE IF EXISTS field_group_members;
-- +goose StatementEnd
-- +goose StatementBegin
DROP TABLE IF EXISTS field_groups;
-- +goose StatementEnd
-- +goose StatementBegin
DROP INDEX IF EXISTS ix_vendor_fields_field;
-- +goose StatementEnd
-- +goose StatementBegin
DROP TABLE IF EXISTS vendor_fields;
-- +goose StatementEnd

-- Back to the inline constraint. The vendor text column was carried through
-- untouched, so the old shape needs nothing reconstructed -- which is why it
-- was carried through.
-- +goose StatementBegin
CREATE TABLE product_models_old (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  vendor        TEXT NOT NULL DEFAULT '',
  image_url     TEXT,
  attr_defaults TEXT NOT NULL DEFAULT '{}',
  archived_at   TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  UNIQUE(vendor, name)
);
-- +goose StatementEnd

-- coalesce, not the stored text: a vendor created or renamed after 019 only
-- exists in vendors, and dropping back to the pre-019 column should carry it
-- rather than resurrect a stale string.
-- +goose StatementBegin
INSERT INTO product_models_old (id, name, vendor, image_url, attr_defaults, archived_at, created_at, updated_at)
SELECT m.id, m.name,
       coalesce((SELECT v.name FROM vendors v WHERE v.id = m.vendor_id), m.vendor, ''),
       m.image_url, m.attr_defaults, m.archived_at, m.created_at, m.updated_at
FROM product_models m;
-- +goose StatementEnd

-- +goose StatementBegin
DROP INDEX IF EXISTS ux_models_vendor_name;
-- +goose StatementEnd
-- +goose StatementBegin
DROP TABLE product_models;
-- +goose StatementEnd
-- +goose StatementBegin
ALTER TABLE product_models_old RENAME TO product_models;
-- +goose StatementEnd
-- +goose StatementBegin
DROP TABLE IF EXISTS vendors;
-- +goose StatementEnd

-- +goose StatementBegin
PRAGMA foreign_keys = on;
-- +goose StatementEnd
