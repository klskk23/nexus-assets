-- Holders gain a note and a real hierarchy, and in_stock stops insisting on a
-- location.
--
-- Three unrelated-looking changes with one cause: the holder side of the model
-- was thinner than the way people actually describe custody. A department is
-- not a free-floating thing, it belongs to a company; a warehouse usually sits
-- under one too; and "which warehouse" was being enforced as a rule when it is
-- really a policy -- stock can legitimately sit in a company's or a
-- department's custody.
--
-- parent_id has existed since 001 and was never validated or used. This
-- migration does not backfill it: an existing department has no company to
-- point at, and inventing one would be worse than leaving it null. The rule
-- applies to what gets written from here on.

-- +goose Up
-- +goose StatementBegin
ALTER TABLE holder_entities ADD COLUMN note TEXT NOT NULL DEFAULT '';
-- +goose StatementEnd

-- +goose StatementBegin
-- in_stock no longer constrains the holder to a location. The switch stays --
-- a custom status may still want it -- but it is off for the one status that
-- had it, because refusing to hand stock to a department is a policy nobody
-- asked this system to enforce.
UPDATE statuses
   SET requires_location = 0,
       updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
 WHERE key = 'in_stock';
-- +goose StatementEnd

-- +goose StatementBegin
-- Parent lookups run on every holder list; the tree is small but the index
-- costs nothing and keeps the child count from being a scan.
CREATE INDEX ix_holder_parent ON holder_entities(parent_id);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP INDEX IF EXISTS ix_holder_parent;
-- +goose StatementEnd

-- +goose StatementBegin
ALTER TABLE holder_entities DROP COLUMN note;
-- +goose StatementEnd

-- +goose StatementBegin
UPDATE statuses
   SET requires_location = 1,
       updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
 WHERE key = 'in_stock';
-- +goose StatementEnd
