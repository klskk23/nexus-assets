-- +goose Up
-- +goose StatementBegin
-- Searchable is a property of the field, and it is not the same property as
-- unique. A service tag is worth finding by and need not be one-of-a-kind;
-- until now the two were the same switch, so the only way to make a value
-- findable was to promise it was unique.
ALTER TABLE field_definitions ADD COLUMN searchable INTEGER NOT NULL DEFAULT 0;
-- +goose StatementEnd

-- +goose StatementBegin
-- Everything that exists today becomes searchable, so nobody loses an ability
-- to the upgrade. Only unique values were reachable before, and those stay
-- reachable through their own table -- this simply stops the two ideas being
-- one switch from here on.
UPDATE field_definitions SET searchable = 1;
-- +goose StatementEnd

-- +goose StatementBegin
-- Deliberately not a column on asset_unique_values.
--
-- exactMatch -- the rule that sends a scanner straight to the device when the
-- search finds exactly one -- reads that table. Put non-unique values there and
-- two devices sharing a service tag would fling somebody into one of them at
-- random. Uniqueness and findability are different questions and they get
-- different tables.
--
-- Current values only. The unique table keeps archived ones because an old
-- asset number is still an identity claim: somebody holding the old label
-- should find the device. An ordinary searchable value makes no such claim,
-- and keeping its history would only fill the results with what things used
-- to be.
CREATE TABLE asset_search_values (
  asset_id  TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  field_key TEXT NOT NULL,
  value     TEXT NOT NULL,
  PRIMARY KEY (asset_id, field_key)
);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE INDEX ix_search_values_value ON asset_search_values(value);
-- +goose StatementEnd

-- +goose StatementBegin
-- Backfill, or the switch above is a promise the index does not keep.
--
-- Flipping searchable on for every field and stopping there leaves the search
-- reaching only devices saved after the upgrade -- findable and unfindable
-- rows side by side with nothing on screen to tell them apart. That is the
-- failure this feature exists to remove, so shipping the upgrade with it would
-- have been the joke telling itself.
--
-- DISTINCT on the key because two fields may legitimately share one (v6
-- decision 71 dropped the global unique on field_definitions.key), while a row
-- here is one value per asset per key.
--
-- Blank values stay out, for the same reason the write path skips them: an
-- empty string in the index is matched by every substring search.
INSERT INTO asset_search_values (asset_id, field_key, value)
SELECT a.id, k.key, trim(json_extract(a.attrs, '$.' || k.key))
  FROM assets a
  JOIN (SELECT DISTINCT key FROM field_definitions) k
 WHERE json_extract(a.attrs, '$.' || k.key) IS NOT NULL
   AND trim(json_extract(a.attrs, '$.' || k.key)) <> '';
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE asset_search_values;
-- +goose StatementEnd

-- +goose StatementBegin
ALTER TABLE field_definitions DROP COLUMN searchable;
-- +goose StatementEnd
