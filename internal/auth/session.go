package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"github.com/klskk23/nexus-assets/internal/store"
)

// ErrRefreshRejected covers every reason a refresh token will not do: expired,
// revoked, unknown, or replayed after it was rotated away.
//
// One error on purpose. The holder of a bad token learns nothing from which of
// those it was, and the operator has the log.
var ErrRefreshRejected = errors.New("refresh token rejected")

// Sessions issues and rotates the long-lived half of a sign-in.
//
// The access token stays a stateless JWT, minutes long. What lives here is the
// thing that can be taken away: a hash of the refresh token, its family, and
// what it was replaced by.
type Sessions struct {
	db  *store.Store
	ttl time.Duration
	now func() time.Time
}

// NewSessions builds the store. The TTL is how long someone can stay away
// before signing in again.
func NewSessions(db *store.Store, ttl time.Duration) *Sessions {
	return &Sessions{db: db, ttl: ttl, now: time.Now}
}

// Session is one issued refresh token.
type Session struct {
	ID       string
	UserID   string
	FamilyID string
	Expires  time.Time
}

// hashToken is what goes in the database. SHA-256 rather than bcrypt on
// purpose: the token is 256 bits of randomness, so there is nothing to guess
// and a slow hash would only tax every request.
func hashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func newSecret() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("generate token: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

// Issue starts a new family: a fresh sign-in.
func (s *Sessions) Issue(ctx context.Context, userID string) (string, Session, error) {
	return s.insert(ctx, userID, store.NewID(), "")
}

// insert writes one session row and returns the token only to the caller.
func (s *Sessions) insert(ctx context.Context, userID, familyID, replaces string) (string, Session, error) {
	token, err := newSecret()
	if err != nil {
		return "", Session{}, err
	}
	now := s.now().UTC()
	sess := Session{ID: store.NewID(), UserID: userID, FamilyID: familyID, Expires: now.Add(s.ttl)}

	err = s.db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO sessions (id, user_id, token_hash, family_id, issued_at, expires_at)
			 VALUES (?, ?, ?, ?, ?, ?)`,
			sess.ID, userID, hashToken(token), familyID,
			store.FormatTime(now), store.FormatTime(sess.Expires)); err != nil {
			return fmt.Errorf("write session: %w", err)
		}
		if replaces != "" {
			if _, err := tx.ExecContext(ctx,
				`UPDATE sessions SET revoked_at = ?, replaced_by = ? WHERE id = ?`,
				store.FormatTime(now), sess.ID, replaces); err != nil {
				return fmt.Errorf("retire the rotated session: %w", err)
			}
		}
		return nil
	})
	if err != nil {
		return "", Session{}, err
	}
	return token, sess, nil
}

// Rotate exchanges a refresh token for a new one.
//
// The old token is retired in the same transaction that mints its replacement,
// so a token is usable exactly once. Presenting one that was already rotated
// away means two parties hold the same chain -- the honest client and whoever
// copied it -- and there is no way to tell which is which, so the whole family
// goes.
func (s *Sessions) Rotate(ctx context.Context, token string) (string, Session, error) {
	var (
		id, userID, familyID, expires string
		revoked, replacedBy           sql.NullString
	)
	err := s.db.ReadDB().QueryRowContext(ctx,
		`SELECT id, user_id, family_id, expires_at, revoked_at, replaced_by
		   FROM sessions WHERE token_hash = ?`, hashToken(token)).
		Scan(&id, &userID, &familyID, &expires, &revoked, &replacedBy)
	if errors.Is(err, sql.ErrNoRows) {
		return "", Session{}, ErrRefreshRejected
	}
	if err != nil {
		return "", Session{}, err
	}

	if revoked.Valid && revoked.String != "" {
		if replacedBy.Valid && replacedBy.String != "" {
			// A replay of a rotated token. Everything descended from this
			// sign-in is now suspect.
			if err := s.RevokeFamily(ctx, familyID); err != nil {
				return "", Session{}, err
			}
		}
		return "", Session{}, ErrRefreshRejected
	}

	exp, err := store.ParseTime(expires)
	if err != nil {
		return "", Session{}, err
	}
	if !s.now().UTC().Before(exp) {
		return "", Session{}, ErrRefreshRejected
	}

	return s.insert(ctx, userID, familyID, id)
}

// Revoke ends one session: signing out on this device.
func (s *Sessions) Revoke(ctx context.Context, token string) error {
	return s.db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx,
			`UPDATE sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL`,
			store.FormatTime(s.now().UTC()), hashToken(token))
		return err
	})
}

// RevokeFamily ends every session descended from one sign-in.
func (s *Sessions) RevokeFamily(ctx context.Context, familyID string) error {
	return s.db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx,
			`UPDATE sessions SET revoked_at = ? WHERE family_id = ? AND revoked_at IS NULL`,
			store.FormatTime(s.now().UTC()), familyID)
		return err
	})
}

// RevokeUser ends every session an account has: what disabling one must do.
func (s *Sessions) RevokeUser(ctx context.Context, userID string) error {
	return s.db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx,
			`UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL`,
			store.FormatTime(s.now().UTC()), userID)
		return err
	})
}
