package schema

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/klskk23/nexus-assets/internal/i18n"
	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/store"
)

// ErrNotFound is returned when a record does not exist.
var ErrNotFound = errors.New("not found")

// ErrCategoryHasAssets blocks moving a node whose subtree still holds assets.
var ErrCategoryHasAssets = errors.New("category subtree still holds assets")

// Store provides access to categories, field definitions, bindings and models.
type Store struct {
	db              *store.Store
	effects         AssetEffects
	confirmationKey [32]byte
}

// New builds a schema store that refuses asset-affecting schema changes.
func New(db *store.Store) *Store { return &Store{db: db, confirmationKey: newConfirmationKey()} }

// NewWithEffects supplies transactional asset-effect planning without creating
// a dependency from schema to the asset package.
func NewWithEffects(db *store.Store, effects AssetEffects) *Store {
	return &Store{db: db, effects: effects, confirmationKey: newConfirmationKey()}
}

const categoryCols = `id, code, name, parent_id, path, display_key, print_preset_ids, archived_at, created_at, updated_at`

func scanCategory(row interface{ Scan(...any) error }) (model.Category, error) {
	var c model.Category
	var parent, displayKey, archived sql.NullString
	var created, updated string
	var presets string
	if err := row.Scan(&c.ID, &c.Code, &c.Name, &parent, &c.Path, &displayKey,
		&presets, &archived, &created, &updated); err != nil {
		return c, err
	}
	c.PrintPresetIDs = []string{}
	if err := json.Unmarshal([]byte(presets), &c.PrintPresetIDs); err != nil {
		return c, err
	}
	c.ParentID = store.StrPtr(parent)
	c.DisplayKey = displayKey.String
	var err error
	if c.ArchivedAt, err = store.ScanTime(archived); err != nil {
		return c, err
	}
	if c.CreatedAt, err = store.ParseTime(created); err != nil {
		return c, err
	}
	if c.UpdatedAt, err = store.ParseTime(updated); err != nil {
		return c, err
	}
	return c, nil
}

// ListCategories returns every category ordered by path, which yields a
// depth-first tree order.
func (s *Store) ListCategories(ctx context.Context) ([]model.Category, error) {
	rows, err := s.db.ReadDB().QueryContext(ctx, `SELECT `+categoryCols+` FROM categories ORDER BY path`)
	if err != nil {
		return nil, fmt.Errorf("list categories: %w", err)
	}
	defer rows.Close()

	var out []model.Category
	for rows.Next() {
		c, err := scanCategory(rows)
		if err != nil {
			return nil, fmt.Errorf("scan category: %w", err)
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// GetCategory loads one category.
func (s *Store) GetCategory(ctx context.Context, id string) (model.Category, error) {
	row := s.db.ReadDB().QueryRowContext(ctx, `SELECT `+categoryCols+` FROM categories WHERE id = ?`, id)
	c, err := scanCategory(row)
	if errors.Is(err, sql.ErrNoRows) {
		return c, ErrNotFound
	}
	if err != nil {
		return c, fmt.Errorf("get category: %w", err)
	}
	return c, nil
}

// CreateCategoryInput describes a new category.
type CreateCategoryInput struct {
	Code              string
	Name              string
	ParentID          *string
	DisplayKey        string
	PrintPresetIDs    []string
	InheritedFieldIDs *[]string
	ConfirmationToken string
}

// CreateCategory inserts a category, computing its materialised path from the
// parent so subtree queries stay a prefix match rather than a recursive CTE.
func (s *Store) CreateCategory(ctx context.Context, in CreateCategoryInput) (model.Category, error) {
	out, err := s.saveCategory(ctx, "", CategoryDraft{
		Code: in.Code, Name: &in.Name, ParentID: &in.ParentID,
		DisplayKey: &in.DisplayKey, PrintPresetIDs: &in.PrintPresetIDs,
		InheritedFieldIDs: in.InheritedFieldIDs, ConfirmationToken: in.ConfirmationToken,
	})
	if err != nil {
		return out, fmt.Errorf("create category: %w", err)
	}
	return out, nil
}

// UpdateCategoryInput carries the mutable parts of a category.
type UpdateCategoryInput struct {
	Name              *string
	DisplayKey        *string
	PrintPresetIDs    *[]string
	ParentID          **string // outer nil means "leave alone"
	InheritedFieldIDs *[]string
	ConfirmationToken string
}

// UpdateCategory changes a category.
//
// Moving a node is refused while its subtree holds assets: the effective field
// set would change underneath records that were validated against the old one.
// The escape hatch is to create the new category, move the assets across in
// bulk, then move the now-empty node.
func (s *Store) UpdateCategory(ctx context.Context, id string, in UpdateCategoryInput) (model.Category, error) {
	if id == "" {
		return model.Category{}, ErrNotFound
	}
	return s.saveCategory(ctx, id, CategoryDraft{
		Name: in.Name, ParentID: in.ParentID, DisplayKey: in.DisplayKey,
		PrintPresetIDs: in.PrintPresetIDs, InheritedFieldIDs: in.InheritedFieldIDs, ConfirmationToken: in.ConfirmationToken,
	})
}

// DisplayKeys returns every category's display key, keyed by category id.
//
// The list page resolves the display name of a whole page of assets from this
// one map, which is what keeps the statement count flat as rows grow.
func (s *Store) DisplayKeys(ctx context.Context) (map[string]string, error) {
	rows, err := s.db.ReadDB().QueryContext(ctx, `SELECT id, coalesce(display_key, '') FROM categories`)
	if err != nil {
		return nil, fmt.Errorf("load display keys: %w", err)
	}
	defer rows.Close()
	out := map[string]string{}
	for rows.Next() {
		var id, t string
		if err := rows.Scan(&id, &t); err != nil {
			return nil, err
		}
		out[id] = t
	}
	return out, rows.Err()
}

// ErrDisplayKeyInvalid rejects a display key that cannot serve as an identifier.
var ErrDisplayKeyInvalid = errors.New("display key is not usable")

// displayKeyError distinguishes a device-only key from an unavailable category
// key, after the planner has checked the final effective category fields.
func displayKeyError(ctx context.Context, q store.Querier, key string) (error, error) {
	var n int
	if err := q.QueryRowContext(ctx, `
		SELECT (SELECT count(*) FROM model_fields mf
		        JOIN field_definitions f ON f.id = mf.field_id
		        WHERE f.key = ?)
		     + (SELECT count(*) FROM vendor_fields vf
		        JOIN field_definitions f ON f.id = vf.field_id
		        WHERE f.key = ?)`, key, key).Scan(&n); err != nil {
		return nil, err
	}
	if n > 0 {
		return i18n.Wrap(ErrDisplayKeyNotCategoryField, i18n.KeyDisplayKeyNotCategory, key), nil
	}
	return i18n.Wrap(ErrDisplayKeyInvalid, i18n.KeyDisplayKeyUnbound, key), nil
}

// nilIfEmpty keeps an unset display key as SQL NULL rather than an empty
// string, so "not configured" has exactly one representation.
func nilIfEmpty(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

// ErrCategoryHasChildren blocks deleting a node that other categories hang off.
var ErrCategoryHasChildren = errors.New("category still has child categories")

// CategoryBlocker names one thing standing in the way of deleting a category.
type CategoryBlocker struct {
	// Kind is "category", "asset" or "model".
	Kind string `json:"kind"`
	ID   string `json:"id"`
	Name string `json:"name"`
}

// categoryBlockerLimit caps how many are listed, as elsewhere: enough to show
// what is going on without turning an error into a report.
const categoryBlockerLimit = 5

// DeleteCategory removes a category, refusing while anything still depends on it.
//
// Three refusals, cheapest first, and each names what is in the way:
//
//   - child categories, because deleting a subtree is a much larger act than
//     the one being asked for and nobody should get it by accident
//   - assets anywhere beneath it, the same rule every other record follows:
//     configuration that has produced data is not configuration any more
//
// Two things go with it rather than blocking it:
//
//   - its own field bindings, which describe what this category asks for and
//     mean nothing once it is gone
//   - its model associations. Refusing on those looked consistent, but nothing
//     in the interface can detach a model from a category, so the refusal was
//     a dead end. The models themselves survive; a model attached to no
//     category is an ordinary state, the one a model sits in before it is
//     placed anywhere.
func (s *Store) DeleteCategory(ctx context.Context, id string) ([]CategoryBlocker, int, error) {
	cur, err := s.GetCategory(ctx, id)
	if err != nil {
		return nil, 0, err
	}

	children, err := s.blockers(ctx, `SELECT id, name FROM categories WHERE parent_id = ? ORDER BY name`, "category", id)
	if err != nil {
		return nil, 0, err
	}
	if len(children) > 0 {
		return children, len(children), i18n.Wrap(ErrCategoryHasChildren,
			i18n.KeyCategoryHasChildren, cur.Name, len(children))
	}

	assets, total, err := s.assetsUnder(ctx, cur.Path)
	if err != nil {
		return nil, 0, err
	}
	if total > 0 {
		var partial any = ""
		if len(assets) < total {
			partial = i18n.M(i18n.KeyListTruncated, len(assets))
		}
		return assets, total, i18n.Wrap(ErrCategoryHasAssets,
			i18n.KeyCategoryHasAssets, cur.Name, total, partial)
	}

	err = s.db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		for _, q := range []string{
			// It belongs to this category and points nowhere else.
			`DELETE FROM category_fields WHERE category_id = ?`,
			`DELETE FROM categories WHERE id = ?`,
		} {
			if _, err := tx.ExecContext(ctx, q, id); err != nil {
				return err
			}
		}
		return nil
	})
	return nil, 0, err
}

func (s *Store) blockers(ctx context.Context, q, kind, arg string) ([]CategoryBlocker, error) {
	rows, err := s.db.ReadDB().QueryContext(ctx, q, arg)
	if err != nil {
		return nil, fmt.Errorf("list %s blockers: %w", kind, err)
	}
	defer rows.Close()
	var out []CategoryBlocker
	for rows.Next() {
		b := CategoryBlocker{Kind: kind}
		if err := rows.Scan(&b.ID, &b.Name); err != nil {
			return nil, err
		}
		out = append(out, b)
	}
	return out, rows.Err()
}

// assetsUnder counts the assets in a subtree and names the first few.
func (s *Store) assetsUnder(ctx context.Context, path string) ([]CategoryBlocker, int, error) {
	const where = `FROM assets a JOIN categories c ON c.id = a.category_id WHERE c.path LIKE ? || '%'`

	var total int
	if err := s.db.ReadDB().QueryRowContext(ctx, `SELECT count(*) `+where, path).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count assets under %s: %w", path, err)
	}
	if total == 0 {
		return nil, 0, nil
	}

	rows, err := s.db.ReadDB().QueryContext(ctx,
		`SELECT a.id, a.attrs, coalesce(c.display_key, '') `+where+
			` ORDER BY a.created_at, a.id LIMIT ?`, path, categoryBlockerLimit)
	if err != nil {
		return nil, 0, fmt.Errorf("list assets under %s: %w", path, err)
	}
	defer rows.Close()
	var out []CategoryBlocker
	for rows.Next() {
		b := CategoryBlocker{Kind: "asset"}
		var attrsJSON, displayKey string
		if err := rows.Scan(&b.ID, &attrsJSON, &displayKey); err != nil {
			return nil, 0, err
		}
		attrs, err := store.UnmarshalJSONMap(attrsJSON)
		if err != nil {
			return nil, 0, err
		}
		b.Name = model.AssetDisplayName(b.ID, attrs, displayKey)
		out = append(out, b)
	}
	return out, total, rows.Err()
}

// sameParent reports whether two optional parent ids name the same place.
func sameParent(a, b *string) bool {
	if a == nil || b == nil {
		return a == nil && b == nil
	}
	return *a == *b
}
