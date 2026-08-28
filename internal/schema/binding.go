package schema

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/klskk23/nexus-assets/internal/model"
)

// ErrKeyConflict reports a field key already bound elsewhere on the same chain.
var ErrKeyConflict = errors.New("field key already bound on this category chain")

// BindingsByCategory loads every binding, grouped by category id, ready for
// Resolve. Categories number in the hundreds, so loading the lot is cheaper
// than a per-request join.
func (s *Store) BindingsByCategory(ctx context.Context) (map[string][]Binding, error) {
	q := `SELECT cf.category_id, cf.required, cf.sort, ` +
		`f.id, f.key, f.label, f.type, f.options, f.is_unique, f.archived_at, f.created_at, f.updated_at
		 FROM category_fields cf JOIN field_definitions f ON f.id = cf.field_id`
	rows, err := s.db.ReadDB().QueryContext(ctx, q)
	if err != nil {
		return nil, fmt.Errorf("load bindings: %w", err)
	}
	defer rows.Close()

	out := map[string][]Binding{}
	for rows.Next() {
		var b Binding
		var required int
		var opts string
		var archived sql.NullString
		var created, updated string
		var isUnique int
		if err := rows.Scan(&b.CategoryID, &required, &b.Sort,
			&b.Field.ID, &b.Field.Key, &b.Field.Label, &b.Field.Type, &opts, &isUnique,
			&archived, &created, &updated); err != nil {
			return nil, err
		}
		b.Required = required == 1
		b.Field.IsUnique = isUnique == 1
		if err := decodeOptions(opts, &b.Field.Options); err != nil {
			return nil, err
		}
		if err := fillTimes(&b.Field, archived, created, updated); err != nil {
			return nil, err
		}
		out[b.CategoryID] = append(out[b.CategoryID], b)
	}
	return out, rows.Err()
}

// EffectiveFields resolves the field set a category asks for.
func (s *Store) EffectiveFields(ctx context.Context, categoryID string) ([]model.BoundField, error) {
	cat, err := s.GetCategory(ctx, categoryID)
	if err != nil {
		return nil, err
	}
	bindings, err := s.BindingsByCategory(ctx)
	if err != nil {
		return nil, err
	}
	return Resolve(cat.Path, bindings)
}

// Bind attaches a field to a category.
//
// The ancestor chain and the whole subtree are both checked, because a key
// bound on a parent and on a child would make the union ambiguous and there is
// no override rule to fall back on.
func (s *Store) Bind(ctx context.Context, categoryID, fieldID string, required bool, sort int) error {
	return s.db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		var path, key string
		if err := tx.QueryRowContext(ctx, `SELECT path FROM categories WHERE id = ?`, categoryID).Scan(&path); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return ErrNotFound
			}
			return err
		}
		if err := tx.QueryRowContext(ctx, `SELECT key FROM field_definitions WHERE id = ?`, fieldID).Scan(&key); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return ErrNotFound
			}
			return err
		}

		// Anything on the ancestor chain, or anywhere in the subtree below.
		var clash string
		q := `SELECT c.name FROM category_fields cf
		      JOIN categories c ON c.id = cf.category_id
		      JOIN field_definitions f ON f.id = cf.field_id
		      WHERE f.key = ? AND cf.category_id != ?
		        AND (? LIKE c.path || '%' OR c.path LIKE ? || '%')
		      LIMIT 1`
		err := tx.QueryRowContext(ctx, q, key, categoryID, path, path).Scan(&clash)
		if err == nil {
			return fmt.Errorf("%w: %q is already bound on %s", ErrKeyConflict, key, clash)
		}
		if !errors.Is(err, sql.ErrNoRows) {
			return err
		}

		_, err = tx.ExecContext(ctx,
			`INSERT INTO category_fields (category_id, field_id, required, sort)
			 VALUES (?, ?, ?, ?)
			 ON CONFLICT(category_id, field_id) DO UPDATE SET required = excluded.required, sort = excluded.sort`,
			categoryID, fieldID, boolInt(required), sort)
		return err
	})
}

// Unbind detaches a field from a category. Stored values become orphan keys:
// kept, shown read-only, never validated.
func (s *Store) Unbind(ctx context.Context, categoryID, fieldID string) error {
	return s.db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx,
			`DELETE FROM category_fields WHERE category_id = ? AND field_id = ?`, categoryID, fieldID)
		return err
	})
}
