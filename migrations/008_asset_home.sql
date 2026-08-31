-- Every asset gets a home: where it belongs when it is not out.
--
-- Check-in has only ever had one destination, the single global default stock
-- point. That works while everything lives in one warehouse and stops working
-- the moment it does not: returning a Shanghai device to the Beijing shelf is
-- not a rounding error, it is a wrong answer written into the ledger.
--
-- So the destination moves onto the asset. The global default stock point
-- keeps its job -- it is what a device's home defaults TO when one is not
-- named, and what check-in falls back to for devices recorded before this.
--
-- All three are nullable. A null home is not a missing value, it means "no
-- opinion, use the global default", which is exactly what every existing row
-- means today.

-- +goose Up
-- +goose StatementBegin
ALTER TABLE assets ADD COLUMN home_holder_type TEXT;
-- +goose StatementEnd

-- +goose StatementBegin
ALTER TABLE assets ADD COLUMN home_holder_id TEXT;
-- +goose StatementEnd

-- +goose StatementBegin
ALTER TABLE assets ADD COLUMN home_owner_id TEXT REFERENCES users(id);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE assets DROP COLUMN home_owner_id;
-- +goose StatementEnd

-- +goose StatementBegin
ALTER TABLE assets DROP COLUMN home_holder_id;
-- +goose StatementEnd

-- +goose StatementBegin
ALTER TABLE assets DROP COLUMN home_holder_type;
-- +goose StatementEnd
