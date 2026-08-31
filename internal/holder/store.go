// Package holder manages everything other than an account that can hold an asset.
package holder

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

// ErrNotFound is returned when an entity does not exist.
var ErrNotFound = errors.New("holder entity not found")

// ErrReferenced blocks removing an entity something still points at.
var ErrReferenced = errors.New("holder entity is still referenced")

// ErrDefaultStockRequired blocks clearing the default stock marker.
//
// The marker can move but not disappear. Allowing it to be cleared would give
// check-in two behaviours -- straight to the default, or stop and ask -- with
// nothing on screen to say which one is in force.
var ErrDefaultStockRequired = errors.New("the default stock point can be moved but not cleared")

// Store provides access to holder entities.
type Store struct{ db *store.Store }

// New builds a holder store.
func New(db *store.Store) *Store { return &Store{db: db} }

const cols = `id, type, name, parent_id, note, is_default_stock, attrs, created_at, updated_at`

func scan(row interface{ Scan(...any) error }) (model.HolderEntity, error) {
	var h model.HolderEntity
	var parent sql.NullString
	var attrs, created, updated string
	var isDefault int
	if err := row.Scan(&h.ID, &h.Type, &h.Name, &parent, &h.Note, &isDefault, &attrs, &created, &updated); err != nil {
		return h, err
	}
	h.ParentID = store.StrPtr(parent)
	h.IsDefaultStock = isDefault == 1
	var err error
	if h.Attrs, err = store.UnmarshalJSONMap(attrs); err != nil {
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

// ErrParentRequired blocks a department with no company above it.
var ErrParentRequired = errors.New("this kind of holder needs a parent")

// ErrParentInvalid blocks a parent of the wrong kind, or one that does not exist.
var ErrParentInvalid = errors.New("invalid parent")

// allowedParents says what each kind may hang from.
//
// A department without a company is an orphan on an org chart -- it is always
// somebody's department. A location is different: a warehouse may belong to a
// company, be run by a department, or be a third-party site that belongs to
// neither, so its parent is optional and may be either.
var allowedParents = map[model.EntityType][]model.EntityType{
	model.EntityCompany:    nil,
	model.EntityDepartment: {model.EntityCompany},
	model.EntityLocation:   {model.EntityCompany, model.EntityDepartment},
}

// parentRequired lists the kinds that cannot stand alone.
var parentRequired = map[model.EntityType]bool{model.EntityDepartment: true}

// CreateInput describes a new holder entity.
type CreateInput struct {
	Type     model.EntityType
	Name     string
	ParentID *string
	Note     string
	Attrs    map[string]any
}

// Create inserts a holder entity.
func (s *Store) Create(ctx context.Context, in CreateInput) (model.HolderEntity, error) {
	attrs, err := store.MarshalJSONMap(in.Attrs)
	if err != nil {
		return model.HolderEntity{}, err
	}
	if err := s.checkParent(ctx, in.Type, in.ParentID); err != nil {
		return model.HolderEntity{}, err
	}
	now := time.Now().UTC()
	h := model.HolderEntity{
		ID: store.NewID(), Type: in.Type, Name: in.Name, ParentID: in.ParentID,
		Note: in.Note, Attrs: in.Attrs, CreatedAt: now, UpdatedAt: now,
	}
	if h.Attrs == nil {
		h.Attrs = map[string]any{}
	}
	err = s.db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx,
			`INSERT INTO holder_entities (id, type, name, parent_id, note, is_default_stock, attrs, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)`,
			h.ID, string(h.Type), h.Name, store.NullString(h.ParentID), h.Note, attrs,
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
			return i18n.Wrap(ErrNotALocation, i18n.KeyDefaultStockNotLocation,
				typeLabel(model.EntityType(typ)))
		}
		if _, err := tx.ExecContext(ctx, `UPDATE holder_entities SET is_default_stock = 0 WHERE is_default_stock = 1`); err != nil {
			return err
		}
		_, err := tx.ExecContext(ctx, `UPDATE holder_entities SET is_default_stock = 1 WHERE id = ?`, id)
		return err
	})
}

// ErrNotALocation blocks marking anything else as the default stock point.
//
// A sentinel rather than a bare error: without one this arrived as a 500,
// telling the operator the server broke rather than that their choice needs
// one edit. Unrelated to the status constraint removed in 007 -- check-in has
// to name somewhere specific to return to, and a company is not a place.
var ErrNotALocation = errors.New("only a location can be the default stock point")

// ErrHasChildren blocks removing an entity something hangs from.
var ErrHasChildren = errors.New("holder entity still has children")

// Usage is what deleting an entity would cost.
type Usage struct {
	// Assets currently hold it, or name it in a reference field. Refuses.
	Assets int `json:"assets"`
	// Children hang from it. Refuses -- reparenting them silently would move
	// somebody's org chart without asking.
	Children int `json:"children"`
	// History mentions it in a transfer event. Warns only: the timeline
	// degrades to showing an id, and no record is lost.
	History int `json:"history"`
}

// Usage counts everything standing in the way of deleting one entity.
func (s *Store) Usage(ctx context.Context, id string) (Usage, error) {
	var u Usage
	db := s.db.ReadDB()
	if err := db.QueryRowContext(ctx, countBlockersSQL, id, id).Scan(&u.Assets); err != nil {
		return u, fmt.Errorf("count blocking assets: %w", err)
	}
	if err := db.QueryRowContext(ctx,
		`SELECT count(*) FROM holder_entities WHERE parent_id = ?`, id).Scan(&u.Children); err != nil {
		return u, fmt.Errorf("count children: %w", err)
	}
	// An event names two holders; a move within one would otherwise count
	// twice, so the two columns are unioned rather than added.
	if err := db.QueryRowContext(ctx,
		`SELECT count(*) FROM (
		   SELECT id FROM asset_transfers WHERE from_holder_type = 'entity' AND from_holder_id = ?
		   UNION
		   SELECT id FROM asset_transfers WHERE to_holder_type = 'entity' AND to_holder_id = ?
		 )`, id, id).Scan(&u.History); err != nil {
		return u, fmt.Errorf("count transfers mentioning the entity: %w", err)
	}
	return u, nil
}

// Delete removes a holder entity.
//
// Archiving used to sit here. It existed to protect history, and it did -- but
// it protected a warehouse created by mistake exactly as firmly as one with a
// decade of transfers behind it, and the system can tell those apart. Three
// checks, and only the first two refuse:
//
//   - assets hold it or reference it: refused, and the blockers are named
//   - children hang from it: refused, because reparenting an org chart without
//     asking is not a side effect anyone wants
//   - transfer events mention it: allowed. The timeline falls back to showing
//     the raw id, which is a loss of readability rather than of data, and
//     refusing would make a warehouse used once undeletable for good.
//
// The default stock marker is refused separately: it moves, it does not vanish.
func (s *Store) Delete(ctx context.Context, id string) (Usage, error) {
	e, err := s.Get(ctx, id)
	if err != nil {
		return Usage{}, err
	}
	if e.IsDefaultStock {
		return Usage{}, i18n.Wrap(ErrDefaultStockRequired, i18n.KeyHolderDefaultStockDel, e.Name)
	}

	usage, err := s.Usage(ctx, id)
	if err != nil {
		return usage, err
	}
	if usage.Assets > 0 {
		blockers, total, err := s.Blockers(ctx, id)
		if err != nil {
			return usage, err
		}
		return usage, describeBlockers(e.Name, blockers, total)
	}
	if usage.Children > 0 {
		return usage, i18n.Wrap(ErrHasChildren, i18n.KeyHolderHasChildren, e.Name, usage.Children)
	}

	err = s.db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `DELETE FROM holder_entities WHERE id = ?`, id)
		return err
	})
	return usage, err
}

// UpdateInput carries the editable parts of a holder entity.
type UpdateInput struct {
	Name *string
	Note *string
	// ParentID is a double pointer so "leave it alone" and "move it to the
	// root" are distinguishable -- the same shape the category move uses.
	ParentID **string
}

// Update renames a holder, edits its note, or moves it in the tree.
func (s *Store) Update(ctx context.Context, id string, in UpdateInput) (model.HolderEntity, error) {
	cur, err := s.Get(ctx, id)
	if err != nil {
		return cur, err
	}
	if in.Name != nil {
		if strings.TrimSpace(*in.Name) == "" {
			return cur, i18n.Wrap(ErrParentInvalid, i18n.KeyHolderNameEmpty)
		}
		cur.Name = *in.Name
	}
	if in.Note != nil {
		cur.Note = *in.Note
	}
	if in.ParentID != nil {
		if err := s.checkParent(ctx, cur.Type, *in.ParentID); err != nil {
			return cur, err
		}
		// Its own descendants are not eligible: a cycle would make the tree
		// unwalkable and every ancestor query non-terminating.
		if *in.ParentID != nil {
			descends, err := s.descendsFrom(ctx, **in.ParentID, id)
			if err != nil {
				return cur, err
			}
			if descends || **in.ParentID == id {
				return cur, i18n.Wrap(ErrParentInvalid, i18n.KeyHolderCycle, cur.Name)
			}
		}
		cur.ParentID = *in.ParentID
	}

	cur.UpdatedAt = time.Now().UTC()
	err = s.db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx,
			`UPDATE holder_entities SET name = ?, note = ?, parent_id = ?, updated_at = ? WHERE id = ?`,
			cur.Name, cur.Note, store.NullString(cur.ParentID), store.FormatTime(cur.UpdatedAt), id)
		return err
	})
	return cur, err
}

// checkParent enforces what may hang from what.
//
// The rule is data (allowedParents) rather than a chain of ifs, so adding a
// fourth kind of holder is one map entry and not a new branch in three places.
func (s *Store) checkParent(ctx context.Context, typ model.EntityType, parentID *string) error {
	allowed, known := allowedParents[typ]
	if !known {
		return i18n.Wrap(ErrParentInvalid, i18n.KeyHolderTypeUnknown, string(typ))
	}
	if parentID == nil || *parentID == "" {
		if parentRequired[typ] {
			return i18n.Wrap(ErrParentRequired, i18n.KeyHolderParentRequired,
				typeLabel(typ), labelList(allowed), labelList(allowed))
		}
		return nil
	}
	if len(allowed) == 0 {
		return i18n.Wrap(ErrParentInvalid, i18n.KeyHolderNoParentAllowed, typeLabel(typ))
	}

	parent, err := s.Get(ctx, *parentID)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return i18n.Wrap(ErrParentInvalid, i18n.KeyHolderParentMissing)
		}
		return err
	}
	for _, a := range allowed {
		if parent.Type == a {
			return nil
		}
	}
	return i18n.Wrap(ErrParentInvalid, i18n.KeyHolderParentKind,
		typeLabel(typ), labelList(allowed), parent.Name, typeLabel(parent.Type))
}

// descendsFrom reports whether candidate sits somewhere under root.
func (s *Store) descendsFrom(ctx context.Context, candidate, root string) (bool, error) {
	seen := map[string]bool{}
	for id := candidate; id != ""; {
		if id == root {
			return true, nil
		}
		if seen[id] {
			// Only reachable if a cycle already exists in stored data; stop
			// rather than loop forever while reporting it.
			return false, nil
		}
		seen[id] = true
		var parent sql.NullString
		err := s.db.ReadDB().QueryRowContext(ctx,
			`SELECT parent_id FROM holder_entities WHERE id = ?`, id).Scan(&parent)
		if errors.Is(err, sql.ErrNoRows) {
			return false, nil
		}
		if err != nil {
			return false, err
		}
		if !parent.Valid {
			return false, nil
		}
		id = parent.String
	}
	return false, nil
}

// Holder kinds name themselves inside these messages, so they are lazily
// rendered rather than resolved to one language at construction time: the
// argument is a Message, and Sprintf calls String() on it in whatever language
// the reader asked for.
var typeKeys = map[model.EntityType]string{
	model.EntityCompany:    i18n.KeyEntityCompany,
	model.EntityDepartment: i18n.KeyEntityDepartment,
	model.EntityLocation:   i18n.KeyEntityLocation,
}

func typeLabel(t model.EntityType) any {
	if k, ok := typeKeys[t]; ok {
		return i18n.M(k)
	}
	return string(t)
}

func labelList(types []model.EntityType) any {
	parts := make([]any, 0, len(types))
	for _, t := range types {
		parts = append(parts, typeLabel(t))
	}
	return i18n.Join(i18n.KeyJoinOr, parts...)
}
