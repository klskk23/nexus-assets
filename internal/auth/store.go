package auth

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/klskk23/nexus-assets/internal/authz"
	"github.com/klskk23/nexus-assets/internal/i18n"
	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/store"
)

// ErrNotFound is returned when an account does not exist.
var ErrNotFound = errors.New("user not found")

// ErrValidation is a request the account store will not carry out as asked --
// an empty name, a password too short, a reset aimed at an account that has no
// password to reset.
var ErrValidation = errors.New("invalid account change")

// ErrStillOwnsAssets blocks disabling an account that is still responsible for
// devices. Every asset must have an owner at all times, so the transfer has to
// happen first.
var ErrStillOwnsAssets = errors.New("user still owns assets")

// Store provides access to accounts.
type Store struct{ db *store.Store }

// NewStore builds a user store.
func NewStore(db *store.Store) *Store { return &Store{db: db} }

const userCols = `id, email, name, auth_type, password_hash, oidc_subject, status, role, coalesce(role_id, ''), token_version, lang, theme, created_at, updated_at`

func scanUser(row interface{ Scan(...any) error }) (model.User, error) {
	var u model.User
	var pw, sub sql.NullString
	var created, updated string
	if err := row.Scan(&u.ID, &u.Email, &u.Name, &u.AuthType, &pw, &sub,
		&u.Status, &u.Role, &u.RoleID, &u.TokenVersion, &u.Lang, &u.Theme,
		&created, &updated); err != nil {
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

// CountOIDC is how many accounts have ever signed in through Google, which is
// what decides whether the person signing in right now is the first one.
//
// Counted by the recorded subject rather than by auth_type, because an account
// can arrive at Google from the other direction: a local account whose email
// matches is adopted on first sign-in and keeps auth_type "local". Counting
// the type left that account uncounted, so the *next* colleague to sign in was
// still "the first" -- and became an administrator.
func (s *Store) CountOIDC(ctx context.Context) (int, error) {
	var n int
	err := s.db.ReadDB().QueryRowContext(ctx,
		`SELECT count(*) FROM users WHERE oidc_subject IS NOT NULL AND oidc_subject != ''`).Scan(&n)
	return n, err
}

// LinkOIDC records which Google identity an existing account belongs to.
//
// The password keeps working: somebody who set the deployment up with a local
// account and then signs in with Google has not asked to give that up, and
// taking it away would leave them locked out the day Google is unreachable.
// What this fixes is the link itself -- without a subject the account is tied
// to an email string, and an address reassigned inside a Workspace would hand
// somebody else the account.
func (s *Store) LinkOIDC(ctx context.Context, id, subject string) error {
	if strings.TrimSpace(subject) == "" {
		return nil
	}
	return s.db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx,
			`UPDATE users SET oidc_subject = ?, updated_at = ? WHERE id = ?`,
			subject, store.FormatTime(time.Now().UTC()), id)
		return err
	})
}

// CreateInput describes a new account.
type CreateInput struct {
	Email       string
	Name        string
	AuthType    model.AuthType
	Password    string // local accounts only
	OIDCSubject string // oidc accounts only
	// RoleID is what this account may do. Every caller supplies one; empty
	// means no permissions at all, which is the safe end of that mistake.
	RoleID string
}

// Create inserts an account.
func (s *Store) Create(ctx context.Context, in CreateInput) (model.User, error) {
	u := model.User{
		ID:       store.NewID(),
		Email:    strings.ToLower(strings.TrimSpace(in.Email)),
		Name:     in.Name,
		AuthType: in.AuthType,
		Status:   model.UserActive,
		Role:     "admin", // reserved by 001; nothing reads it
		RoleID:   in.RoleID,
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
			`INSERT INTO users (id, email, name, auth_type, password_hash, oidc_subject,
			                    status, role, role_id, token_version, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
			u.ID, u.Email, u.Name, string(u.AuthType),
			nullIfEmpty(u.PasswordHash), nullIfEmpty(u.OIDCSubject),
			string(u.Status), u.Role, nullIfEmpty(u.RoleID),
			store.FormatTime(now), store.FormatTime(now))
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
		// Disabling the last administrator loses the same thing demoting them
		// would, so it meets the same guard.
		if err := guardLastAdmin(ctx, tx, id, ""); err != nil {
			return err
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

// Enable puts a disabled account back into service.
//
// The pair to Disable, and it was missing: PATCH took {"disable": true} and
// ignored false, so an account stopped by a misclick -- or by a colleague
// going on leave -- could only be revived by editing the database. Nothing to
// guard here; letting somebody back in takes nothing away from anybody.
func (s *Store) Enable(ctx context.Context, id string) error {
	return s.db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		res, err := tx.ExecContext(ctx,
			`UPDATE users SET status = 'active', updated_at = ? WHERE id = ?`,
			store.FormatTime(time.Now().UTC()), id)
		if err != nil {
			return err
		}
		if n, _ := res.RowsAffected(); n == 0 {
			return ErrNotFound
		}
		return nil
	})
}

// Rename changes the name an account is shown under.
//
// The email is not editable: it is what an OIDC sign-in matches on and what
// the audit trail says, and "the same person under a different address" is an
// account, not an edit.
func (s *Store) Rename(ctx context.Context, id, name string) error {
	name = strings.TrimSpace(name)
	if name == "" {
		return i18n.Wrap(ErrValidation, i18n.KeyUserNameRequired)
	}
	return s.db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		res, err := tx.ExecContext(ctx,
			`UPDATE users SET name = ?, updated_at = ? WHERE id = ?`,
			name, store.FormatTime(time.Now().UTC()), id)
		if err != nil {
			return err
		}
		if n, _ := res.RowsAffected(); n == 0 {
			return ErrNotFound
		}
		return nil
	})
}

// ResetPassword sets a new password and invalidates everything issued before.
//
// The version bump is the point, not a detail: without it a reset only changes
// a hash -- the access token in somebody's hands keeps working until it
// expires, and the refresh token keeps working indefinitely. An administrator
// reaches for this because an account is in the wrong hands, which is exactly
// when a fifteen-minute window is the wrong thing to leave open. The refresh
// tokens are revoked by the caller, which has the sessions store.
func (s *Store) ResetPassword(ctx context.Context, id, password string) error {
	hash, err := HashPassword(password)
	if err != nil {
		return i18n.Wrap(ErrValidation, i18n.KeyPasswordTooShort)
	}
	return s.db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		var authType string
		row := tx.QueryRowContext(ctx, `SELECT auth_type FROM users WHERE id = ?`, id)
		if err := row.Scan(&authType); errors.Is(err, sql.ErrNoRows) {
			return ErrNotFound
		} else if err != nil {
			return err
		}
		// An OIDC account has no password to reset; setting one would create a
		// second way in that nobody asked for and the provider cannot revoke.
		if authType != string(model.AuthLocal) {
			return i18n.Wrap(ErrValidation, i18n.KeyPasswordNotLocal)
		}
		_, err := tx.ExecContext(ctx,
			`UPDATE users SET password_hash = ?, token_version = token_version + 1,
			                  updated_at = ? WHERE id = ?`,
			hash, store.FormatTime(time.Now().UTC()), id)
		return err
	})
}

func nullIfEmpty(s string) any {
	if s == "" {
		return nil
	}
	return s
}

// UpdatePreferences changes what the person chose for themselves.
//
// Absent means "leave it alone" and empty means "follow the system", which are
// different answers: the second is a choice, and clearing a preference has to
// be expressible.
func (s *Store) UpdatePreferences(ctx context.Context, id string, lang, theme *string) (model.User, error) {
	var out model.User
	err := s.db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		cur, err := scanUser(tx.QueryRowContext(ctx, `SELECT `+userCols+` FROM users WHERE id = ?`, id))
		if errors.Is(err, sql.ErrNoRows) {
			return ErrNotFound
		}
		if err != nil {
			return err
		}
		if lang != nil {
			cur.Lang = *lang
		}
		if theme != nil {
			cur.Theme = *theme
		}
		cur.UpdatedAt = time.Now().UTC()
		if _, err := tx.ExecContext(ctx,
			`UPDATE users SET lang = ?, theme = ?, updated_at = ? WHERE id = ?`,
			cur.Lang, cur.Theme, store.FormatTime(cur.UpdatedAt), id); err != nil {
			return err
		}
		out = cur
		return nil
	})
	return out, err
}

// SetRole binds an account to a role.
//
// Two guards, and they are the reason this is not just an UPDATE:
//
//   - the system must keep at least one enabled administrator, so the last one
//     cannot be demoted;
//   - nobody changes their own role, because one wrong click would otherwise
//     lock a person out of the page that could undo it.
//
// The same "at least one" guard lives on disabling an account, because
// disabling the last administrator is the same loss by another route.
func (s *Store) SetRole(ctx context.Context, id, roleID, actorID string) (model.User, error) {
	var out model.User
	if id == actorID {
		return out, i18n.Wrap(authz.ErrSelfDemote, i18n.KeyRoleSelfDemote)
	}
	err := s.db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		if err := guardLastAdmin(ctx, tx, id, roleID); err != nil {
			return err
		}
		_, err := tx.ExecContext(ctx,
			`UPDATE users SET role_id = ?, updated_at = ? WHERE id = ?`,
			nullIfEmpty(roleID), store.FormatTime(time.Now().UTC()), id)
		return err
	})
	if err != nil {
		return out, err
	}
	return s.Get(ctx, id)
}

// guardLastAdmin refuses a change that would leave nobody in charge.
//
// nextRole is the role the account is moving to, or "" when it is being
// disabled. Counted inside the write transaction: two administrators demoting
// each other at the same moment would otherwise both see one left.
func guardLastAdmin(ctx context.Context, tx *sql.Tx, userID, nextRole string) error {
	var isAdminNow int
	err := tx.QueryRowContext(ctx,
		`SELECT count(*) FROM users u JOIN roles r ON r.id = u.role_id
		 WHERE u.id = ? AND r.is_admin = 1 AND u.status = 'active'`, userID).Scan(&isAdminNow)
	if err != nil {
		return err
	}
	if isAdminNow == 0 {
		return nil // not an administrator, or not enabled: nothing to protect
	}

	if nextRole != "" {
		var stillAdmin int
		if err := tx.QueryRowContext(ctx,
			`SELECT count(*) FROM roles WHERE id = ? AND is_admin = 1`, nextRole).Scan(&stillAdmin); err != nil {
			return err
		}
		if stillAdmin == 1 {
			return nil // moving from one admin role to another
		}
	}

	var others int
	if err := tx.QueryRowContext(ctx,
		`SELECT count(*) FROM users u JOIN roles r ON r.id = u.role_id
		 WHERE r.is_admin = 1 AND u.status = 'active' AND u.id != ?`, userID).Scan(&others); err != nil {
		return err
	}
	if others == 0 {
		return i18n.Wrap(authz.ErrLastAdmin, i18n.KeyRoleLastAdmin)
	}
	return nil
}
