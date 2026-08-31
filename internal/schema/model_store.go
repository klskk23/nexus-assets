package schema

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/klskk23/nexus-assets/internal/i18n"
	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/store"
)

// ErrModelAmbiguous reports a model name that more than one vendor uses.
var ErrModelAmbiguous = errors.New("model name matches more than one vendor")

// ErrModelDuplicate reports a second product with one name under one vendor.
var ErrModelDuplicate = errors.New("vendor already has a product with this name")

const modelCols = `id, name, vendor, image_url, attr_defaults, archived_at, created_at, updated_at`

func scanModel(row interface{ Scan(...any) error }) (model.ProductModel, error) {
	var m model.ProductModel
	var image, archived sql.NullString
	var defaults, created, updated string
	if err := row.Scan(&m.ID, &m.Name, &m.Vendor, &image, &defaults, &archived, &created, &updated); err != nil {
		return m, err
	}
	m.ImageURL = image.String
	var err error
	if m.AttrDefaults, err = store.UnmarshalJSONMap(defaults); err != nil {
		return m, err
	}
	if m.ArchivedAt, err = store.ScanTime(archived); err != nil {
		return m, err
	}
	if m.CreatedAt, err = store.ParseTime(created); err != nil {
		return m, err
	}
	if m.UpdatedAt, err = store.ParseTime(updated); err != nil {
		return m, err
	}
	return m, nil
}

// categoriesByModel loads the whole association table in one query.
//
// Models number in the hundreds at most, so loading the lot beats a join per
// row and keeps the statement count flat however many models come back.
func (s *Store) categoriesByModel(ctx context.Context) (map[string][]string, error) {
	rows, err := s.db.ReadDB().QueryContext(ctx,
		`SELECT model_id, category_id FROM product_model_categories ORDER BY model_id, category_id`)
	if err != nil {
		return nil, fmt.Errorf("load model categories: %w", err)
	}
	defer rows.Close()
	out := map[string][]string{}
	for rows.Next() {
		var mid, cid string
		if err := rows.Scan(&mid, &cid); err != nil {
			return nil, err
		}
		out[mid] = append(out[mid], cid)
	}
	return out, rows.Err()
}

// ListModels returns every product model with the categories it serves.
func (s *Store) ListModels(ctx context.Context) ([]model.ProductModel, error) {
	rows, err := s.db.ReadDB().QueryContext(ctx,
		`SELECT `+modelCols+` FROM product_models ORDER BY vendor, name`)
	if err != nil {
		return nil, fmt.Errorf("list models: %w", err)
	}
	defer rows.Close()
	var out []model.ProductModel
	for rows.Next() {
		m, err := scanModel(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	byModel, err := s.categoriesByModel(ctx)
	if err != nil {
		return nil, err
	}
	for i := range out {
		out[i].CategoryIDs = byModel[out[i].ID]
		if out[i].CategoryIDs == nil {
			out[i].CategoryIDs = []string{}
		}
	}
	return out, nil
}

// GetModel loads one product model.
func (s *Store) GetModel(ctx context.Context, id string) (model.ProductModel, error) {
	m, err := scanModel(s.db.ReadDB().QueryRowContext(ctx,
		`SELECT `+modelCols+` FROM product_models WHERE id = ?`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return m, ErrNotFound
	}
	if err != nil {
		return m, err
	}
	m.CategoryIDs, err = s.categoriesOf(ctx, id)
	return m, err
}

func (s *Store) categoriesOf(ctx context.Context, modelID string) ([]string, error) {
	rows, err := s.db.ReadDB().QueryContext(ctx,
		`SELECT category_id FROM product_model_categories WHERE model_id = ? ORDER BY category_id`, modelID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []string{}
	for rows.Next() {
		var cid string
		if err := rows.Scan(&cid); err != nil {
			return nil, err
		}
		out = append(out, cid)
	}
	return out, rows.Err()
}

// CandidateModels lists the models offered when recording an asset in the
// category with the given materialised path.
//
// A model associated with an ancestor is offered to its descendants, matching
// how bound fields are inherited. The reverse does not hold: a model attached
// to a child is not offered to the parent. Now that a model can carry several
// categories, making it available somewhere is an explicit act rather than an
// inference -- so the rule can stay one-directional and predictable.
func (s *Store) CandidateModels(ctx context.Context, categoryPath string) ([]model.ProductModel, error) {
	const q = `SELECT DISTINCT ` + modelColsPrefixed + `
	           FROM product_models m
	           JOIN product_model_categories pmc ON pmc.model_id = m.id
	           JOIN categories c ON c.id = pmc.category_id
	           WHERE ? LIKE c.path || '%' AND m.archived_at IS NULL
	           ORDER BY m.vendor, m.name`
	rows, err := s.db.ReadDB().QueryContext(ctx, q, categoryPath)
	if err != nil {
		return nil, fmt.Errorf("load candidate models: %w", err)
	}
	defer rows.Close()
	out := []model.ProductModel{}
	for rows.Next() {
		m, err := scanModel(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

const modelColsPrefixed = `m.id, m.name, m.vendor, m.image_url, m.attr_defaults, m.archived_at, m.created_at, m.updated_at`

// ModelByName resolves a model by name, which is what CSV import needs: the
// file names models rather than carrying ids.
//
// Names are unique per vendor, not globally, so a name can legitimately match
// two rows. That is reported rather than resolved: picking one of them would
// attach the wrong hardware to a device and never say so.
func (s *Store) ModelByName(ctx context.Context, name string) (model.ProductModel, error) {
	rows, err := s.db.ReadDB().QueryContext(ctx,
		`SELECT `+modelCols+` FROM product_models WHERE name = ? AND archived_at IS NULL LIMIT 2`, name)
	if err != nil {
		return model.ProductModel{}, err
	}
	defer rows.Close()
	var found []model.ProductModel
	for rows.Next() {
		m, err := scanModel(rows)
		if err != nil {
			return model.ProductModel{}, err
		}
		found = append(found, m)
	}
	if err := rows.Err(); err != nil {
		return model.ProductModel{}, err
	}
	switch len(found) {
	case 0:
		return model.ProductModel{}, ErrNotFound
	case 1:
		return found[0], nil
	default:
		return model.ProductModel{}, fmt.Errorf("%w: %q", ErrModelAmbiguous, name)
	}
}

// CreateModelInput describes a new product model.
type CreateModelInput struct {
	Name         string
	Vendor       string
	ImageURL     string
	CategoryIDs  []string
	AttrDefaults map[string]any
}

// CreateModel inserts a product model and its category associations.
//
// Defaults are copy semantics: they pre-fill the entry form and the actual
// values are written onto the asset. That keeps each asset row self-contained,
// so uniqueness checks and computed evaluation never have to merge two sources.
//
// The keys in AttrDefaults are not checked against any category. A model may
// serve categories with different field sets, and a default is an offer rather
// than a promise -- one that does not apply is skipped when it is applied, not
// refused when it is written.
func (s *Store) CreateModel(ctx context.Context, in CreateModelInput) (model.ProductModel, error) {
	defaults, err := store.MarshalJSONMap(in.AttrDefaults)
	if err != nil {
		return model.ProductModel{}, err
	}
	now := time.Now().UTC()
	m := model.ProductModel{
		ID: store.NewID(), Name: in.Name, Vendor: strings.TrimSpace(in.Vendor),
		ImageURL: in.ImageURL, CategoryIDs: dedupe(in.CategoryIDs),
		AttrDefaults: in.AttrDefaults, CreatedAt: now, UpdatedAt: now,
	}
	if m.AttrDefaults == nil {
		m.AttrDefaults = map[string]any{}
	}
	err = s.db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO product_models (id, name, vendor, image_url, attr_defaults, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?)`,
			m.ID, m.Name, m.Vendor, m.ImageURL, defaults,
			store.FormatTime(now), store.FormatTime(now)); err != nil {
			return err
		}
		for _, cid := range m.CategoryIDs {
			if _, err := tx.ExecContext(ctx,
				`INSERT INTO product_model_categories (model_id, category_id) VALUES (?, ?)`,
				m.ID, cid); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		// The unique index is the guarantee; this turns its violation into
		// something the person filling in the form can act on.
		if strings.Contains(err.Error(), "UNIQUE constraint failed") {
			var who any = m.Vendor
			if m.Vendor == "" {
				who = i18n.M(i18n.KeyModelNoVendor)
			}
			return m, i18n.Wrap(ErrModelDuplicate, i18n.KeyModelDuplicate, who, m.Name)
		}
		return m, fmt.Errorf("create model: %w", err)
	}
	return m, nil
}

func dedupe(in []string) []string {
	seen := map[string]bool{}
	out := []string{}
	for _, v := range in {
		if v == "" || seen[v] {
			continue
		}
		seen[v] = true
		out = append(out, v)
	}
	sort.Strings(out)
	return out
}

// ErrModelInvalid marks a rejected name.
var ErrModelInvalid = errors.New("invalid product model")

// ErrModelInUse blocks removing a model assets are still assigned to.
var ErrModelInUse = errors.New("product model is still in use")

// UpdateModelInput carries the editable parts of a product model.
//
// Every field is a pointer: a form that sends only what it changed must not
// silently blank the rest, and CategoryIDs in particular has a meaningful
// empty value -- a model attached to nothing is a legitimate state.
type UpdateModelInput struct {
	Name         *string
	Vendor       *string
	ImageURL     *string
	CategoryIDs  *[]string
	AttrDefaults *map[string]any
}

// UpdateModel edits a product model and its category associations.
func (s *Store) UpdateModel(ctx context.Context, id string, in UpdateModelInput) (model.ProductModel, error) {
	cur, err := s.GetModel(ctx, id)
	if err != nil {
		return cur, err
	}
	if in.Name != nil {
		if strings.TrimSpace(*in.Name) == "" {
			return cur, i18n.Wrap(ErrModelInvalid, i18n.KeyModelNeedsName)
		}
		cur.Name = strings.TrimSpace(*in.Name)
	}
	if in.Vendor != nil {
		cur.Vendor = strings.TrimSpace(*in.Vendor)
	}
	if in.ImageURL != nil {
		cur.ImageURL = *in.ImageURL
	}
	if in.CategoryIDs != nil {
		cur.CategoryIDs = dedupe(*in.CategoryIDs)
	}
	if in.AttrDefaults != nil {
		cur.AttrDefaults = *in.AttrDefaults
	}
	if cur.AttrDefaults == nil {
		cur.AttrDefaults = map[string]any{}
	}

	defaults, err := store.MarshalJSONMap(cur.AttrDefaults)
	if err != nil {
		return cur, err
	}
	now := time.Now().UTC()
	cur.UpdatedAt = now

	err = s.db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		if _, err := tx.ExecContext(ctx,
			`UPDATE product_models SET name = ?, vendor = ?, image_url = ?, attr_defaults = ?, updated_at = ?
			 WHERE id = ?`,
			cur.Name, cur.Vendor, cur.ImageURL, defaults, store.FormatTime(now), id); err != nil {
			return err
		}
		if in.CategoryIDs == nil {
			return nil
		}
		// Replaced wholesale rather than diffed: the join table carries
		// nothing but the pair, so there is no state a diff would preserve.
		if _, err := tx.ExecContext(ctx,
			`DELETE FROM product_model_categories WHERE model_id = ?`, id); err != nil {
			return err
		}
		for _, cid := range cur.CategoryIDs {
			if _, err := tx.ExecContext(ctx,
				`INSERT INTO product_model_categories (model_id, category_id) VALUES (?, ?)`,
				id, cid); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE constraint failed") {
			var who any = cur.Vendor
			if cur.Vendor == "" {
				who = i18n.M(i18n.KeyModelNoVendor)
			}
			return cur, i18n.Wrap(ErrModelDuplicate, i18n.KeyModelDuplicate, who, cur.Name)
		}
		return cur, fmt.Errorf("update model: %w", err)
	}
	return cur, nil
}

// ModelUsage counts the assets assigned to a model.
func (s *Store) ModelUsage(ctx context.Context, id string) (int, error) {
	var n int
	err := s.db.ReadDB().QueryRowContext(ctx,
		`SELECT count(*) FROM assets WHERE model_id = ?`, id).Scan(&n)
	if err != nil {
		return 0, fmt.Errorf("count assets using model %q: %w", id, err)
	}
	return n, nil
}

// DeleteModel removes a product model.
//
// Refused while any asset is assigned to it -- that is data, and clearing the
// assignment silently would lose which device is which product. Category
// associations go with it, the same consented cascade a category delete
// performs in the other direction.
func (s *Store) DeleteModel(ctx context.Context, id string) (int, error) {
	cur, err := s.GetModel(ctx, id)
	if err != nil {
		return 0, err
	}
	used, err := s.ModelUsage(ctx, id)
	if err != nil {
		return 0, err
	}
	if used > 0 {
		return used, i18n.Wrap(ErrModelInUse, i18n.KeyModelInUse, used, cur.Name)
	}

	err = s.db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		if _, err := tx.ExecContext(ctx,
			`DELETE FROM product_model_categories WHERE model_id = ?`, id); err != nil {
			return err
		}
		_, err := tx.ExecContext(ctx, `DELETE FROM product_models WHERE id = ?`, id)
		return err
	})
	return 0, err
}
