-- +goose Up
-- A note on the product model.
--
-- The same thing the device note is (v2), one level up: a sentence about the
-- thing itself, belonging to no category's field set. "Discontinued, buy the
-- 5430 instead", "the fan rattles above 40C", "only the -B revision takes the
-- 25G module". Those are facts about the model, and until now the only place to
-- put them was a text field on some category -- which meant one copy per
-- category, and nobody able to search them together.
--
-- Deliberately not a field definition. A field is something an asset records
-- and a category asks for; this is configuration, read on the model page and
-- nowhere else. Making it a field would put it on the entry form of every
-- device of that model, once per device, for a sentence that is the same for
-- all of them.
--
-- NOT NULL DEFAULT '' rather than nullable: "no note" and "an empty note" are
-- not two states anybody can act on differently, and one representation means
-- no reader has to remember which they got.
-- +goose StatementBegin
ALTER TABLE product_models ADD COLUMN note TEXT NOT NULL DEFAULT '';
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE product_models DROP COLUMN note;
-- +goose StatementEnd
