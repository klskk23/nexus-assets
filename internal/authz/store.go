package authz

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/klskk23/nexus-assets/internal/i18n"
	"github.com/klskk23/nexus-assets/internal/store"
)

// AdminRoleID is the role the migration seeds and the one an account falls
// back to when nothing else applies.
const AdminRoleID = "role-admin"

// UserRoleID is the seeded preset. It is an ordinary role: editable, and
// deletable once nobody is bound to it.
const UserRoleID = "role-user"

var (
	ErrNotFound = errors.New("role not found")
	// ErrInvalid covers a name nobody can read and a permission this build
	// does not know.
	ErrInvalid = errors.New("invalid role")
	// ErrInUse is raised when a role still has people bound to it, the same
	// way a holder with devices or a status in use refuses to be deleted.
	ErrInUse = errors.New("role is in use")
	// ErrLastAdmin guards the one thing that cannot be undone from inside the
	// interface: leaving nobody who can change permissions.
	ErrLastAdmin = errors.New("the last administrator")
	// ErrSelfDemote stops somebody locking themselves out with one click.
	ErrSelfDemote = errors.New("cannot change your own role")
)

// Role is a named set of permissions.
type Role struct {
	ID string `json:"id"`
	// Name is what the interface shows. Editable even on the admin role: it
	// is a label, not the thing that makes it powerful.
	Name string `json:"name"`
	// IsAdmin means every permission, including ones added later. It cannot be
	// edited, because there is nothing to edit -- it is not a list of ticks.
	IsAdmin     bool         `json:"is_admin"`
	Permissions []Permission `json:"permissions"`
	// Users is how many accounts are bound, filled in by List. Deleting a role
	// that still has people is refused, so the page shows the count.
	Users     int       `json:"users"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// Roles reads and writes them.
type Roles struct{ db *store.Store }

// NewRoles builds the store.
func NewRoles(db *store.Store) *Roles { return &Roles{db: db} }

const roleCols = `id, name, is_admin, permissions, created_at, updated_at`

func scanRole(row interface{ Scan(...any) error }) (Role, error) {
	var r Role
	var admin int
	var perms, created, updated string
	if err := row.Scan(&r.ID, &r.Name, &admin, &perms, &created, &updated); err != nil {
		return r, err
	}
	r.IsAdmin = admin == 1

	var list []string
	if err := json.Unmarshal([]byte(perms), &list); err != nil {
		return r, fmt.Errorf("read permissions of %q: %w", r.Name, err)
	}
	r.Permissions = []Permission{}
	for _, p := range list {
		// A permission this build does not know is dropped rather than kept:
		// it comes from a newer version, and carrying it forward would let a
		// downgrade grant something this code cannot check.
		if Valid(Permission(p)) {
			r.Permissions = append(r.Permissions, Permission(p))
		}
	}

	var err error
	if r.CreatedAt, err = store.ParseTime(created); err != nil {
		return r, err
	}
	r.UpdatedAt, err = store.ParseTime(updated)
	return r, err
}

// List returns every role with the number of accounts bound to it.
func (s *Roles) List(ctx context.Context) ([]Role, error) {
	rows, err := s.db.ReadDB().QueryContext(ctx,
		`SELECT `+roleCols+`, (SELECT count(*) FROM users WHERE users.role_id = roles.id)
		 FROM roles ORDER BY is_admin DESC, name`)
	if err != nil {
		return nil, fmt.Errorf("list roles: %w", err)
	}
	defer rows.Close()

	out := []Role{}
	for rows.Next() {
		var r Role
		var admin, users int
		var perms, created, updated string
		if err := rows.Scan(&r.ID, &r.Name, &admin, &perms, &created, &updated, &users); err != nil {
			return nil, err
		}
		r.IsAdmin, r.Users = admin == 1, users
		var list []string
		if err := json.Unmarshal([]byte(perms), &list); err != nil {
			return nil, err
		}
		r.Permissions = []Permission{}
		for _, p := range list {
			if Valid(Permission(p)) {
				r.Permissions = append(r.Permissions, Permission(p))
			}
		}
		if r.CreatedAt, err = store.ParseTime(created); err != nil {
			return nil, err
		}
		if r.UpdatedAt, err = store.ParseTime(updated); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// Get loads one role.
func (s *Roles) Get(ctx context.Context, id string) (Role, error) {
	r, err := scanRole(s.db.ReadDB().QueryRowContext(ctx,
		`SELECT `+roleCols+` FROM roles WHERE id = ?`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return r, ErrNotFound
	}
	return r, err
}

// SetOf is what an account may do, ready for the checks.
//
// An account with no role at all gets nothing. That state should not exist --
// the migration binds everyone and every path that creates a user assigns one
// -- but "no role" meaning "everything" is the kind of default that turns one
// missed assignment into an open door.
func (s *Roles) SetOf(ctx context.Context, roleID string) (Set, error) {
	if strings.TrimSpace(roleID) == "" {
		return NewSet(false, nil), nil
	}
	r, err := s.Get(ctx, roleID)
	if errors.Is(err, ErrNotFound) {
		return NewSet(false, nil), nil
	}
	if err != nil {
		return Set{}, err
	}
	return NewSet(r.IsAdmin, r.Permissions), nil
}

// CreateInput describes a new role.
type CreateInput struct {
	Name        string
	Permissions []Permission
}

// Create registers a role. New roles are never administrators: that role is
// seeded once and there is no reason to have two unlimited ones.
func (s *Roles) Create(ctx context.Context, in CreateInput) (Role, error) {
	name := strings.TrimSpace(in.Name)
	if name == "" {
		return Role{}, i18n.Wrap(ErrInvalid, i18n.KeyRoleNeedsName)
	}
	perms, err := encode(in.Permissions)
	if err != nil {
		return Role{}, err
	}

	now := time.Now().UTC()
	r := Role{ID: store.NewID(), Name: name, Permissions: kept(in.Permissions),
		CreatedAt: now, UpdatedAt: now}
	err = s.db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx,
			`INSERT INTO roles (id, name, is_admin, permissions, created_at, updated_at)
			 VALUES (?, ?, 0, ?, ?, ?)`,
			r.ID, r.Name, perms, store.FormatTime(now), store.FormatTime(now))
		return err
	})
	if err != nil && strings.Contains(err.Error(), "UNIQUE") {
		return r, i18n.Wrap(ErrInvalid, i18n.KeyRoleDuplicate, name)
	}
	return r, err
}

// UpdateInput carries the editable parts. Absent means "leave alone".
type UpdateInput struct {
	Name        *string
	Permissions *[]Permission
}

// Update changes a role.
//
// The administrator's permissions are not editable -- there is no list to
// edit, and letting someone clear "manage roles" on it would leave nobody able
// to change any permission ever again. Its name is fair game.
func (s *Roles) Update(ctx context.Context, id string, in UpdateInput) (Role, error) {
	cur, err := s.Get(ctx, id)
	if err != nil {
		return cur, err
	}
	if in.Name != nil {
		name := strings.TrimSpace(*in.Name)
		if name == "" {
			return cur, i18n.Wrap(ErrInvalid, i18n.KeyRoleNeedsName)
		}
		cur.Name = name
	}
	if in.Permissions != nil {
		if cur.IsAdmin {
			return cur, i18n.Wrap(ErrInvalid, i18n.KeyRoleAdminFixed)
		}
		cur.Permissions = kept(*in.Permissions)
	}
	perms, err := encode(cur.Permissions)
	if err != nil {
		return cur, err
	}

	now := time.Now().UTC()
	cur.UpdatedAt = now
	err = s.db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx,
			`UPDATE roles SET name = ?, permissions = ?, updated_at = ? WHERE id = ?`,
			cur.Name, perms, store.FormatTime(now), id)
		return err
	})
	if err != nil && strings.Contains(err.Error(), "UNIQUE") {
		return cur, i18n.Wrap(ErrInvalid, i18n.KeyRoleDuplicate, cur.Name)
	}
	return cur, err
}

// Delete removes a role.
//
// Refused while accounts are bound to it, which is the same rule holders and
// statuses follow: the people have to be moved first, and moving the last
// administrator elsewhere is refused by its own guard. The two compose, so
// there is no order of operations that ends with nobody in charge.
func (s *Roles) Delete(ctx context.Context, id string) error {
	r, err := s.Get(ctx, id)
	if err != nil {
		return err
	}
	var bound int
	if err := s.db.ReadDB().QueryRowContext(ctx,
		`SELECT count(*) FROM users WHERE role_id = ?`, id).Scan(&bound); err != nil {
		return err
	}
	if bound > 0 {
		return i18n.Wrap(ErrInUse, i18n.KeyRoleInUse, r.Name, bound)
	}
	return s.db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `DELETE FROM roles WHERE id = ?`, id)
		return err
	})
}

// encode renders the permissions for storage, refusing anything unknown --
// a typo in an API call would otherwise be stored and silently do nothing.
func encode(list []Permission) (string, error) {
	out := make([]string, 0, len(list))
	for _, p := range list {
		if !Valid(p) {
			return "", i18n.Wrap(ErrInvalid, i18n.KeyRoleUnknownPerm, string(p))
		}
		out = append(out, string(p))
	}
	b, err := json.Marshal(out)
	return string(b), err
}

// kept is the same filter, for the value handed back to the caller.
func kept(list []Permission) []Permission {
	out := []Permission{}
	for _, p := range list {
		if Valid(p) {
			out = append(out, p)
		}
	}
	return out
}
