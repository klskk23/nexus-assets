package auth

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/klskk23/nexus-assets/internal/store"
)

// KeyPrefix marks a token as an API key rather than a session JWT, so the
// middleware can tell them apart before it does any work on either.
const KeyPrefix = "nxk_"

// ErrKeyRejected covers an unknown, expired or revoked key. One error, for the
// same reason as ErrRefreshRejected.
var ErrKeyRejected = errors.New("api key rejected")

// APIKey is one key as the owner sees it. The secret is not here: it exists
// once, in the response that created it.
type APIKey struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	// Prefix is absent on the configuration file's key: nothing in the
	// database corresponds to it, so there is no half of it to show.
	Prefix     string     `json:"prefix,omitempty"`
	ExpiresAt  *time.Time `json:"expires_at,omitempty"`
	LastUsedAt *time.Time `json:"last_used_at,omitempty"`
	CreatedAt  time.Time  `json:"created_at"`
	// FromConfig marks the key that lives in the configuration file. It is
	// listed so nobody wonders what is authenticating those requests, and it
	// cannot be revoked here: it goes away by being edited out and restarted.
	FromConfig bool `json:"from_config,omitempty"`
}

// ConfigKeyID names the entry that stands for the configuration file's key.
// Not a row: nothing in the database corresponds to it.
const ConfigKeyID = "config"

// Keys stores API keys.
//
// A key acts as the account that made it: this product has no roles, and
// inventing a second permission model for scripts would mean two answers to
// "who may do this".
type Keys struct {
	db  *store.Store
	now func() time.Time
}

// NewKeys builds the store.
func NewKeys(db *store.Store) *Keys { return &Keys{db: db, now: time.Now} }

// Create mints a key and returns the one and only copy of its secret.
func (k *Keys) Create(ctx context.Context, userID, name string, expires *time.Time) (APIKey, string, error) {
	secret, err := newSecret()
	if err != nil {
		return APIKey{}, "", err
	}
	id := store.NewID()
	// The readable half is the id: it identifies the row without revealing
	// anything, and it is what the list shows.
	prefix := KeyPrefix + strings.ReplaceAll(id, "-", "")[:12]
	token := prefix + "." + secret

	now := k.now().UTC()
	out := APIKey{ID: id, Name: name, Prefix: prefix, ExpiresAt: expires, CreatedAt: now}

	err = k.db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		var exp any
		if expires != nil {
			exp = store.FormatTime(expires.UTC())
		}
		_, err := tx.ExecContext(ctx,
			`INSERT INTO api_keys (id, user_id, name, prefix, secret_hash, expires_at, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?)`,
			id, userID, name, prefix, hashToken(secret), exp, store.FormatTime(now))
		return err
	})
	if err != nil {
		return APIKey{}, "", fmt.Errorf("write api key: %w", err)
	}
	return out, token, nil
}

// List returns one account's keys, newest first. Revoked keys are gone from
// the list because a revoked key is not a thing anyone needs to look at.
func (k *Keys) List(ctx context.Context, userID string) ([]APIKey, error) {
	rows, err := k.db.ReadDB().QueryContext(ctx,
		`SELECT id, name, prefix, expires_at, last_used_at, created_at
		   FROM api_keys WHERE user_id = ? AND revoked_at IS NULL
		   ORDER BY created_at DESC`, userID)
	if err != nil {
		return nil, fmt.Errorf("list api keys: %w", err)
	}
	defer rows.Close()

	out := []APIKey{}
	for rows.Next() {
		var a APIKey
		var expires, lastUsed sql.NullString
		var created string
		if err := rows.Scan(&a.ID, &a.Name, &a.Prefix, &expires, &lastUsed, &created); err != nil {
			return nil, err
		}
		if a.CreatedAt, err = store.ParseTime(created); err != nil {
			return nil, err
		}
		if a.ExpiresAt, err = optionalTime(expires); err != nil {
			return nil, err
		}
		if a.LastUsedAt, err = optionalTime(lastUsed); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

// Revoke ends a key. Scoped to its owner so one account cannot revoke another's.
func (k *Keys) Revoke(ctx context.Context, userID, id string) error {
	return k.db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		res, err := tx.ExecContext(ctx,
			`UPDATE api_keys SET revoked_at = ?
			  WHERE id = ? AND user_id = ? AND revoked_at IS NULL`,
			store.FormatTime(k.now().UTC()), id, userID)
		if err != nil {
			return err
		}
		if n, _ := res.RowsAffected(); n == 0 {
			return ErrNotFound
		}
		return nil
	})
}

// Resolve turns a presented key into the account it acts as.
//
// last_used_at is written at most once a minute: the column exists so an
// operator can spot a key nothing uses any more, and that question does not
// need per-request precision -- while a write per request would put every API
// call through the single write connection.
func (k *Keys) Resolve(ctx context.Context, token string) (string, error) {
	prefix, secret, ok := strings.Cut(token, ".")
	if !ok || !strings.HasPrefix(prefix, KeyPrefix) {
		return "", ErrKeyRejected
	}

	var id, userID, hash string
	var expires, lastUsed sql.NullString
	err := k.db.ReadDB().QueryRowContext(ctx,
		`SELECT id, user_id, secret_hash, expires_at, last_used_at
		   FROM api_keys WHERE prefix = ? AND revoked_at IS NULL`, prefix).
		Scan(&id, &userID, &hash, &expires, &lastUsed)
	if errors.Is(err, sql.ErrNoRows) {
		return "", ErrKeyRejected
	}
	if err != nil {
		return "", err
	}
	if hashToken(secret) != hash {
		return "", ErrKeyRejected
	}

	now := k.now().UTC()
	exp, err := optionalTime(expires)
	if err != nil {
		return "", err
	}
	if exp != nil && !now.Before(*exp) {
		return "", ErrKeyRejected
	}

	used, err := optionalTime(lastUsed)
	if err != nil {
		return "", err
	}
	if used == nil || now.Sub(*used) > time.Minute {
		if err := k.db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
			_, err := tx.ExecContext(ctx,
				`UPDATE api_keys SET last_used_at = ? WHERE id = ?`, store.FormatTime(now), id)
			return err
		}); err != nil {
			return "", err
		}
	}
	return userID, nil
}

func optionalTime(v sql.NullString) (*time.Time, error) {
	if !v.Valid || v.String == "" {
		return nil, nil
	}
	t, err := store.ParseTime(v.String)
	if err != nil {
		return nil, err
	}
	return &t, nil
}
