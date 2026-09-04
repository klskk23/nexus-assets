package schema

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/klskk23/nexus-assets/internal/i18n"
	"github.com/klskk23/nexus-assets/internal/model"
)

// ErrBindingModeConflict blocks giving one field both kinds of binding.
//
// A field's bindings are all categories or all models, never a mix (015,
// decision 96). Mixing them collides three ways: a model already covered by a
// category binding gains nothing, the two bindings' required flags can disagree
// about the same asset, and the uniqueness scope stops having a single answer.
var ErrBindingModeConflict = errors.New("a field binds to categories or to models, not both")

// ErrDisplayKeyNotCategoryField blocks numbering a category by a model field.
//
// The display key has to name every asset in the category. A model-bound field
// only covers some of them, so the rest would fall back to the UUID prefix
// forever -- not "not filled in yet" but "never will be".
var ErrDisplayKeyNotCategoryField = errors.New("the numbering field must be bound to categories")

// ModelBinding is one model_fields row joined to its definition.
type ModelBinding struct {
	ModelID  string
	Field    model.FieldDefinition
	Required bool
	Sort     int
}

// ModelBindingsByModel loads every model binding, grouped by model id.
//
// Loaded whole, the way BindingsByCategory is: models number in the hundreds,
// and one query beats a join per request. Nothing here may become a per-row
// lookup -- that is the N+1 the constitution forbids.
func (s *Store) ModelBindingsByModel(ctx context.Context) (map[string][]ModelBinding, error) {
	q := `SELECT mf.model_id, mf.required, mf.sort,
	             f.id, f.key, f.label, f.type, f.options, f.is_unique, f.created_at, f.updated_at
	      FROM model_fields mf JOIN field_definitions f ON f.id = mf.field_id`
	rows, err := s.db.ReadDB().QueryContext(ctx, q)
	if err != nil {
		return nil, fmt.Errorf("load model bindings: %w", err)
	}
	defer rows.Close()

	out := map[string][]ModelBinding{}
	for rows.Next() {
		var b ModelBinding
		var required, isUnique int
		var opts, created, updated string
		if err := rows.Scan(&b.ModelID, &required, &b.Sort,
			&b.Field.ID, &b.Field.Key, &b.Field.Label, &b.Field.Type, &opts, &isUnique,
			&created, &updated); err != nil {
			return nil, err
		}
		b.Required = required == 1
		b.Field.IsUnique = isUnique == 1
		if err := decodeOptions(opts, &b.Field.Options); err != nil {
			return nil, err
		}
		if err := fillTimes(&b.Field, created, updated); err != nil {
			return nil, err
		}
		out[b.ModelID] = append(out[b.ModelID], b)
	}
	return out, rows.Err()
}

// ModelsOfField lists the models a field is bound to, empty for a category
// field. It is what tells the interface when to offer the field at all.
func (s *Store) ModelsOfField(ctx context.Context) (map[string][]string, error) {
	rows, err := s.db.ReadDB().QueryContext(ctx,
		`SELECT field_id, model_id FROM model_fields ORDER BY field_id, model_id`)
	if err != nil {
		return nil, fmt.Errorf("load field models: %w", err)
	}
	defer rows.Close()

	out := map[string][]string{}
	for rows.Next() {
		var fieldID, modelID string
		if err := rows.Scan(&fieldID, &modelID); err != nil {
			return nil, err
		}
		out[fieldID] = append(out[fieldID], modelID)
	}
	return out, rows.Err()
}

// CategoriesOfModel maps each model to the categories it is registered under.
func (s *Store) CategoriesOfModel(ctx context.Context) (map[string][]string, error) {
	rows, err := s.db.ReadDB().QueryContext(ctx,
		`SELECT model_id, category_id FROM product_model_categories`)
	if err != nil {
		return nil, fmt.Errorf("load model categories: %w", err)
	}
	defer rows.Close()

	out := map[string][]string{}
	for rows.Next() {
		var modelID, categoryID string
		if err := rows.Scan(&modelID, &categoryID); err != nil {
			return nil, err
		}
		out[modelID] = append(out[modelID], categoryID)
	}
	return out, rows.Err()
}

// BindModel attaches a field to a model.
//
// Refused when the field already has a category binding: the two modes are
// exclusive (decision 96). The key check is the same one category binding runs,
// aimed at every category this model is registered under -- assets.attrs is a
// flat map, and two field definitions fighting over one key is wrong in the
// data whichever way the binding arrived.
func (s *Store) BindModel(ctx context.Context, modelID, fieldID string, required bool, sort int) error {
	return s.db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		return bindModelTx(ctx, tx, modelID, fieldID, required, sort)
	})
}

func bindModelTx(ctx context.Context, tx *sql.Tx, modelID, fieldID string, required bool, sort int) error {
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
		`SELECT count(*) FROM product_models WHERE id = ?`, modelID).Scan(&exists); err != nil {
		return err
	}
	if exists == 0 {
		return ErrNotFound
	}

	// The other table decides whether this is allowed at all.
	var boundToCategory int
	if err := tx.QueryRowContext(ctx,
		`SELECT count(*) FROM category_fields WHERE field_id = ?`, fieldID).Scan(&boundToCategory); err != nil {
		return err
	}
	if boundToCategory > 0 {
		return i18n.Wrap(ErrBindingModeConflict, i18n.KeyBindingModeConflict)
	}

	if err := modelKeyFree(ctx, tx, modelID, fieldID, key); err != nil {
		return err
	}

	_, err := tx.ExecContext(ctx,
		`INSERT INTO model_fields (model_id, field_id, required, sort)
		 VALUES (?, ?, ?, ?)
		 ON CONFLICT(model_id, field_id) DO UPDATE SET required = excluded.required, sort = excluded.sort`,
		modelID, fieldID, boolInt(required), sort)
	return err
}

// modelKeyFree refuses a key already reachable by the assets this binding
// would cover: the categories this model sits in, their ancestors and their
// subtrees, plus anything else bound to the model itself.
func modelKeyFree(ctx context.Context, tx *sql.Tx, modelID, fieldID, key string) error {
	// Another field already on this model. The message names where the key is
	// taken, which is what tells somebody what to rename.
	var owner string
	err := tx.QueryRowContext(ctx, `
		SELECT m.name
		FROM model_fields mf
		JOIN field_definitions f ON f.id = mf.field_id
		JOIN product_models m ON m.id = mf.model_id
		WHERE mf.model_id = ? AND mf.field_id <> ? AND f.key = ?
		LIMIT 1`, modelID, fieldID, key).Scan(&owner)
	if err == nil {
		return i18n.Wrap(ErrKeyConflict, i18n.KeyBindDuplicate, key, owner)
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return err
	}

	// Anything bound on a category this model belongs to -- ancestors and
	// descendants both, the same reach Bind checks for a category binding.
	err = tx.QueryRowContext(ctx, `
		SELECT c.name
		FROM category_fields cf
		JOIN field_definitions f ON f.id = cf.field_id
		JOIN categories c ON c.id = cf.category_id
		WHERE f.key = ? AND cf.field_id <> ? AND EXISTS (
			SELECT 1 FROM product_model_categories pmc
			JOIN categories mc ON mc.id = pmc.category_id
			WHERE pmc.model_id = ?
			  AND (mc.path LIKE c.path || '%' OR c.path LIKE mc.path || '%')
		)
		LIMIT 1`, key, fieldID, modelID).Scan(&owner)
	if err == nil {
		return i18n.Wrap(ErrKeyConflict, i18n.KeyBindDuplicate, key, owner)
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return err
	}
	return nil
}

// UnbindModel detaches a field from a model. Values already stored under it
// become archived attributes the next time each asset is written, the same as
// unbinding from a category.
func (s *Store) UnbindModel(ctx context.Context, modelID, fieldID string) error {
	return s.db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		res, err := tx.ExecContext(ctx,
			`DELETE FROM model_fields WHERE model_id = ? AND field_id = ?`, modelID, fieldID)
		if err != nil {
			return err
		}
		if n, _ := res.RowsAffected(); n == 0 {
			return ErrNotFound
		}
		return nil
	})
}

// ModelRequiredImpact counts the devices a required model binding would land
// on: this model's existing assets, and only those.
//
// The same promise the category-side count makes (decision 70): the rule
// applies from the next edit onwards, and the number says how many edits that
// eventually is.
func (s *Store) ModelRequiredImpact(ctx context.Context, modelID string) (int, error) {
	var n int
	err := s.db.ReadDB().QueryRowContext(ctx,
		`SELECT count(*) FROM assets WHERE model_id = ? AND deleted_at IS NULL`, modelID).Scan(&n)
	if err != nil {
		return 0, fmt.Errorf("count assets of model: %w", err)
	}
	return n, nil
}
