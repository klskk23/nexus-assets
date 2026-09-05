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

// VendorModelCount counts the assets a required vendor binding would eventually
// ask for: every asset of every model from this vendor.
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
