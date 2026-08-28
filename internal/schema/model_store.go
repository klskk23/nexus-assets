package schema

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/store"
)

const modelCols = `id, category_id, name, vendor, image_url, attr_defaults, archived_at, created_at, updated_at`

func scanModel(row interface{ Scan(...any) error }) (model.ProductModel, error) {
	var m model.ProductModel
	var vendor, image, archived sql.NullString
	var defaults, created, updated string
	if err := row.Scan(&m.ID, &m.CategoryID, &m.Name, &vendor, &image, &defaults, &archived, &created, &updated); err != nil {
		return m, err
	}
	m.Vendor, m.ImageURL = vendor.String, image.String
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
	rows, err := s.db.ReadDB().QueryContext(ctx, `SELECT `+modelCols+` FROM product_models ORDER BY name`)
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
	m, err := scanModel(s.db.ReadDB().QueryRowContext(ctx, `SELECT `+modelCols+` FROM product_models WHERE id = ?`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return m, ErrNotFound
	}
	return m, err
}

// ModelByName resolves a model by category and name, which is what CSV import
// needs: the file names models rather than carrying ids.
func (s *Store) ModelByName(ctx context.Context, categoryID, name string) (model.ProductModel, error) {
	m, err := scanModel(s.db.ReadDB().QueryRowContext(ctx,
		`SELECT `+modelCols+` FROM product_models WHERE category_id = ? AND name = ?`, categoryID, name))
	if errors.Is(err, sql.ErrNoRows) {
		return m, ErrNotFound
	}
	return m, err
}

// CreateModelInput describes a new product model.
type CreateModelInput struct {
	CategoryID   string
	Name         string
	Vendor       string
	ImageURL     string
	AttrDefaults map[string]any
}

// CreateModel inserts a product model.
//
// Defaults are copy semantics: they pre-fill the entry form and the actual
// values are written onto the asset. That keeps each asset row self-contained,
// so uniqueness checks and computed evaluation never have to merge two sources.
func (s *Store) CreateModel(ctx context.Context, in CreateModelInput) (model.ProductModel, error) {
	defaults, err := store.MarshalJSONMap(in.AttrDefaults)
	if err != nil {
		return model.ProductModel{}, err
	}
	now := time.Now().UTC()
	m := model.ProductModel{
		ID: store.NewID(), CategoryID: in.CategoryID, Name: in.Name, Vendor: in.Vendor,
		ImageURL: in.ImageURL, AttrDefaults: in.AttrDefaults, CreatedAt: now, UpdatedAt: now,
	}
	if m.AttrDefaults == nil {
		m.AttrDefaults = map[string]any{}
	}
	err = s.db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx,
			`INSERT INTO product_models (id, category_id, name, vendor, image_url, attr_defaults, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			m.ID, m.CategoryID, m.Name, m.Vendor, m.ImageURL, defaults,
			store.FormatTime(now), store.FormatTime(now))
		return err
	})
	if err != nil {
		return m, fmt.Errorf("create model: %w", err)
	}
	return m, nil
}
