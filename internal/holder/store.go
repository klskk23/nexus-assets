// Package holder manages everything other than an account that can hold an asset.
package holder

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

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

const cols = `id, type, name, parent_id, note, is_default_stock, attrs, archived_at, created_at, updated_at`

func scan(row interface{ Scan(...any) error }) (model.HolderEntity, error) {
	var h model.HolderEntity
	var parent, archived sql.NullString
	var attrs, created, updated string
	var isDefault int
	if err := row.Scan(&h.ID, &h.Type, &h.Name, &parent, &h.Note, &isDefault, &attrs, &archived, &created, &updated); err != nil {
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

	// Archiving used to clear the marker on the way out, which was a back door
	// around ErrDefaultStockRequired: disable the default location and the
	// system quietly had no default at all.
	if e.IsDefaultStock {
		return fmt.Errorf("%w：「%s」是当前默认库存点，请先把默认库存点转移到其他位置再停用它",
			ErrDefaultStockRequired, e.Name)
	}

	return s.db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		now := time.Now().UTC()
		_, err = tx.ExecContext(ctx,
			`UPDATE holder_entities SET archived_at = ?, updated_at = ? WHERE id = ?`,
			store.FormatTime(now), store.FormatTime(now), id)
		return err
	})
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
			return cur, fmt.Errorf("%w：名称不能为空", ErrParentInvalid)
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
				return cur, fmt.Errorf("%w：不能把「%s」挂到它自己或它的下级上", ErrParentInvalid, cur.Name)
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
		return fmt.Errorf("%w：未知的持有方类型 %q", ErrParentInvalid, typ)
	}
	if parentID == nil || *parentID == "" {
		if parentRequired[typ] {
			return fmt.Errorf("%w：%s", ErrParentRequired, requiredParentMessage(typ, allowed))
		}
		return nil
	}
	if len(allowed) == 0 {
		return fmt.Errorf("%w：%s不能属于其他持有方", ErrParentInvalid, typeLabel(typ))
	}

	parent, err := s.Get(ctx, *parentID)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return fmt.Errorf("%w：上级不存在", ErrParentInvalid)
		}
		return err
	}
	for _, a := range allowed {
		if parent.Type == a {
			return nil
		}
	}
	return fmt.Errorf("%w：%s只能属于%s，「%s」是%s",
		ErrParentInvalid, typeLabel(typ), labelList(allowed), parent.Name, typeLabel(parent.Type))
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

// The labels below are the one place holder kinds are named in Chinese on the
// server. They exist because these messages tell an operator what to fix, and
// "department may only belong to company" helps nobody here.
var typeLabels = map[model.EntityType]string{
	model.EntityCompany:    "公司",
	model.EntityDepartment: "部门",
	model.EntityLocation:   "位置",
}

func typeLabel(t model.EntityType) string {
	if l, ok := typeLabels[t]; ok {
		return l
	}
	return string(t)
}

func labelList(types []model.EntityType) string {
	parts := make([]string, 0, len(types))
	for _, t := range types {
		parts = append(parts, typeLabel(t))
	}
	return strings.Join(parts, "或")
}

func requiredParentMessage(typ model.EntityType, allowed []model.EntityType) string {
	return fmt.Sprintf("%s必须属于一个%s，请先建立%s",
		typeLabel(typ), labelList(allowed), labelList(allowed))
}
