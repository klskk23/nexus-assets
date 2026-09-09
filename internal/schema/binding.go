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

// EffectiveFields resolves the field set a category asks for.
//
// Two sources, unioned: the bindings along the category's own ancestor chain,
// and the bindings of every model registered anywhere on that chain (015,
// decision 101). This function is the single answer to "which fields does this
// category have" -- the entry form, asset validation, the import template, the
// export and the column picker all read it -- so unioning here is what makes
// those five agree without each being taught about models.
//
// The result is the category's whole vocabulary, not one asset's. A model
// field appears here even for a caller looking at an asset of a different
// model; deciding whether it applies to one device is the caller's job, and
// three of the five callers deliberately want the full set (decisions 102/103).
func (s *Store) EffectiveFields(ctx context.Context, categoryID string) ([]model.BoundField, error) {
	cat, err := s.GetCategory(ctx, categoryID)
	if err != nil {
		return nil, err
	}
	return s.FieldsOfPath(ctx, cat.Path)
}

// FieldsOfPath is EffectiveFields for a caller that already holds the category.
//
// The save pipeline is that caller: it loads the category for its code, name
// and display key anyway, and reading it twice per save to get the same row
// back would be a query bought for nothing.
func (s *Store) FieldsOfPath(ctx context.Context, path string) ([]model.BoundField, error) {
	bindings, err := s.BindingsByCategory(ctx)
	if err != nil {
		return nil, err
	}
	fields, err := Resolve(path, bindings)
	if err != nil {
		return nil, err
	}

	return fields, nil
}

// EveryPossibleField is a category's chain plus every device-side field there
// is, whatever model it belongs to.
//
// For the CSV columns, which have to be decided before anyone knows which
// models the rows will name. A file is one set of columns and a batch is
// usually mixed, so the honest column set is "everything that could apply" and
// the per-row check is what refuses a value that does not belong to that row's
// model -- a rule the importer already enforces.
//
// Before 026 this was simply EffectiveFields: a category carried the fields of
// every model attached to it. Decoupling took that away, and the columns are
// the one caller that genuinely wanted the wider set.
func (s *Store) EveryPossibleField(ctx context.Context, categoryID string) ([]model.BoundField, error) {
	cat, err := s.GetCategory(ctx, categoryID)
	if err != nil {
		return nil, err
	}
	fields, err := s.FieldsOfPath(ctx, cat.Path)
	if err != nil {
		return nil, err
	}
	device, vendorsOfField, err := s.deviceBindings(ctx)
	if err != nil {
		return nil, err
	}
	all := make(map[string]bool, len(device))
	for id := range device {
		all[id] = true
	}
	return append(fields, resolveModelFields(all, device, vendorsOfField)...), nil
}

// EffectiveFieldsForAsset is FieldsForAsset for a caller holding a category id
// rather than a path.
func (s *Store) EffectiveFieldsForAsset(
	ctx context.Context, categoryID string, modelID *string,
) ([]model.BoundField, error) {
	cat, err := s.GetCategory(ctx, categoryID)
	if err != nil {
		return nil, err
	}
	id := ""
	if modelID != nil {
		id = *modelID
	}
	return s.FieldsForAsset(ctx, cat.Path, id)
}

// FieldsForAsset is what one device can record: its category chain, its own
// model, and that model's vendor.
//
// Not "the category's vocabulary narrowed to a model", which is what this used
// to be. A model belonged to categories then, so a category's field set had to
// contain every model that might appear under it -- which meant attaching a
// model to a category changed that category's fields, and, worse, a device
// whose model was *not* attached silently lost that model's fields with
// nothing to say so (026, decisions 182-184).
//
// Asking per device instead makes both go away: the model is asked directly,
// so no association is consulted and none can be missing.
func (s *Store) FieldsForAsset(ctx context.Context, path, modelID string) ([]model.BoundField, error) {
	fields, err := s.FieldsOfPath(ctx, path)
	if err != nil {
		return nil, err
	}
	if modelID == "" {
		return fields, nil
	}
	device, vendorsOfField, err := s.deviceBindings(ctx)
	if err != nil {
		return nil, err
	}
	if len(device) == 0 {
		return fields, nil
	}
	return append(fields, resolveModelFields(
		map[string]bool{modelID: true}, device, vendorsOfField)...), nil
}

// deviceBindings is the device side of the vocabulary, keyed by model.
//
// A model's own bindings unioned with the ones it inherits from its vendor. The
// union happens here so that everything downstream -- the resolver, the entry
// form, the export, ForModel -- keeps asking one question about one map, and
// never has to know which of the two ways a field arrived (016, decision 108).
//
// Four queries, whatever the number of models: bindings, vendor bindings and
// the vendor's models are each loaded whole, the way category bindings are.
func (s *Store) deviceBindings(ctx context.Context) (map[string][]ModelBinding, map[string][]string, error) {
	own, err := s.ModelBindingsByModel(ctx)
	if err != nil {
		return nil, nil, err
	}
	byVendor, err := s.VendorBindingsByVendor(ctx)
	if err != nil {
		return nil, nil, err
	}
	if len(byVendor) == 0 {
		return own, nil, nil
	}
	modelsOfVendor, err := s.ModelsOfVendor(ctx)
	if err != nil {
		return nil, nil, err
	}
	inherited, vendorsOfField := resolveVendorFields(byVendor, modelsOfVendor)
	return mergeDeviceBindings(own, inherited), vendorsOfField, nil
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
		return bindTx(ctx, tx, categoryID, fieldID, sort)
	})
}

// bindTx is Bind inside a transaction the caller owns.
//
// Creating a field with categories already chosen has to be one transaction:
// a field that exists but is bound nowhere, because the second half failed, is
// exactly the half-finished state the form was meant to save someone from.
func bindTx(ctx context.Context, tx *sql.Tx, categoryID, fieldID string, sort int) error {
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

	if model.FieldType(ftype) == model.FieldComputed {
		if err := checkBindDeps(ctx, tx, path, key); err != nil {
			return err
		}
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
	           WHERE f.type = ? AND cf.field_id != ?
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

	var blockers []any
	for _, c := range candidates {
		deps, err := DependencyClosure(c.key, lib)
		if err != nil {
			return fmt.Errorf("%w: %s", ErrFieldDependedOn, err)
		}
		if slices.Contains(deps, key) {
			blockers = append(blockers, i18n.M(i18n.KeyRefComputedKey, c.label))
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
		blockers = append(blockers, i18n.M(i18n.KeyRefDisplayKey, name))
	}
	if err := dispRows.Err(); err != nil {
		return err
	}

	if len(blockers) > 0 {
		return i18n.Wrap(ErrFieldDependedOn, i18n.KeyUnbindBlocked,
			i18n.Join(i18n.KeyListSeparator, blockers...), key)
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
