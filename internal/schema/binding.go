package schema

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"slices"
	"strings"

	"github.com/klskk23/nexus-assets/internal/model"
)

// ErrKeyConflict reports a field key already bound elsewhere on the same chain.
var ErrKeyConflict = errors.New("field key already bound on this category chain")

// ErrDependenciesUnmet blocks binding an expression key whose inputs are not
// all present and required on the target category.
var ErrDependenciesUnmet = errors.New("expression key dependencies are unmet")

// ErrFieldDependedOn blocks unbinding a field that something bound here reads.
var ErrFieldDependedOn = errors.New("field is still read by something bound here")

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
		var path, key, ftype string
		if err := tx.QueryRowContext(ctx, `SELECT path FROM categories WHERE id = ?`, categoryID).Scan(&path); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return ErrNotFound
			}
			return err
		}
		if err := tx.QueryRowContext(ctx,
			`SELECT key, type FROM field_definitions WHERE id = ?`, fieldID).Scan(&key, &ftype); err != nil {
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
			return fmt.Errorf("%w：键 %q 已绑定在「%s」上，同一条链上不允许重复绑定", ErrKeyConflict, key, clash)
		}
		if !errors.Is(err, sql.ErrNoRows) {
			return err
		}

		if model.FieldType(ftype) == model.FieldComputed {
			if err := checkBindDeps(ctx, tx, path, key); err != nil {
				return err
			}
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
//
// Refused while an expression key bound here reads it, or while a category
// here nominates it as the display key. This is the mirror of the check that
// guards archiving: without it, unbinding "mac" from a category makes every
// asset in that category permanently unsaveable, with an error that points at
// the expression key rather than at the unbind that caused it.
func (s *Store) Unbind(ctx context.Context, categoryID, fieldID string) error {
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
		if err := checkUnbindSafe(ctx, tx, path, key, fieldID); err != nil {
			return err
		}
		_, err := tx.ExecContext(ctx,
			`DELETE FROM category_fields WHERE category_id = ? AND field_id = ?`, categoryID, fieldID)
		return err
	})
}

// chainBinding is one effective binding, flattened for the dependency checks.
type chainBinding struct {
	label    string
	ftype    model.FieldType
	required bool
}

// loadLibrary reads every live field definition, keyed by key, so the
// dependency walk can follow an expression key into the ones it reads.
func loadLibrary(ctx context.Context, tx *sql.Tx) (map[string]model.FieldDefinition, error) {
	rows, err := tx.QueryContext(ctx,
		`SELECT id, key, label, type, options FROM field_definitions WHERE archived_at IS NULL`)
	if err != nil {
		return nil, fmt.Errorf("load field library: %w", err)
	}
	defer rows.Close()
	out := map[string]model.FieldDefinition{}
	for rows.Next() {
		var f model.FieldDefinition
		var opts string
		if err := rows.Scan(&f.ID, &f.Key, &f.Label, &f.Type, &opts); err != nil {
			return nil, err
		}
		if err := decodeOptions(opts, &f.Options); err != nil {
			return nil, err
		}
		out[f.Key] = f
	}
	return out, rows.Err()
}

// loadChain reads the effective field set of one category: every binding on its
// ancestor chain, itself included.
func loadChain(ctx context.Context, tx *sql.Tx, path string) (map[string]chainBinding, error) {
	const q = `SELECT f.key, f.label, f.type, cf.required
	           FROM category_fields cf
	           JOIN categories c ON c.id = cf.category_id
	           JOIN field_definitions f ON f.id = cf.field_id
	           WHERE ? LIKE c.path || '%' AND f.archived_at IS NULL`
	rows, err := tx.QueryContext(ctx, q, path)
	if err != nil {
		return nil, fmt.Errorf("load chain bindings: %w", err)
	}
	defer rows.Close()
	out := map[string]chainBinding{}
	for rows.Next() {
		var key, ftype string
		var b chainBinding
		var required int
		if err := rows.Scan(&key, &b.label, &ftype, &required); err != nil {
			return nil, err
		}
		b.ftype, b.required = model.FieldType(ftype), required == 1
		out[key] = b
	}
	return out, rows.Err()
}

// checkBindDeps refuses an expression key whose inputs are not all bound here
// and marked required.
//
// Requiring the inputs is not pedantry. An expression key that fails to
// evaluate rolls the whole save back, and an optional input left blank fails to
// evaluate -- so any static key an expression reads is required in practice
// whether or not it says so. Left implicit, that surfaces later as "why can
// this device not be saved", pointing at the expression key instead of at the
// field that is actually empty.
func checkBindDeps(ctx context.Context, tx *sql.Tx, path, key string) error {
	lib, err := loadLibrary(ctx, tx)
	if err != nil {
		return err
	}
	deps, err := DependencyClosure(key, lib)
	if err != nil {
		return fmt.Errorf("%w: %s", ErrDependenciesUnmet, err)
	}
	chain, err := loadChain(ctx, tx, path)
	if err != nil {
		return err
	}

	var unknown, unbound, optional []string
	for _, d := range deps {
		def, inLibrary := lib[d]
		if !inLibrary {
			unknown = append(unknown, d)
			continue
		}
		bound, ok := chain[d]
		if !ok {
			unbound = append(unbound, fmt.Sprintf("「%s」(%s)", def.Label, d))
			continue
		}
		// Expression keys carry no required flag of their own; theirs was
		// enforced when they were bound.
		if def.Type != model.FieldComputed && !bound.required {
			optional = append(optional, fmt.Sprintf("「%s」(%s)", def.Label, d))
		}
	}

	var problems []string
	if len(unknown) > 0 {
		problems = append(problems, fmt.Sprintf("信息项库中不存在：%s", strings.Join(unknown, "、")))
	}
	if len(unbound) > 0 {
		problems = append(problems, fmt.Sprintf("尚未绑定到该类别：%s", strings.Join(unbound, "、")))
	}
	if len(optional) > 0 {
		problems = append(problems, fmt.Sprintf("需要先标为必填：%s", strings.Join(optional, "、")))
	}
	if len(problems) > 0 {
		return fmt.Errorf("%w: 表达式键 %s 依赖的%s", ErrDependenciesUnmet, key, strings.Join(problems, "；"))
	}
	return nil
}

// checkUnbindSafe refuses to remove a field something bound nearby still needs.
//
// "Nearby" is the ancestor chain plus the whole subtree, the same reach the
// key-collision check uses: those are exactly the categories whose effective
// field set contains this binding.
func checkUnbindSafe(ctx context.Context, tx *sql.Tx, path, key, fieldID string) error {
	lib, err := loadLibrary(ctx, tx)
	if err != nil {
		return err
	}

	const q = `SELECT DISTINCT f.key, f.label
	           FROM category_fields cf
	           JOIN categories c ON c.id = cf.category_id
	           JOIN field_definitions f ON f.id = cf.field_id
	           WHERE f.type = ? AND f.archived_at IS NULL AND cf.field_id != ?
	             AND (? LIKE c.path || '%' OR c.path LIKE ? || '%')`
	rows, err := tx.QueryContext(ctx, q, string(model.FieldComputed), fieldID, path, path)
	if err != nil {
		return fmt.Errorf("scan expression keys: %w", err)
	}
	defer rows.Close()
	type ref struct{ key, label string }
	var candidates []ref
	for rows.Next() {
		var r ref
		if err := rows.Scan(&r.key, &r.label); err != nil {
			return err
		}
		candidates = append(candidates, r)
	}
	if err := rows.Err(); err != nil {
		return err
	}

	var blockers []string
	for _, c := range candidates {
		deps, err := DependencyClosure(c.key, lib)
		if err != nil {
			return fmt.Errorf("%w: %s", ErrFieldDependedOn, err)
		}
		if slices.Contains(deps, key) {
			blockers = append(blockers, fmt.Sprintf("表达式键「%s」", c.label))
		}
	}

	// A category that names this field as its display key would be left
	// pointing at nothing.
	dispRows, err := tx.QueryContext(ctx,
		`SELECT name FROM categories
		 WHERE display_key = ? AND (? LIKE path || '%' OR path LIKE ? || '%')`, key, path, path)
	if err != nil {
		return fmt.Errorf("scan display keys: %w", err)
	}
	defer dispRows.Close()
	for dispRows.Next() {
		var name string
		if err := dispRows.Scan(&name); err != nil {
			return err
		}
		blockers = append(blockers, fmt.Sprintf("类别「%s」的显示编号", name))
	}
	if err := dispRows.Err(); err != nil {
		return err
	}

	if len(blockers) > 0 {
		return fmt.Errorf("%w：%s正在引用 %s，请先修改它们再解绑",
			ErrFieldDependedOn, strings.Join(blockers, "、"), key)
	}
	return nil
}
