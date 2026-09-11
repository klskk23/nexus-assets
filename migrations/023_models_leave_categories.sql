-- +goose Up
-- +goose StatementBegin
-- A model does not belong to a category, and now nothing records that it does.
--
-- 026 decided the relationship was wrong -- what a device can record is its
-- category chain, its own model and that model's vendor, and whether the model
-- was "registered under" the category has nothing to do with it. The table was
-- kept as a demotion: a hint that put the associated models first in the entry
-- form, and a line in the category delete dialog saying which models would come
-- loose.
--
-- Keeping it cost more than the hint was worth. It stayed in the WHERE clause
-- of four guards that 026 did not reach -- among them boundPaths, which decides
-- how far a field's delete guards reach, and which answered "nowhere" for a
-- model-bound field whose model happened to be associated with nothing. After
-- 026 that is the ordinary case, not an edge, and the guards it switched off
-- are the ones that refuse to delete a field devices still hold values for.
--
-- Dropping the table rather than leaving it unread. An unread table with a
-- category_id that has no ON DELETE CASCADE is a trap with a fuse: stop writing
-- it and the rows stay, and the next category delete fails a foreign key on
-- rows nothing in the product can see or clear.
--
-- The associations themselves are the thing being deleted, so there is nothing
-- to migrate them into. Down recreates the table empty.
DROP TABLE product_model_categories;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
CREATE TABLE product_model_categories (
  model_id    TEXT NOT NULL REFERENCES product_models(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES categories(id),
  PRIMARY KEY (model_id, category_id)
);
-- +goose StatementEnd
-- +goose StatementBegin
CREATE INDEX ix_pmc_category ON product_model_categories(category_id);
-- +goose StatementEnd
