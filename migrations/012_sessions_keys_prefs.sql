-- Sessions that can be refreshed, keys that can call the API, and preferences
-- that follow the person rather than the browser.
--
-- Three tables' worth of one idea: what a signed-in account is allowed to
-- carry with it. A refresh token is a long-lived credential the browser holds,
-- an API key is the same thing for a script, and both need a way to be taken
-- away -- which a stateless JWT never had.

-- +goose Up
-- +goose StatementBegin
CREATE TABLE sessions (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- The token is never stored. A stolen database must not hand over live
  -- sessions, which is the whole reason a refresh token beats a long JWT.
  token_hash   TEXT NOT NULL UNIQUE,
  -- Every rotation of one sign-in shares a family. A replayed token revokes
  -- the family, because two holders of one chain means one of them is a thief.
  family_id    TEXT NOT NULL,
  issued_at    TEXT NOT NULL,
  expires_at   TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at   TEXT,
  -- What replaced it, so a replay can be told from a token that never worked.
  replaced_by  TEXT
);
-- +goose StatementEnd
-- +goose StatementBegin
CREATE INDEX ix_sessions_user ON sessions(user_id);
-- +goose StatementEnd
-- +goose StatementBegin
CREATE INDEX ix_sessions_family ON sessions(family_id);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE TABLE api_keys (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  -- The readable half, shown in the list so a key can be recognised without
  -- being revealed.
  prefix       TEXT NOT NULL UNIQUE,
  secret_hash  TEXT NOT NULL,
  -- NULL means it does not expire on its own; the UI always sets one.
  expires_at   TEXT,
  last_used_at TEXT,
  revoked_at   TEXT,
  created_at   TEXT NOT NULL
);
-- +goose StatementEnd
-- +goose StatementBegin
CREATE INDEX ix_api_keys_user ON api_keys(user_id);
-- +goose StatementEnd

-- +goose StatementBegin
-- Preferences belong to the person, not to the browser they happened to use.
-- Empty means "follow the system", which is what both settings did before.
ALTER TABLE users ADD COLUMN lang TEXT NOT NULL DEFAULT '';
-- +goose StatementEnd
-- +goose StatementBegin
ALTER TABLE users ADD COLUMN theme TEXT NOT NULL DEFAULT '';
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE users DROP COLUMN theme;
-- +goose StatementEnd
-- +goose StatementBegin
ALTER TABLE users DROP COLUMN lang;
-- +goose StatementEnd
-- +goose StatementBegin
DROP TABLE IF EXISTS api_keys;
-- +goose StatementEnd
-- +goose StatementBegin
DROP TABLE IF EXISTS sessions;
-- +goose StatementEnd
