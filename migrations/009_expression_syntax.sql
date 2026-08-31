-- Computed fields move from text/template to expressions.
--
-- The rules stored in field_definitions.options.template are written in the
-- old {{ .attrs.mac | hex2dec }} syntax and will not parse under the new
-- engine. They cannot be rewritten in SQL: the two engines order pipe
-- arguments differently, so `pad 16` has to become `pad(x, 16)`, which needs
-- the syntax tree rather than string surgery.
--
-- So the translation happens in Go, at startup, right after this migration --
-- see internal/store/translate.go. This file exists to mark the boundary and
-- to record which side of it a database is on.
--
-- A serial number is a unique index. The translator refuses anything it cannot
-- carry over exactly rather than guessing, and the startup step reports every
-- rule it could not translate instead of leaving a broken one behind.

-- +goose Up
-- +goose StatementBegin
CREATE TABLE expression_syntax_migration (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  migrated_at   TEXT NOT NULL,
  translated    INTEGER NOT NULL DEFAULT 0,
  failed        INTEGER NOT NULL DEFAULT 0
);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
-- Lossy by nature: the old text of each rule is gone once it is translated.
-- Rolling back leaves expressions in a database whose code expects templates,
-- which is why the marker table is what the Down removes -- so a re-upgrade
-- runs the translation again and finds nothing left to do.
DROP TABLE IF EXISTS expression_syntax_migration;
-- +goose StatementEnd
