package schema

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"slices"

	"github.com/klskk23/nexus-assets/internal/i18n"
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
	q := `SELECT cf.category_id, cf.sort, ` +
		`f.id, f.key, f.label, f.type, f.options, f.is_unique, f.searchable, f.required,
		 f.created_at, f.updated_at
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
		var created, updated string
		var isUnique, searchable int
		if err := rows.Scan(&b.CategoryID, &b.Sort,
			&b.Field.ID, &b.Field.Key, &b.Field.Label, &b.Field.Type, &opts, &isUnique, &searchable, &required,
			&created, &updated); err != nil {
			return nil, err
		}
		b.Field.IsUnique = isUnique == 1
		b.Field.Searchable = searchable == 1
		b.Field.Required = required == 1
		if err := decodeOptions(opts, &b.Field.Options); err != nil {
			return nil, err
		}
		if err := fillTimes(&b.Field, created, updated); err != nil {
			return nil, err
		}
		out[b.CategoryID] = append(out[b.CategoryID], b)
	}
	return out, rows.Err()
}

// EffectiveFields answers only the category's explicitly selected vocabulary.
func (s *Store) EffectiveFields(ctx context.Context, categoryID string) ([]model.BoundField, error) {
	snapshot, err := s.Snapshot(ctx)
	if err != nil {
		return nil, err
	}
	return snapshot.EffectiveFields(categoryID)
}

// FieldsOfPath resolves a category path from one consistent schema snapshot.
func (s *Store) FieldsOfPath(ctx context.Context, path string) ([]model.BoundField, error) {
	snapshot, err := s.Snapshot(ctx)
	if err != nil {
		return nil, err
	}
	return snapshot.FieldsOfPath(path)
}

// EveryPossibleField adds all device fields for mixed-model file columns.
// Each row still has to check field identity against its actual device schema.
func (s *Store) EveryPossibleField(ctx context.Context, categoryID string) ([]model.BoundField, error) {
	snapshot, err := s.Snapshot(ctx)
	if err != nil {
		return nil, err
	}
	return snapshot.EveryPossibleField(categoryID)
}

// EffectiveFieldsForAsset resolves the category and actual model together.
func (s *Store) EffectiveFieldsForAsset(ctx context.Context, categoryID string, modelID *string) ([]model.BoundField, error) {
	snapshot, err := s.Snapshot(ctx)
	if err != nil {
		return nil, err
	}
	cat, ok := snapshot.categories[categoryID]
	if !ok {
		return nil, ErrNotFound
	}
	id := ""
	if modelID != nil {
		id = *modelID
	}
	return snapshot.FieldsForAsset(cat.Path, id)
}

// FieldsForAsset combines selected category fields with the actual model and
// vendor. No category-model association is consulted.
func (s *Store) FieldsForAsset(ctx context.Context, path, modelID string) ([]model.BoundField, error) {
	snapshot, err := s.Snapshot(ctx)
	if err != nil {
		return nil, err
	}
	return snapshot.FieldsForAsset(path, modelID)
}

// ForModel narrows a category's field set to the one device in front of you.
//
// The category's set is its whole vocabulary, model fields included; which of
// those apply to a given asset depends on its model. A field bound to models
// applies only when the asset's model is one of them, so an asset with no model
// sees none of them, and changing an asset's model changes which it sees --
// values left behind become archived attributes on the next read, the same way
// unbinding a field leaves them (015, decision 98).
func ForModel(fields []model.BoundField, modelID *string) []model.BoundField {
	out := make([]model.BoundField, 0, len(fields))
	for _, f := range fields {
		if AppliesTo(f, modelID) {
			out = append(out, f)
		}
	}
	return out
}

// AppliesTo answers ForModel's question for one field.
//
// Wherever a category's whole field set meets a single device, this is the
// check. It matters most where the column set is the category's but the rows
// are devices -- the export and the row view (decision 102): the column stands
// for every row, and a row whose model does not have the field leaves it empty
// rather than showing a value that is no longer live.
func AppliesTo(f model.BoundField, modelID *string) bool {
	if len(f.ModelIDs) == 0 {
		return true
	}
	return modelID != nil && slices.Contains(f.ModelIDs, *modelID)
}

// Bind attaches a field to a category.
//
// The ancestor chain and the whole subtree are both checked, because a key
// bound on a parent and on a child would make the union ambiguous and there is
// no override rule to fall back on.
func (s *Store) Bind(ctx context.Context, categoryID, fieldID string, sort int) error {
	return s.db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		before, err := LoadSchemaSnapshot(ctx, tx)
		if err != nil {
			return err
		}
		if err := bindTx(ctx, tx, categoryID, fieldID, sort); err != nil {
			return err
		}
		return s.finishCategoryBindings(ctx, tx, before, []string{categoryID})
	})
}

// bindTx is Bind inside a transaction the caller owns.
//
// Creating a field with categories already chosen has to be one transaction:
// a field that exists but is bound nowhere, because the second half failed, is
// exactly the half-finished state the form was meant to save someone from.
func bindTx(ctx context.Context, tx *sql.Tx, categoryID, fieldID string, sort int) error {
	var path, key string
	if err := tx.QueryRowContext(ctx, `SELECT path FROM categories WHERE id = ?`, categoryID).Scan(&path); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ErrNotFound
		}
		return err
	}
	if err := tx.QueryRowContext(ctx,
		`SELECT key FROM field_definitions WHERE id = ?`, fieldID).Scan(&key); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ErrNotFound
		}
		return err
	}

	// The other half of the exclusion. A field already hung on the device side
	// cannot also hang on a category (015 decision 96, widened by 016 decision
	// 110): a category binding already covers every device in the category, so
	// the device-side one adds nothing, and the uniqueness scope would stop
	// having one answer -- a category subtree and a set of models are not the
	// same shape of thing.
	//
	// Models and vendors are both the device side and are asked about
	// together. They do not exclude each other: both answer "which device",
	// and together they are still one set (decision 110).
	var boundToDevice int
	if err := tx.QueryRowContext(ctx,
		`SELECT (SELECT count(*) FROM model_fields WHERE field_id = ?)
		      + (SELECT count(*) FROM vendor_fields WHERE field_id = ?)`,
		fieldID, fieldID).Scan(&boundToDevice); err != nil {
		return err
	}
	if boundToDevice > 0 {
		return i18n.Wrap(ErrBindingModeConflict, i18n.KeyBindingModeConflict)
	}

	// Anything on the ancestor chain, or anywhere in the subtree below.
	//
	// Only this exact pair is exempt, and that is the whole of it: re-binding
	// the same field to the same category is how sort is changed (required
	// moved onto the field in 018). The check used to exempt the whole category, which let a second
	// field carrying the same key be bound right beside the first -- the
	// effective field set then had two answers for one key, which is the
	// ambiguity this rule exists to prevent. Binding the same field on a
	// parent as well as a child stays refused: a child may append, not
	// re-declare.
	var clash string
	q := `SELECT c.name FROM category_fields cf
	      JOIN categories c ON c.id = cf.category_id
	      JOIN field_definitions f ON f.id = cf.field_id
	      WHERE f.key = ? AND NOT (cf.category_id = ? AND cf.field_id = ?)
	        AND (? LIKE c.path || '%' OR c.path LIKE ? || '%')
	      LIMIT 1`
	err := tx.QueryRowContext(ctx, q, key, categoryID, fieldID, path, path).Scan(&clash)
	if err == nil {
		return i18n.Wrap(ErrKeyConflict, i18n.KeyBindDuplicate, key, clash)
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return err
	}
	// And the other two tables. Asking only this one was the gap: the resolver
	// unions all three, so a key claimed on the device side could meet this one
	// on a single asset.
	if err := assertKeyFreeForCategory(ctx, tx, key, fieldID); err != nil {
		return err
	}

	_, err = tx.ExecContext(ctx,
		// required is not written: it lives on the field now (018), and the
		// column is left holding whatever it held before that migration.
		`INSERT INTO category_fields (category_id, field_id, sort)
		 VALUES (?, ?, ?)
		 ON CONFLICT(category_id, field_id) DO UPDATE SET sort = excluded.sort`,
		categoryID, fieldID, sort)
	return err
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
	return s.UnbindConfirmed(ctx, categoryID, fieldID, "")
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
		`SELECT id, key, label, type, options FROM field_definitions`)
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
	const q = `SELECT f.key, f.label, f.type, f.required
	           FROM category_fields cf
	           JOIN categories c ON c.id = cf.category_id
	           JOIN field_definitions f ON f.id = cf.field_id
	           WHERE ? LIKE c.path || '%'`
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

	var unknown, unbound, optional []any
	for _, d := range deps {
		def, inLibrary := lib[d]
		if !inLibrary {
			unknown = append(unknown, d)
			continue
		}
		bound, ok := chain[d]
		if !ok {
			unbound = append(unbound, i18n.M(i18n.KeyLabelWithKey, def.Label, d))
			continue
		}
		// Expression keys carry no required flag of their own; theirs was
		// enforced when they were bound.
		if def.Type != model.FieldComputed && !bound.required {
			optional = append(optional, i18n.M(i18n.KeyLabelWithKey, def.Label, d))
		}
	}

	// Each problem is a nested message rather than a rendered string: the list
	// is assembled here and resolved to a language only when it is shown.
	var problems []any
	for _, p := range []struct {
		key   string
		items []any
	}{
		{i18n.KeyDepMissing, unknown},
		{i18n.KeyDepUnbound, unbound},
		{i18n.KeyDepNotRequired, optional},
	} {
		if len(p.items) > 0 {
			problems = append(problems, i18n.M(p.key, i18n.Join(i18n.KeyListSeparator, p.items...)))
		}
	}
	if len(problems) > 0 {
		return i18n.Wrap(ErrDependenciesUnmet, i18n.KeyDepUnmet,
			key, i18n.Join(i18n.KeyProblemSeparator, problems...))
	}
	return nil
}

// assertKeyFreeForCategory refuses a key that a device-side binding already
// claims.
//
// Two bindings clash when some asset can be subject to both. Since 026 a model
// may appear under any category, so a category binding and any model or vendor
// binding can always meet -- which makes this check as simple as "is the key
// bound on the device side at all", and as necessary as it now is.
//
// Bind() has always asked category_fields and only category_fields, while
// EffectiveFields unions all three. That gap let two different fields carrying
// one key both reach a single asset, whose attrs then had one slot with two
// definitions -- the ambiguity the neighbouring check says it exists to
// prevent. docs/rules/schema.md records the same trap for boundPaths.
func assertKeyFreeForCategory(ctx context.Context, tx *sql.Tx, key, fieldID string) error {
	var clash string
	err := tx.QueryRowContext(ctx, `
		SELECT m.name FROM model_fields mf
		  JOIN field_definitions f ON f.id = mf.field_id
		  JOIN product_models m ON m.id = mf.model_id
		 WHERE f.key = ? AND f.id <> ?
		 UNION ALL
		SELECT v.name FROM vendor_fields vf
		  JOIN field_definitions f ON f.id = vf.field_id
		  JOIN vendors v ON v.id = vf.vendor_id
		 WHERE f.key = ? AND f.id <> ?
		 LIMIT 1`, key, fieldID, key, fieldID).Scan(&clash)
	if err == nil {
		return i18n.Wrap(ErrKeyConflict, i18n.KeyBindDuplicate, key, clash)
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return err
	}
	return nil
}

// assertKeyFreeForDevice is the same question asked from the device side.
//
// Categories always clash, for the reason above. Two different models never
// do -- an asset has one model, so two models can each carry their own field
// under one key without ever meeting. A model and a vendor clash only when the
// model is that vendor's, and two vendor bindings only when it is the same
// vendor. Collapsing all of that into "one key, one binding, anywhere" would
// be simpler and would forbid something legitimate.
func assertKeyFreeForDevice(
	ctx context.Context, tx *sql.Tx, key, fieldID, modelID, vendorID string,
) error {
	var clash string
	err := tx.QueryRowContext(ctx, `
		SELECT c.name FROM category_fields cf
		  JOIN field_definitions f ON f.id = cf.field_id
		  JOIN categories c ON c.id = cf.category_id
		 WHERE f.key = ? AND f.id <> ?
		 LIMIT 1`, key, fieldID).Scan(&clash)
	if err == nil {
		return i18n.Wrap(ErrKeyConflict, i18n.KeyBindDuplicate, key, clash)
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return err
	}

	// The same model, or this model's vendor.
	if modelID != "" {
		err = tx.QueryRowContext(ctx, `
			SELECT m.name FROM model_fields mf
			  JOIN field_definitions f ON f.id = mf.field_id
			  JOIN product_models m ON m.id = mf.model_id
			 WHERE f.key = ? AND f.id <> ? AND mf.model_id = ?
			 UNION ALL
			SELECT v.name FROM vendor_fields vf
			  JOIN field_definitions f ON f.id = vf.field_id
			  JOIN vendors v ON v.id = vf.vendor_id
			  JOIN product_models m ON m.vendor_id = v.id
			 WHERE f.key = ? AND f.id <> ? AND m.id = ?
			 LIMIT 1`, key, fieldID, modelID, key, fieldID, modelID).Scan(&clash)
	} else {
		// Binding to a vendor: the same vendor, or any model under it.
		err = tx.QueryRowContext(ctx, `
			SELECT v.name FROM vendor_fields vf
			  JOIN field_definitions f ON f.id = vf.field_id
			  JOIN vendors v ON v.id = vf.vendor_id
			 WHERE f.key = ? AND f.id <> ? AND vf.vendor_id = ?
			 UNION ALL
			SELECT m.name FROM model_fields mf
			  JOIN field_definitions f ON f.id = mf.field_id
			  JOIN product_models m ON m.id = mf.model_id
			 WHERE f.key = ? AND f.id <> ? AND m.vendor_id = ?
			 LIMIT 1`, key, fieldID, vendorID, key, fieldID, vendorID).Scan(&clash)
	}
	if err == nil {
		return i18n.Wrap(ErrKeyConflict, i18n.KeyBindDuplicate, key, clash)
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return err
	}
	return nil
}
