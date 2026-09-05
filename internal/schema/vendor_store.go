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

// ErrVendorInUse blocks deleting a vendor that models still come from.
//
// Same rule as categories, statuses and holders: configuration that has
// produced data is removed by first moving what points at it, not by having the
// pointer quietly break.
var ErrVendorInUse = errors.New("vendor still has models")

// ErrVendorInvalid reports a vendor that cannot be saved as asked.
var ErrVendorInvalid = errors.New("vendor invalid")

const vendorCols = `id, name, created_at, updated_at`

func scanVendor(row interface{ Scan(...any) error }) (model.Vendor, error) {
	var v model.Vendor
	var created, updated string
	if err := row.Scan(&v.ID, &v.Name, &created, &updated); err != nil {
		return v, err
	}
	var err error
	if v.CreatedAt, err = store.ParseTime(created); err != nil {
		return v, err
	}
	if v.UpdatedAt, err = store.ParseTime(updated); err != nil {
		return v, err
	}
	return v, nil
}

// ListVendors returns every vendor with how many models come from it.
//
// The count travels with the row so the delete guard can be shown rather than
// discovered: a button that refuses after the click is worse than one that
// says what is in the way beforehand.
func (s *Store) ListVendors(ctx context.Context) ([]model.Vendor, error) {
	rows, err := s.db.ReadDB().QueryContext(ctx,
		`SELECT v.id, v.name, v.created_at, v.updated_at,
		        (SELECT count(*) FROM product_models m WHERE m.vendor_id = v.id)
		 FROM vendors v ORDER BY v.name`)
	if err != nil {
		return nil, fmt.Errorf("list vendors: %w", err)
	}
	defer rows.Close()
	out := []model.Vendor{}
	for rows.Next() {
		var v model.Vendor
		var created, updated string
		if err := rows.Scan(&v.ID, &v.Name, &created, &updated, &v.ModelCount); err != nil {
			return nil, err
		}
		if v.CreatedAt, err = store.ParseTime(created); err != nil {
			return nil, err
		}
		if v.UpdatedAt, err = store.ParseTime(updated); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}

// GetVendor loads one vendor.
func (s *Store) GetVendor(ctx context.Context, id string) (model.Vendor, error) {
	v, err := scanVendor(s.db.ReadDB().QueryRowContext(ctx,
		`SELECT `+vendorCols+` FROM vendors WHERE id = ?`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return v, ErrNotFound
	}
	return v, err
}

// CreateVendor registers a vendor.
func (s *Store) CreateVendor(ctx context.Context, name string) (model.Vendor, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return model.Vendor{}, i18n.Wrap(ErrVendorInvalid, i18n.KeyVendorNeedsName)
	}
	now := time.Now().UTC()
	v := model.Vendor{ID: store.NewID(), Name: name, CreatedAt: now, UpdatedAt: now}
	err := s.db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx,
			`INSERT INTO vendors (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)`,
			v.ID, v.Name, store.FormatTime(now), store.FormatTime(now))
		return err
	})
	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE constraint failed") {
			return v, i18n.Wrap(ErrVendorInvalid, i18n.KeyVendorDuplicate, name)
		}
		return v, fmt.Errorf("create vendor: %w", err)
	}
	return v, nil
}

// RenameVendor changes a vendor's name.
//
// Nothing else has to follow it: models point at the row, and every read joins
// for the name. That is the whole reason this is an entity -- a renamed vendor
// used to mean updating a string on every one of its models, or not, and
// finding out later which.
func (s *Store) RenameVendor(ctx context.Context, id, name string) (model.Vendor, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return model.Vendor{}, i18n.Wrap(ErrVendorInvalid, i18n.KeyVendorNeedsName)
	}
	now := time.Now().UTC()
	err := s.db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		res, err := tx.ExecContext(ctx,
			`UPDATE vendors SET name = ?, updated_at = ? WHERE id = ?`,
			name, store.FormatTime(now), id)
		if err != nil {
			return err
		}
		if n, _ := res.RowsAffected(); n == 0 {
			return ErrNotFound
		}
		return nil
	})
	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE constraint failed") {
			return model.Vendor{}, i18n.Wrap(ErrVendorInvalid, i18n.KeyVendorDuplicate, name)
		}
		return model.Vendor{}, err
	}
	return s.GetVendor(ctx, id)
}

// DeleteVendor removes a vendor, refusing while models still come from it.
func (s *Store) DeleteVendor(ctx context.Context, id string) (int, error) {
	var used int
	if err := s.db.ReadDB().QueryRowContext(ctx,
		`SELECT count(*) FROM product_models WHERE vendor_id = ?`, id).Scan(&used); err != nil {
		return 0, fmt.Errorf("count models of vendor: %w", err)
	}
	if used > 0 {
		v, _ := s.GetVendor(ctx, id)
		return used, i18n.Wrap(ErrVendorInUse, i18n.KeyVendorInUse, used, v.Name)
	}
	err := s.db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		res, err := tx.ExecContext(ctx, `DELETE FROM vendors WHERE id = ?`, id)
		if err != nil {
			return err
		}
		if n, _ := res.RowsAffected(); n == 0 {
			return ErrNotFound
		}
		return nil
	})
	return 0, err
}

// VendorBindingsByVendor loads every vendor binding, grouped by vendor id.
//
// Loaded whole, like BindingsByCategory and ModelBindingsByModel: vendors
// number in the dozens, and this must never become a lookup per model. That is
// the N+1 the constitution forbids, and the resolver below runs on every save.
func (s *Store) VendorBindingsByVendor(ctx context.Context) (map[string][]ModelBinding, error) {
	q := `SELECT vf.vendor_id, vf.sort,
	             f.id, f.key, f.label, f.type, f.options, f.is_unique, f.required,
	             f.created_at, f.updated_at
	      FROM vendor_fields vf JOIN field_definitions f ON f.id = vf.field_id`
	rows, err := s.db.ReadDB().QueryContext(ctx, q)
	if err != nil {
		return nil, fmt.Errorf("load vendor bindings: %w", err)
	}
	defer rows.Close()

	out := map[string][]ModelBinding{}
	for rows.Next() {
		var b ModelBinding
		var vendorID string
		var required, isUnique int
		var opts, created, updated string
		if err := rows.Scan(&vendorID, &b.Sort,
			&b.Field.ID, &b.Field.Key, &b.Field.Label, &b.Field.Type, &opts, &isUnique, &required,
			&created, &updated); err != nil {
			return nil, err
		}
		b.Field.IsUnique = isUnique == 1
		b.Field.Required = required == 1
		if err := decodeOptions(opts, &b.Field.Options); err != nil {
			return nil, err
		}
		if err := fillTimes(&b.Field, created, updated); err != nil {
			return nil, err
		}
		out[vendorID] = append(out[vendorID], b)
	}
	return out, rows.Err()
}

// ModelsOfVendor maps each vendor to the models that come from it.
func (s *Store) ModelsOfVendor(ctx context.Context) (map[string][]string, error) {
	rows, err := s.db.ReadDB().QueryContext(ctx,
		`SELECT vendor_id, id FROM product_models WHERE vendor_id IS NOT NULL ORDER BY vendor_id, name`)
	if err != nil {
		return nil, fmt.Errorf("load models of vendor: %w", err)
	}
	defer rows.Close()
	out := map[string][]string{}
	for rows.Next() {
		var vendorID, modelID string
		if err := rows.Scan(&vendorID, &modelID); err != nil {
			return nil, err
		}
		out[vendorID] = append(out[vendorID], modelID)
	}
	return out, rows.Err()
}

// VendorsOfField lists the vendors a field is bound to, for the interface's
// "bound where" half (016, decision 113).
func (s *Store) VendorsOfField(ctx context.Context) (map[string][]string, error) {
	rows, err := s.db.ReadDB().QueryContext(ctx,
		`SELECT field_id, vendor_id FROM vendor_fields ORDER BY field_id, vendor_id`)
	if err != nil {
		return nil, fmt.Errorf("load field vendors: %w", err)
	}
	defer rows.Close()
	out := map[string][]string{}
	for rows.Next() {
		var fieldID, vendorID string
		if err := rows.Scan(&fieldID, &vendorID); err != nil {
			return nil, err
		}
		out[fieldID] = append(out[fieldID], vendorID)
	}
	return out, rows.Err()
}

// VendorRequiredImpact counts the assets a required vendor binding would
// eventually ask for: every asset of every model from this vendor.
func (s *Store) VendorRequiredImpact(ctx context.Context, vendorID string) (int, error) {
	var n int
	err := s.db.ReadDB().QueryRowContext(ctx,
		`SELECT count(*) FROM assets a
		 JOIN product_models m ON m.id = a.model_id
		 WHERE m.vendor_id = ? AND a.deleted_at IS NULL`, vendorID).Scan(&n)
	if err != nil {
		return 0, fmt.Errorf("count assets of vendor: %w", err)
	}
	return n, nil
}

// BindVendor hangs a field on a vendor, so every model from that vendor has it.
//
// Refused when the field already has a category binding: the two sides are
// exclusive (016, decision 110). Not refused when it already has a model
// binding -- that is the same side, and the union is what was asked for.
func (s *Store) BindVendor(ctx context.Context, vendorID, fieldID string, sort int) error {
	return s.db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		return bindVendorTx(ctx, tx, vendorID, fieldID, sort)
	})
}

func bindVendorTx(ctx context.Context, tx *sql.Tx, vendorID, fieldID string, sort int) error {
	var key string
	if err := tx.QueryRowContext(ctx,
		`SELECT key FROM field_definitions WHERE id = ?`, fieldID).Scan(&key); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ErrNotFound
		}
		return err
	}
	var exists int
	if err := tx.QueryRowContext(ctx,
		`SELECT count(*) FROM vendors WHERE id = ?`, vendorID).Scan(&exists); err != nil {
		return err
	}
	if exists == 0 {
		return ErrNotFound
	}

	var boundToCategory int
	if err := tx.QueryRowContext(ctx,
		`SELECT count(*) FROM category_fields WHERE field_id = ?`, fieldID).Scan(&boundToCategory); err != nil {
		return err
	}
	if boundToCategory > 0 {
		return i18n.Wrap(ErrBindingModeConflict, i18n.KeyBindingModeConflict)
	}

	if err := vendorKeyFree(ctx, tx, vendorID, fieldID, key); err != nil {
		return err
	}

	_, err := tx.ExecContext(ctx,
		`INSERT INTO vendor_fields (vendor_id, field_id, sort)
		 VALUES (?, ?, ?)
		 ON CONFLICT(vendor_id, field_id) DO UPDATE SET sort = excluded.sort`,
		vendorID, fieldID, sort)
	return err
}

// vendorKeyFree refuses a key already reachable by the assets this binding
// would cover.
//
// The reach of a vendor binding is every model from that vendor, so the
// categories those models sit in -- with their ancestors and subtrees -- are
// where the key has to be free. Same question modelKeyFree asks, one join
// further out.
func vendorKeyFree(ctx context.Context, tx *sql.Tx, vendorID, fieldID, key string) error {
	// Another field already on this vendor.
	var owner string
	err := tx.QueryRowContext(ctx, `
		SELECT v.name
		FROM vendor_fields vf
		JOIN field_definitions f ON f.id = vf.field_id
		JOIN vendors v ON v.id = vf.vendor_id
		WHERE vf.vendor_id = ? AND vf.field_id <> ? AND f.key = ?
		LIMIT 1`, vendorID, fieldID, key).Scan(&owner)
	if err == nil {
		return i18n.Wrap(ErrKeyConflict, i18n.KeyBindDuplicate, key, owner)
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return err
	}

	// Anything bound on a category one of this vendor's models belongs to.
	err = tx.QueryRowContext(ctx, `
		SELECT c.name
		FROM category_fields cf
		JOIN field_definitions f ON f.id = cf.field_id
		JOIN categories c ON c.id = cf.category_id
		WHERE f.key = ? AND cf.field_id <> ? AND EXISTS (
			SELECT 1 FROM product_models m
			JOIN product_model_categories pmc ON pmc.model_id = m.id
			JOIN categories mc ON mc.id = pmc.category_id
			WHERE m.vendor_id = ?
			  AND (mc.path LIKE c.path || '%' OR c.path LIKE mc.path || '%')
		)
		LIMIT 1`, key, fieldID, vendorID).Scan(&owner)
	if err == nil {
		return i18n.Wrap(ErrKeyConflict, i18n.KeyBindDuplicate, key, owner)
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return err
	}
	return nil
}

// UnbindVendor detaches a field from a vendor. Values already stored under it
// become archived attributes on the next read, the same as any other unbind.
func (s *Store) UnbindVendor(ctx context.Context, vendorID, fieldID string) error {
	return s.db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		res, err := tx.ExecContext(ctx,
			`DELETE FROM vendor_fields WHERE vendor_id = ? AND field_id = ?`, vendorID, fieldID)
		if err != nil {
			return err
		}
		if n, _ := res.RowsAffected(); n == 0 {
			return ErrNotFound
		}
		return nil
	})
}

// VendorChangeImpact is the dry-run behind changing a model's vendor.
//
// Moving a model from Dell to Lenovo takes away every field Dell provided and
// this model does not otherwise have. Values already recorded under those
// fields are not deleted -- they become archived attributes, computed at read
// time, visible and read-only (016, decision 112). That is a mild outcome, but
// it happens to every device of the model at once, so the number and the field
// names are shown before the change rather than discovered after it.
//
// The fields Lenovo also provides, and the ones bound to this model directly,
// stay live and are not counted: they are still reachable after the move.
func (s *Store) VendorChangeImpact(ctx context.Context, modelID, newVendorID string) (int, []string, error) {
	rows, err := s.db.ReadDB().QueryContext(ctx, `
		SELECT f.key, f.label
		FROM vendor_fields vf
		JOIN field_definitions f ON f.id = vf.field_id
		JOIN product_models m ON m.vendor_id = vf.vendor_id
		WHERE m.id = ?
		  AND vf.field_id NOT IN (SELECT field_id FROM model_fields WHERE model_id = ?)
		  AND vf.field_id NOT IN (SELECT field_id FROM vendor_fields WHERE vendor_id = ?)
		ORDER BY vf.sort, f.label`, modelID, modelID, newVendorID)
	if err != nil {
		return 0, nil, fmt.Errorf("load fields lost by a vendor change: %w", err)
	}
	defer rows.Close()
	var keys, labels []string
	for rows.Next() {
		var key, label string
		if err := rows.Scan(&key, &label); err != nil {
			return 0, nil, err
		}
		keys = append(keys, key)
		labels = append(labels, label)
	}
	if err := rows.Err(); err != nil {
		return 0, nil, err
	}
	if len(keys) == 0 {
		return 0, []string{}, nil
	}

	// Only devices that actually hold one of those values are affected. A
	// device of this model that never had a service tag filled in loses
	// nothing, and counting it would overstate what the change costs.
	q := `SELECT count(*) FROM assets
	      WHERE model_id = ? AND deleted_at IS NULL AND (`
	args := []any{modelID}
	for i, key := range keys {
		if i > 0 {
			q += " OR "
		}
		q += `json_extract(attrs, '$.' || ?) IS NOT NULL`
		args = append(args, key)
	}
	q += ")"
	var n int
	if err := s.db.ReadDB().QueryRowContext(ctx, q, args...).Scan(&n); err != nil {
		return 0, nil, fmt.Errorf("count assets affected by a vendor change: %w", err)
	}
	return n, labels, nil
}
