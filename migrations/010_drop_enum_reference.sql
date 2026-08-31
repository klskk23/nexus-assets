-- Field types "enum" and "reference" are withdrawn (011 decision).
--
-- Neither earned its complexity: a single-choice list is a text field whose
-- values happen to repeat, and a reference field pointed at a user or a holder
-- without anything ever checking that the target still existed -- the owner and
-- the holder are columns on the asset, which is where those questions belong.
--
-- Existing fields are converted to text rather than deleted. The values are
-- already strings in assets.attrs, so they stay exactly as they are and stay
-- readable; only the configuration that no longer means anything is dropped.
-- Deleting the fields instead would have thrown away data to save a migration.

-- +goose Up
-- +goose StatementBegin
UPDATE field_definitions
   SET type       = 'text',
       options    = '{}',
       updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
 WHERE type IN ('enum', 'reference');
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
-- Lossy by nature: which fields were enums, what their choices were and what
-- each reference pointed at are gone once converted. Rolling back leaves them
-- as text fields, which is the honest outcome rather than a guess.
SELECT 1;
-- +goose StatementEnd
