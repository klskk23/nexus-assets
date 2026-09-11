package schema

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

// ErrModelAmbiguous reports a model name that more than one vendor uses.
var ErrModelAmbiguous = errors.New("model name matches more than one vendor")

// ErrModelDuplicate reports a second product with one name under one vendor.
var ErrModelDuplicate = errors.New("vendor already has a product with this name")

// Every model query joins the vendor for its name. The join rather than a
// stored copy: a renamed vendor must not leave a stale string behind on a
// hundred model rows, and 016 exists precisely so there is one place the
// vendor's name lives.
const modelCols = `m.id, m.name, m.vendor_id, v.name, m.note, m.image_url, m.attr_defaults,
	m.archived_at, m.created_at, m.updated_at`

// modelFrom carries the join every scan depends on. LEFT, because a model with
// no vendor is ordinary rather than broken.
const modelFrom = `FROM product_models m LEFT JOIN vendors v ON v.id = m.vendor_id`

// modelOrder sorts by the vendor's name, with the vendorless first rather than
// scattered: ifnull keeps them together at one end.
const modelOrder = `ORDER BY ifnull(v.name,''), m.name`

func scanModel(row interface{ Scan(...any) error }) (model.ProductModel, error) {
	var m model.ProductModel
	var image, archived, vendorID, vendorName sql.NullString
	var defaults, created, updated string
	if err := row.Scan(&m.ID, &m.Name, &vendorID, &vendorName, &m.Note, &image, &defaults,
		&archived, &created, &updated); err != nil {
		return m, err
	}
	m.VendorID = vendorID.String
	m.VendorName = vendorName.String
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

// ListModels returns every product model.
func (s *Store) ListModels(ctx context.Context) ([]model.ProductModel, error) {
	rows, err := s.db.ReadDB().QueryContext(ctx,
		`SELECT `+modelCols+` `+modelFrom+` `+modelOrder)
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
	return out, rows.Err()
}

// GetModel loads one product model.
func (s *Store) GetModel(ctx context.Context, id string) (model.ProductModel, error) {
	m, err := scanModel(s.db.ReadDB().QueryRowContext(ctx,
		`SELECT `+modelCols+` `+modelFrom+` WHERE m.id = ?`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return m, ErrNotFound
	}
	return m, err
}

// CandidateModels lists the models an entry form or an import may name.
//
// Every model there is, since a model belongs to no category and so cannot be
// missing from one (026 decided that; 029 removed the last of the machinery).
// Archived ones stay out, which is a property of the model itself.
func (s *Store) CandidateModels(ctx context.Context) ([]model.ProductModel, error) {
	const q = `SELECT ` + modelCols + ` ` + modelFrom + `
	           WHERE m.archived_at IS NULL ` + modelOrder
	rows, err := s.db.ReadDB().QueryContext(ctx, q)
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

// ModelByName resolves a model by name, which is what CSV import needs: the
// file names models rather than carrying ids.
//
// Names are unique per vendor, not globally, so a name can legitimately match
// two rows. That is reported rather than resolved: picking one of them would
// attach the wrong hardware to a device and never say so.
func (s *Store) ModelByName(ctx context.Context, name string) (model.ProductModel, error) {
	rows, err := s.db.ReadDB().QueryContext(ctx,
		`SELECT `+modelCols+` `+modelFrom+` WHERE m.name = ? AND m.archived_at IS NULL LIMIT 2`, name)
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
	Name string
	// VendorID points at a vendor row, empty for a model that has none.
	VendorID string
	// Note is a sentence about the model. Empty is the ordinary state.
	Note         string
	ImageURL     string
	AttrDefaults map[string]any
}

// CreateModel inserts a product model.
//
// Defaults are copy semantics: they pre-fill the entry form and the actual
// values are written onto the asset. That keeps each asset row self-contained,
// so uniqueness checks and computed evaluation never have to merge two sources.
//
// The keys in AttrDefaults are not checked against any category. One model is
// recorded under any category there is, so a default is an offer rather than a
// promise -- one that does not apply is skipped when it is applied, not refused
// when it is written.
func (s *Store) CreateModel(ctx context.Context, in CreateModelInput) (model.ProductModel, error) {
	defaults, err := store.MarshalJSONMap(in.AttrDefaults)
	if err != nil {
		return model.ProductModel{}, err
	}
	now := time.Now().UTC()
	m := model.ProductModel{
		ID: store.NewID(), Name: in.Name, VendorID: strings.TrimSpace(in.VendorID),
		Note: in.Note, ImageURL: in.ImageURL,
		AttrDefaults: in.AttrDefaults, CreatedAt: now, UpdatedAt: now,
	}
	if m.AttrDefaults == nil {
		m.AttrDefaults = map[string]any{}
	}
	err = s.db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO product_models (id, name, vendor_id, note, image_url, attr_defaults, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			m.ID, m.Name, store.NullString(vendorPtr(m.VendorID)), m.Note, m.ImageURL, defaults,
			store.FormatTime(now), store.FormatTime(now)); err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		// The unique index is the guarantee; this turns its violation into
		// something the person filling in the form can act on.
		if strings.Contains(err.Error(), "UNIQUE constraint failed") {
			who := vendorLabel(ctx, s, m.VendorID)
			return m, i18n.Wrap(ErrModelDuplicate, i18n.KeyModelDuplicate, who, m.Name)
		}
		return m, fmt.Errorf("create model: %w", err)
	}
	// Read back for the vendor's name: it lives on the vendor row now, and the
	// form that gets this response shows the name, not the id.
	return s.GetModel(ctx, m.ID)
}

// ErrModelInvalid marks a rejected name.
var ErrModelInvalid = errors.New("invalid product model")

// ErrModelInUse blocks removing a model assets are still assigned to.
var ErrModelInUse = errors.New("product model is still in use")

// UpdateModelInput carries the editable parts of a product model.
//
// Every field is a pointer: a form that sends only what it changed must not
// silently blank the rest, and an empty string is a meaningful value of its
// own -- clearing the note is not the same as not mentioning it.
type UpdateModelInput struct {
	Name     *string
	VendorID *string
	// Note absent means "leave it alone" and an empty string clears it -- the
	// same three states the device note has (v2). An edit that does not mention
	// the note must not wipe what somebody wrote there.
	Note         *string
	ImageURL     *string
	AttrDefaults *map[string]any
}

// UpdateModel edits a product model.
func (s *Store) UpdateModel(ctx context.Context, id string, in UpdateModelInput) (model.ProductModel, error) {
	cur, err := s.GetModel(ctx, id)
	if err != nil {
		return cur, err
	}
	if err := applyModelPatch(&cur, in); err != nil {
		return cur, err
	}

	defaults, err := store.MarshalJSONMap(cur.AttrDefaults)
	if err != nil {
		return cur, err
	}
	now := time.Now().UTC()
	cur.UpdatedAt = now

	err = s.db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		if _, err := tx.ExecContext(ctx,
			`UPDATE product_models SET name = ?, vendor_id = ?, note = ?, image_url = ?, attr_defaults = ?, updated_at = ?
			 WHERE id = ?`,
			cur.Name, store.NullString(vendorPtr(cur.VendorID)), cur.Note, cur.ImageURL, defaults,
			store.FormatTime(now), id); err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE constraint failed") {
			who := vendorLabel(ctx, s, cur.VendorID)
			return cur, i18n.Wrap(ErrModelDuplicate, i18n.KeyModelDuplicate, who, cur.Name)
		}
		return cur, fmt.Errorf("update model: %w", err)
	}
	// Read back, for the same reason as the create -- and because cur still
	// carries the name of the vendor this model had before the change.
	return s.GetModel(ctx, id)
}

// vendorPtr turns the empty vendor into a NULL, which is what the nullable
// reference means: no vendor, not a vendor named "".
func vendorPtr(id string) *string {
	if id == "" {
		return nil
	}
	return &id
}

// vendorLabel names a vendor for a message. The id in a refusal would be no
// help to the person reading it, and "no vendor" is a real answer rather than
// a missing one.
func vendorLabel(ctx context.Context, s *Store, vendorID string) any {
	if vendorID == "" {
		return i18n.M(i18n.KeyModelNoVendor)
	}
	var name string
	if err := s.db.ReadDB().QueryRowContext(ctx,
		`SELECT name FROM vendors WHERE id = ?`, vendorID).Scan(&name); err != nil {
		return vendorID
	}
	return name
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
		_, err := tx.ExecContext(ctx, `DELETE FROM product_models WHERE id = ?`, id)
		return err
	})
	return 0, err
}

// applyModelPatch folds the given fields into the model as it stands.
//
// An absent field means "leave this alone", which is what makes every one of
// these a pointer: a rename must not also clear the vendor.
func applyModelPatch(cur *model.ProductModel, in UpdateModelInput) error {
	if in.Name != nil {
		if strings.TrimSpace(*in.Name) == "" {
			return i18n.Wrap(ErrModelInvalid, i18n.KeyModelNeedsName)
		}
		cur.Name = strings.TrimSpace(*in.Name)
	}
	if in.VendorID != nil {
		cur.VendorID = strings.TrimSpace(*in.VendorID)
	}
	if in.Note != nil {
		cur.Note = *in.Note
	}
	if in.ImageURL != nil {
		cur.ImageURL = *in.ImageURL
	}
	if in.AttrDefaults != nil {
		cur.AttrDefaults = *in.AttrDefaults
	}
	if cur.AttrDefaults == nil {
		cur.AttrDefaults = map[string]any{}
	}
	return nil
}
