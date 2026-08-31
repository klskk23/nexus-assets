-- The location constraint on a status goes away entirely.
--
-- It started as a hard rule in 001 ("in stock" meant a shelf in a warehouse),
-- became a column in 004, and was switched off in 005 once it turned out to be
-- blocking something legitimate: handing stock to a company or a department.
-- What was left was a switch nobody had a reason to turn on -- and a switch
-- with no use is a question every reader has to answer before they can trust
-- the code around it.
--
-- The default stock point is still required to be a location. That is a
-- different rule: check-in has to name somewhere specific to return to.

-- +goose Up
-- +goose StatementBegin
ALTER TABLE statuses DROP COLUMN requires_location;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
-- Restored off for every status, which is where 005 left it. Nothing could
-- have turned it on since, because the code that read it is gone.
ALTER TABLE statuses ADD COLUMN requires_location INTEGER NOT NULL DEFAULT 0;
-- +goose StatementEnd
