-- Asset statuses become data.
--
-- The five were Go constants carrying behaviour, not labels: a transition
-- matrix, a holder constraint, an exclusion from the category distribution and
-- the names of two transfer kinds. Each of those becomes a column so an
-- administrator can add a status without a release.
--
-- assets.status gains no foreign key. The application already refuses to delete
-- a status any asset is using, and a third rebuild of assets buys nothing on
-- top of that.

-- +goose Up
-- +goose StatementBegin
CREATE TABLE statuses (
  key                 TEXT PRIMARY KEY,
  label               TEXT NOT NULL,
  -- A name from the palette in index.css, never a hex value: a colour that
  -- reads well on white is rarely the one that reads well on black, and the
  -- palette is defined once per theme.
  color               TEXT NOT NULL DEFAULT 'slate',
  sort                INTEGER NOT NULL DEFAULT 0,
  -- Built-ins carry the behaviour the rest of the system is written against.
  -- They can be relabelled and recoloured; they cannot be removed.
  builtin             INTEGER NOT NULL DEFAULT 0,
  -- Replaces RequiresLocationHolder: the device is in a warehouse, so "in this
  -- status but held by a person" would make the stocktake unanswerable.
  requires_location   INTEGER NOT NULL DEFAULT 0,
  -- Replaces the hardcoded exclusion of retired from the category distribution.
  counts_as_available INTEGER NOT NULL DEFAULT 1,
  -- Replaces "retired is terminal", generalised: any status may be an end.
  terminal            INTEGER NOT NULL DEFAULT 0,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);
-- +goose StatementEnd

-- +goose StatementBegin
INSERT INTO statuses
  (key, label, color, sort, builtin, requires_location, counts_as_available, terminal, created_at, updated_at)
VALUES
  ('in_stock',  '在库',   'green', 10, 1, 1, 1, 0, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  ('in_use',    '已签出', 'blue',  20, 1, 0, 1, 0, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  ('in_repair', '维修中', 'amber', 30, 1, 0, 1, 0, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  ('lost',      '丢失',   'red',   40, 1, 0, 1, 0, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  ('retired',   '已报废', 'slate', 50, 1, 0, 0, 1, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));
-- +goose StatementEnd

-- +goose StatementBegin
CREATE INDEX ix_statuses_sort ON statuses(sort, key);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS statuses;
-- +goose StatementEnd
