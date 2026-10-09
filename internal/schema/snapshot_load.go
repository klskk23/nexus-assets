package schema

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/klskk23/nexus-assets/internal/store"
)

func (s *SchemaSnapshot) loadDefinitions(ctx context.Context, q store.Querier) error {
	loads := []struct {
		query string
		scan  func(*sql.Rows) error
	}{
		{"SELECT " + categoryCols + " FROM categories ORDER BY path", func(rows *sql.Rows) error {
			c, err := scanCategory(rows)
			if err == nil {
				s.categories[c.ID] = c
			}
			return err
		}},
		{"SELECT " + fieldCols + " FROM field_definitions", func(rows *sql.Rows) error {
			f, err := scanField(rows)
			if err == nil {
				s.fields[f.ID] = f
			}
			return err
		}},
		{"SELECT " + modelCols + " " + modelFrom + " ORDER BY m.id", func(rows *sql.Rows) error {
			m, err := scanModel(rows)
			if err == nil {
				s.models[m.ID] = m
			}
			return err
		}},
		{"SELECT " + vendorCols + " FROM vendors", func(rows *sql.Rows) error {
			v, err := scanVendor(rows)
			if err == nil {
				s.vendors[v.ID] = v
			}
			return err
		}},
	}
	for _, load := range loads {
		if err := readSnapshotRows(ctx, q, load.query, load.scan); err != nil {
			return err
		}
	}
	return nil
}

func readSnapshotRows(ctx context.Context, q store.Querier, query string, scan func(*sql.Rows) error) error {
	rows, err := q.QueryContext(ctx, query)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		if err := scan(rows); err != nil {
			return err
		}
	}
	return rows.Err()
}

func (s *SchemaSnapshot) loadBindings(ctx context.Context, q store.Querier) error {
	// Legacy binding scans traverse table rows before a stable sort by sort.
	// Preserve row order for equal-sort ties rather than introducing an ID tie.
	if err := readSnapshotRows(ctx, q,
		`SELECT category_id, field_id, sort FROM category_fields ORDER BY rowid`,
		func(rows *sql.Rows) error {
			var categoryID, fieldID string
			var order int
			if err := rows.Scan(&categoryID, &fieldID, &order); err != nil {
				return err
			}
			field, ok := s.fields[fieldID]
			if !ok {
				return fmt.Errorf("category binding references missing field %s", fieldID)
			}
			s.bindings[categoryID] = append(s.bindings[categoryID], Binding{
				CategoryID: categoryID, Field: field, Required: field.Required, Sort: order,
			})
			return nil
		}); err != nil {
		return err
	}
	if err := readSnapshotRows(ctx, q,
		`SELECT category_id, field_id FROM category_field_selections`,
		func(rows *sql.Rows) error {
			var categoryID, fieldID string
			if err := rows.Scan(&categoryID, &fieldID); err != nil {
				return err
			}
			if s.selections[categoryID] == nil {
				s.selections[categoryID] = make(map[string]bool)
			}
			s.selections[categoryID][fieldID] = true
			return nil
		}); err != nil {
		return err
	}
	own, err := s.loadDeviceBindings(ctx, q, `SELECT model_id, field_id, sort FROM model_fields ORDER BY rowid`)
	if err != nil {
		return err
	}
	vendors, err := s.loadDeviceBindings(ctx, q, `SELECT vendor_id, field_id, sort FROM vendor_fields ORDER BY rowid`)
	if err != nil {
		return err
	}
	s.modelBindings = own
	s.vendorBindings = vendors
	modelsOfVendor := make(map[string][]string)
	for id, m := range s.models {
		if m.VendorID != "" {
			modelsOfVendor[m.VendorID] = append(modelsOfVendor[m.VendorID], id)
		}
	}
	inherited, vendorsOfField := resolveVendorFields(vendors, modelsOfVendor)
	device := mergeDeviceBindings(own, inherited)
	all := make(map[string]bool, len(device))
	for id := range device {
		all[id] = true
	}
	s.device = resolveModelFields(all, device, vendorsOfField)
	for _, field := range s.device {
		for _, id := range field.ModelIDs {
			s.deviceByModel[id] = append(s.deviceByModel[id], field)
		}
	}
	return nil
}

func (s *SchemaSnapshot) loadDeviceBindings(ctx context.Context, q store.Querier, query string) (map[string][]ModelBinding, error) {
	out := make(map[string][]ModelBinding)
	err := readSnapshotRows(ctx, q, query, func(rows *sql.Rows) error {
		var ownerID, fieldID string
		var order int
		if err := rows.Scan(&ownerID, &fieldID, &order); err != nil {
			return err
		}
		field, ok := s.fields[fieldID]
		if !ok {
			return fmt.Errorf("device binding references missing field %s", fieldID)
		}
		out[ownerID] = append(out[ownerID], ModelBinding{ModelID: ownerID, Field: field, Sort: order})
		return nil
	})
	return out, err
}
