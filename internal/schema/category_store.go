package schema

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/store"
)

// ErrNotFound is returned when a record does not exist.
var ErrNotFound = errors.New("not found")

// ErrCategoryHasAssets blocks moving a node whose subtree still holds assets.
var ErrCategoryHasAssets = errors.New("category subtree still holds assets")

// Store provides access to categories, field definitions, bindings and models.
type Store struct{ db *store.Store }

// New builds a schema store.
func New(db *store.Store) *Store { return &Store{db: db} }

const categoryCols = `id, code, name, parent_id, path, sn_template, archived_at, created_at, updated_at`

func scanCategory(row interface{ Scan(...any) error }) (model.Category, error) {
	var c model.Category
	var parent, snTmpl, archived sql.NullString
	var created, updated string
	if err := row.Scan(&c.ID, &c.Code, &c.Name, &parent, &c.Path, &snTmpl, &archived, &created, &updated); err != nil {
		return c, err
	}
	c.ParentID = store.StrPtr(parent)
	c.SNTemplate = snTmpl.String
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
	Code       string
	Name       string
	ParentID   *string
	SNTemplate string
}

// CreateCategory inserts a category, computing its materialised path from the
// parent so subtree queries stay a prefix match rather than a recursive CTE.
func (s *Store) CreateCategory(ctx context.Context, in CreateCategoryInput) (model.Category, error) {
	var out model.Category
	err := s.db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		parentPath := ""
		if in.ParentID != nil {
			if err := tx.QueryRowContext(ctx, `SELECT path FROM categories WHERE id = ?`, *in.ParentID).
				Scan(&parentPath); err != nil {
				if errors.Is(err, sql.ErrNoRows) {
					return fmt.Errorf("parent category %s: %w", *in.ParentID, ErrNotFound)
				}
				return err
			}
		}
		now := time.Now().UTC()
		out = model.Category{
			ID: store.NewID(), Code: in.Code, Name: in.Name, ParentID: in.ParentID,
			SNTemplate: in.SNTemplate, CreatedAt: now, UpdatedAt: now,
		}
		out.Path = BuildPath(parentPath, out.ID)

		_, err := tx.ExecContext(ctx,
			`INSERT INTO categories (id, code, name, parent_id, path, sn_template, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			out.ID, out.Code, out.Name, store.NullString(out.ParentID), out.Path,
			out.SNTemplate, store.FormatTime(now), store.FormatTime(now))
		return err
	})
	if err != nil {
		return out, fmt.Errorf("create category: %w", err)
	}
	return out, nil
}

// UpdateCategoryInput carries the mutable parts of a category.
type UpdateCategoryInput struct {
	Name       *string
	SNTemplate *string
	ParentID   **string // outer nil means "leave alone"
}

// UpdateCategory changes a category.
//
// Moving a node is refused while its subtree holds assets: the effective field
// set would change underneath records that were validated against the old one.
// The escape hatch is to create the new category, move the assets across in
// bulk, then move the now-empty node.
func (s *Store) UpdateCategory(ctx context.Context, id string, in UpdateCategoryInput) (model.Category, error) {
	var out model.Category
	err := s.db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		cur, err := scanCategory(tx.QueryRowContext(ctx, `SELECT `+categoryCols+` FROM categories WHERE id = ?`, id))
		if errors.Is(err, sql.ErrNoRows) {
			return ErrNotFound
		}
		if err != nil {
			return err
		}

		if in.Name != nil {
			cur.Name = *in.Name
		}
		if in.SNTemplate != nil {
			cur.SNTemplate = *in.SNTemplate
		}

		if in.ParentID != nil {
			var n int
			if err := tx.QueryRowContext(ctx,
				`SELECT count(*) FROM assets a JOIN categories c ON c.id = a.category_id
				 WHERE c.path LIKE ? || '%'`, cur.Path).Scan(&n); err != nil {
				return err
			}
			if n > 0 {
				return fmt.Errorf("%w: %d asset(s) under %s", ErrCategoryHasAssets, n, cur.Name)
			}
			parentPath := ""
			if *in.ParentID != nil {
				if err := tx.QueryRowContext(ctx, `SELECT path FROM categories WHERE id = ?`, **in.ParentID).
					Scan(&parentPath); err != nil {
					return err
				}
			}
			cur.ParentID = *in.ParentID
			cur.Path = BuildPath(parentPath, cur.ID)
		}

		cur.UpdatedAt = time.Now().UTC()
		_, err = tx.ExecContext(ctx,
			`UPDATE categories SET name = ?, sn_template = ?, parent_id = ?, path = ?, updated_at = ?
			 WHERE id = ?`,
			cur.Name, cur.SNTemplate, store.NullString(cur.ParentID), cur.Path,
			store.FormatTime(cur.UpdatedAt), id)
		out = cur
		return err
	})
	if err != nil {
		return out, err
	}
	return out, nil
}

// SNTemplates returns every category's raw sn_template, keyed by id, for
// ResolveSNTemplate.
func (s *Store) SNTemplates(ctx context.Context) (map[string]string, error) {
	rows, err := s.db.ReadDB().QueryContext(ctx, `SELECT id, coalesce(sn_template, '') FROM categories`)
	if err != nil {
		return nil, fmt.Errorf("load sn templates: %w", err)
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

// jsonOrEmpty is a small helper for optional JSON columns.
func jsonOrEmpty(v any) (string, error) {
	if v == nil {
		return "{}", nil
	}
	b, err := json.Marshal(v)
	if err != nil {
		return "", err
	}
	return string(b), nil
}
