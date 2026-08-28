// Package holder manages everything other than an account that can hold an asset.
package holder

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/store"
)

// ErrNotFound is returned when an entity does not exist.
var ErrNotFound = errors.New("holder entity not found")

// ErrReferenced blocks removing an entity something still points at.
var ErrReferenced = errors.New("holder entity is still referenced")

// Store provides access to holder entities.
type Store struct{ db *store.Store }

// New builds a holder store.
func New(db *store.Store) *Store { return &Store{db: db} }

const cols = `id, type, name, parent_id, is_default_stock, attrs, archived_at, created_at, updated_at`

func scan(row interface{ Scan(...any) error }) (model.HolderEntity, error) {
	var h model.HolderEntity
	var parent, archived sql.NullString
	var attrs, created, updated string
	var isDefault int
	if err := row.Scan(&h.ID, &h.Type, &h.Name, &parent, &isDefault, &attrs, &archived, &created, &updated); err != nil {
		return h, err
	}
	h.ParentID = store.StrPtr(parent)
	h.IsDefaultStock = isDefault == 1
	var err error
	if h.Attrs, err = store.UnmarshalJSONMap(attrs); err != nil {
		return h, err
	}
	if h.ArchivedAt, err = store.ScanTime(archived); err != nil {
		return h, err
	}
	if h.CreatedAt, err = store.ParseTime(created); err != nil {
		return h, err
	}
	if h.UpdatedAt, err = store.ParseTime(updated); err != nil {
		return h, err
	}
	return h, nil
}

// List returns every holder entity ordered by type then name.
func (s *Store) List(ctx context.Context) ([]model.HolderEntity, error) {
	rows, err := s.db.ReadDB().QueryContext(ctx, `SELECT `+cols+` FROM holder_entities ORDER BY type, name`)
	if err != nil {
		return nil, fmt.Errorf("list holder entities: %w", err)
	}
	defer rows.Close()
	var out []model.HolderEntity
	for rows.Next() {
		h, err := scan(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, h)
	}
	return out, rows.Err()
}

// Get loads one entity.
func (s *Store) Get(ctx context.Context, id string) (model.HolderEntity, error) {
	h, err := scan(s.db.ReadDB().QueryRowContext(ctx, `SELECT `+cols+` FROM holder_entities WHERE id = ?`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return h, ErrNotFound
	}
	return h, err
}

// DefaultStock returns the entity marked as the default stock point, if any.
// Check-in points here by default; when nothing is marked the caller must ask
// the user to choose a location rather than failing.
func (s *Store) DefaultStock(ctx context.Context) (model.HolderEntity, bool, error) {
	h, err := scan(s.db.ReadDB().QueryRowContext(ctx,
		`SELECT `+cols+` FROM holder_entities WHERE is_default_stock = 1`))
	if errors.Is(err, sql.ErrNoRows) {
		return model.HolderEntity{}, false, nil
	}
	if err != nil {
		return h, false, err
	}
	return h, true, nil
}

// CreateInput describes a new holder entity.
type CreateInput struct {
	Type     model.EntityType
	Name     string
	ParentID *string
	Attrs    map[string]any
}

// Create inserts a holder entity.
func (s *Store) Create(ctx context.Context, in CreateInput) (model.HolderEntity, error) {
	attrs, err := store.MarshalJSONMap(in.Attrs)
	if err != nil {
		return model.HolderEntity{}, err
	}
	now := time.Now().UTC()
	h := model.HolderEntity{
		ID: store.NewID(), Type: in.Type, Name: in.Name, ParentID: in.ParentID,
		Attrs: in.Attrs, CreatedAt: now, UpdatedAt: now,
	}
	if h.Attrs == nil {
		h.Attrs = map[string]any{}
	}
	err = s.db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx,
			`INSERT INTO holder_entities (id, type, name, parent_id, is_default_stock, attrs, created_at, updated_at)
			 VALUES (?, ?, ?, ?, 0, ?, ?, ?)`,
			h.ID, string(h.Type), h.Name, store.NullString(h.ParentID), attrs,
			store.FormatTime(now), store.FormatTime(now))
		return err
	})
	if err != nil {
		return h, fmt.Errorf("create holder entity: %w", err)
	}
	return h, nil
}

// SetDefaultStock moves the default stock marker to one location. The partial
// unique index guarantees at most one marker, so the old one is cleared first.
func (s *Store) SetDefaultStock(ctx context.Context, id string) error {
	return s.db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		var typ string
		if err := tx.QueryRowContext(ctx, `SELECT type FROM holder_entities WHERE id = ?`, id).Scan(&typ); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return ErrNotFound
			}
			return err
		}
		if model.EntityType(typ) != model.EntityLocation {
			return fmt.Errorf("only a location can be the default stock point, %s is a %s", id, typ)
		}
		if _, err := tx.ExecContext(ctx, `UPDATE holder_entities SET is_default_stock = 0 WHERE is_default_stock = 1`); err != nil {
			return err
		}
		_, err := tx.ExecContext(ctx, `UPDATE holder_entities SET is_default_stock = 1 WHERE id = ?`, id)
		return err
	})
}

// Archive disables an entity.
//
// Refused while anything still points at it: an asset that holds it, or a
// reference field whose stored value names it. The same "referenced means
// refused" rule covers fields and accounts, so there is one behaviour to
// remember rather than three.
func (s *Store) Archive(ctx context.Context, id string) error {
	e, err := s.Get(ctx, id)
	if err != nil {
		return err
	}
	blockers, total, err := s.Blockers(ctx, id)
	if err != nil {
		return err
	}
	if total > 0 {
		return fmt.Errorf("%w: %s", ErrReferenced, describeBlockers(e.Name, blockers, total))
	}

	return s.db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		now := time.Now().UTC()
		_, err = tx.ExecContext(ctx,
			`UPDATE holder_entities SET archived_at = ?, is_default_stock = 0, updated_at = ? WHERE id = ?`,
			store.FormatTime(now), store.FormatTime(now), id)
		return err
	})
}
