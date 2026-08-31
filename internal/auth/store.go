package auth

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/klskk23/nexus-assets/internal/i18n"
	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/store"
)

// ErrNotFound is returned when an account does not exist.
var ErrNotFound = errors.New("user not found")

// ErrStillOwnsAssets blocks disabling an account that is still responsible for
// devices. Every asset must have an owner at all times, so the transfer has to
// happen first.
var ErrStillOwnsAssets = errors.New("user still owns assets")

// Store provides access to accounts.
type Store struct{ db *store.Store }

// NewStore builds a user store.
func NewStore(db *store.Store) *Store { return &Store{db: db} }

const userCols = `id, email, name, auth_type, password_hash, oidc_subject, status, role, token_version, created_at, updated_at`

func scanUser(row interface{ Scan(...any) error }) (model.User, error) {
	var u model.User
	var pw, sub sql.NullString
	var created, updated string
	if err := row.Scan(&u.ID, &u.Email, &u.Name, &u.AuthType, &pw, &sub,
		&u.Status, &u.Role, &u.TokenVersion, &created, &updated); err != nil {
		return u, err
	}
	u.PasswordHash = pw.String
	u.OIDCSubject = sub.String
	var err error
	if u.CreatedAt, err = store.ParseTime(created); err != nil {
		return u, err
	}
	if u.UpdatedAt, err = store.ParseTime(updated); err != nil {
		return u, err
	}
	return u, nil
}

// List returns every account.
func (s *Store) List(ctx context.Context) ([]model.User, error) {
	rows, err := s.db.ReadDB().QueryContext(ctx, `SELECT `+userCols+` FROM users ORDER BY email`)
	if err != nil {
		return nil, fmt.Errorf("list users: %w", err)
	}
	defer rows.Close()
	var out []model.User
	for rows.Next() {
		u, err := scanUser(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, u)
	}
	return out, rows.Err()
}

// Get loads one account.
func (s *Store) Get(ctx context.Context, id string) (model.User, error) {
	u, err := scanUser(s.db.ReadDB().QueryRowContext(ctx, `SELECT `+userCols+` FROM users WHERE id = ?`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return u, ErrNotFound
	}
	return u, err
}

// ByEmail loads an account by address.
func (s *Store) ByEmail(ctx context.Context, email string) (model.User, error) {
	u, err := scanUser(s.db.ReadDB().QueryRowContext(ctx,
		`SELECT `+userCols+` FROM users WHERE email = ?`, strings.ToLower(strings.TrimSpace(email))))
	if errors.Is(err, sql.ErrNoRows) {
		return u, ErrNotFound
	}
	return u, err
}

// Count returns how many accounts exist. Used to decide whether to bootstrap.
func (s *Store) Count(ctx context.Context) (int, error) {
	var n int
	err := s.db.ReadDB().QueryRowContext(ctx, `SELECT count(*) FROM users`).Scan(&n)
	return n, err
}

// CreateInput describes a new account.
type CreateInput struct {
	Email       string
	Name        string
	AuthType    model.AuthType
	Password    string // local accounts only
	OIDCSubject string // oidc accounts only
}

// Create inserts an account.
func (s *Store) Create(ctx context.Context, in CreateInput) (model.User, error) {
	u := model.User{
		ID:       store.NewID(),
		Email:    strings.ToLower(strings.TrimSpace(in.Email)),
		Name:     in.Name,
		AuthType: in.AuthType,
		Status:   model.UserActive,
		Role:     "admin", // reserved; no checks are performed on it yet
	}
	if u.Name == "" {
		u.Name = u.Email
	}
	if in.AuthType == model.AuthLocal {
		h, err := HashPassword(in.Password)
		if err != nil {
			return u, err
		}
		u.PasswordHash = h
	}
	u.OIDCSubject = in.OIDCSubject

	now := time.Now().UTC()
	u.CreatedAt, u.UpdatedAt = now, now
	err := s.db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx,
			`INSERT INTO users (id, email, name, auth_type, password_hash, oidc_subject, status, role, token_version, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
			u.ID, u.Email, u.Name, string(u.AuthType),
			nullIfEmpty(u.PasswordHash), nullIfEmpty(u.OIDCSubject),
			string(u.Status), u.Role, store.FormatTime(now), store.FormatTime(now))
		return err
	})
	if err != nil {
		return u, fmt.Errorf("create user: %w", err)
	}
	return u, nil
}

// Disable deactivates an account, refusing while it still owns assets.
func (s *Store) Disable(ctx context.Context, id string) error {
	return s.db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		var owned int
		if err := tx.QueryRowContext(ctx,
			`SELECT count(*) FROM assets WHERE owner_id = ? OR (holder_type = 'user' AND holder_id = ?)`,
			id, id).Scan(&owned); err != nil {
			return err
		}
		if owned > 0 {
			return i18n.Wrap(ErrStillOwnsAssets, i18n.KeyUserStillOwns, owned)
		}
		now := time.Now().UTC()
		res, err := tx.ExecContext(ctx,
			`UPDATE users SET status = 'disabled', updated_at = ? WHERE id = ?`,
			store.FormatTime(now), id)
		if err != nil {
			return err
		}
		if n, _ := res.RowsAffected(); n == 0 {
			return ErrNotFound
		}
		return nil
	})
}

func nullIfEmpty(s string) any {
	if s == "" {
		return nil
	}
	return s
}
