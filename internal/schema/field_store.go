package schema

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/klskk23/nexus-assets/internal/i18n"
	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/store"
)

const fieldCols = `id, key, label, type, options, is_unique, created_at, updated_at`

func scanField(row interface{ Scan(...any) error }) (model.FieldDefinition, error) {
	var f model.FieldDefinition
	var opts string
	var created, updated string
	var isUnique int
	if err := row.Scan(&f.ID, &f.Key, &f.Label, &f.Type, &opts, &isUnique, &created, &updated); err != nil {
		return f, err
	}
	f.IsUnique = isUnique == 1
	if err := json.Unmarshal([]byte(opts), &f.Options); err != nil {
		return f, fmt.Errorf("decode options for field %q: %w", f.Key, err)
	}
	var err error
	if f.CreatedAt, err = store.ParseTime(created); err != nil {
		return f, err
	}
	if f.UpdatedAt, err = store.ParseTime(updated); err != nil {
		return f, err
	}
	return f, nil
}

// ListFields returns the global field library.
func (s *Store) ListFields(ctx context.Context) ([]model.FieldDefinition, error) {
	rows, err := s.db.ReadDB().QueryContext(ctx, `SELECT `+fieldCols+` FROM field_definitions ORDER BY key`)
	if err != nil {
		return nil, fmt.Errorf("list fields: %w", err)
	}
	defer rows.Close()
	var out []model.FieldDefinition
	for rows.Next() {
		f, err := scanField(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, f)
	}
	return out, rows.Err()
}

// GetField loads one field definition.
func (s *Store) GetField(ctx context.Context, id string) (model.FieldDefinition, error) {
	f, err := scanField(s.db.ReadDB().QueryRowContext(ctx, `SELECT `+fieldCols+` FROM field_definitions WHERE id = ?`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return f, ErrNotFound
	}
	return f, err
}

// CreateFieldInput describes a new information item.
type CreateFieldInput struct {
	Key      string
	Label    string
	Type     model.FieldType
	Options  model.FieldOptions
	IsUnique bool
}

// CreateField registers a field in the global library.
//
// The library is global because uniqueness matches on the key across the whole
// system and a child category may not override an inherited definition. Two
// fields sharing a key must therefore be the same thing, and the only way to
// guarantee that structurally is to have exactly one definition per key.
func (s *Store) CreateField(ctx context.Context, in CreateFieldInput) (model.FieldDefinition, error) {
	if !in.Type.Valid() {
		return model.FieldDefinition{}, i18n.M(i18n.KeyFieldTypeUnknown, string(in.Type))
	}
	if err := ValidateOptions(in.Type, in.Options); err != nil {
		return model.FieldDefinition{}, err
	}
	opts, err := json.Marshal(in.Options)
	if err != nil {
		return model.FieldDefinition{}, err
	}
	now := time.Now().UTC()
	f := model.FieldDefinition{
		ID: store.NewID(), Key: in.Key, Label: in.Label, Type: in.Type,
		Options: in.Options, IsUnique: in.IsUnique, CreatedAt: now, UpdatedAt: now,
	}
	err = s.db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx,
			`INSERT INTO field_definitions (id, key, label, type, options, is_unique, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			f.ID, f.Key, f.Label, string(f.Type), string(opts), boolInt(f.IsUnique),
			store.FormatTime(now), store.FormatTime(now))
		return err
	})
	if err != nil {
		return f, fmt.Errorf("create field: %w", err)
	}
	return f, nil
}

// UpdateFieldInput carries the mutable parts of a field definition.
type UpdateFieldInput struct {
	Label   *string
	Options *model.FieldOptions
}

// UpdateField changes or archives a field. Archiving is guarded elsewhere by
// the reference check; a field a template reads may not be taken away.
func (s *Store) UpdateField(ctx context.Context, id string, in UpdateFieldInput) (model.FieldDefinition, error) {
	var out model.FieldDefinition
	err := s.db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		cur, err := scanField(tx.QueryRowContext(ctx, `SELECT `+fieldCols+` FROM field_definitions WHERE id = ?`, id))
		if errors.Is(err, sql.ErrNoRows) {
			return ErrNotFound
		}
		if err != nil {
			return err
		}
		var templateChanged bool
		if in.Label != nil {
			cur.Label = *in.Label
		}
		if in.Options != nil {
			if err := ValidateOptions(cur.Type, *in.Options); err != nil {
				return err
			}
			templateChanged = cur.Type == model.FieldComputed &&
				cur.Options.Template != in.Options.Template
			cur.Options = *in.Options
		}
		now := time.Now().UTC()
		opts, err := json.Marshal(cur.Options)
		if err != nil {
			return err
		}
		cur.UpdatedAt = now
		if _, err := tx.ExecContext(ctx,
			`UPDATE field_definitions SET label = ?, options = ?, updated_at = ? WHERE id = ?`,
			cur.Label, string(opts), store.FormatTime(now), id); err != nil {
			return err
		}
		// Re-run the dependency gate after the write, so the check reads the
		// new template; a failure rolls the transaction back. Editing a
		// template can introduce a dependency nothing ever checked, because the
		// gate itself only runs at bind time -- without this, pointing an
		// already-bound expression key at an optional field is the way around
		// it.
		if templateChanged {
			if err := recheckBoundCategories(ctx, tx, id, cur.Key); err != nil {
				return err
			}
		}
		out = cur
		return nil
	})
	return out, err
}

func boolInt(b bool) int {
	if b {
		return 1
	}
	return 0
}

// recheckBoundCategories re-runs the dependency gate for every category this
// field is bound to, so a template edit cannot leave a binding unsatisfiable.
//
// By field id, not by key: another category may have a field of the same name,
// and its bindings are none of this edit's business.
func recheckBoundCategories(ctx context.Context, tx *sql.Tx, fieldID, key string) error {
	rows, err := tx.QueryContext(ctx,
		`SELECT c.id, c.name, c.path
		 FROM category_fields cf
		 JOIN categories c ON c.id = cf.category_id
		 WHERE cf.field_id = ?`, fieldID)
	if err != nil {
		return fmt.Errorf("load bound categories: %w", err)
	}
	defer rows.Close()
	type bound struct{ name, path string }
	var targets []bound
	for rows.Next() {
		var id string
		var b bound
		if err := rows.Scan(&id, &b.name, &b.path); err != nil {
			return err
		}
		targets = append(targets, b)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	for _, b := range targets {
		if err := checkBindDeps(ctx, tx, b.path, key); err != nil {
			// The category is appended without losing the sentinel underneath, so the
			// HTTP layer still maps it to the right status.
			return fmt.Errorf("%w%s", err, i18n.M(i18n.KeyFieldInCategory, b.name))
		}
	}
	return nil
}

// DeleteField removes an information item outright.
//
// This replaces archiving. "Only disable, never delete" exists to protect
// configuration that has already produced data; an item nobody ever filled in
// is not that, and the system can tell the two apart on its own rather than
// asking an administrator to remember which button means what.
//
// Deleting takes the bindings and any residual key with it, so nothing in the
// database still refers to a definition that is gone.
func (s *Store) deleteFieldTx(ctx context.Context, tx *sql.Tx, id, key string) error {
	for _, stmt := range []struct {
		q    string
		args []any
	}{
		{`DELETE FROM category_fields WHERE field_id = ?`, []any{id}},
		// Only ever empty residue: a non-empty value would have been refused
		// upstream. This is what makes "delete" mean what it says.
		{`UPDATE assets SET attrs = json_remove(attrs, '$.' || ?) WHERE json_extract(attrs, '$.' || ?) IS NOT NULL`,
			[]any{key, key}},
		{`DELETE FROM field_definitions WHERE id = ?`, []any{id}},
	} {
		if _, err := tx.ExecContext(ctx, stmt.q, stmt.args...); err != nil {
			return fmt.Errorf("delete field: %w", err)
		}
	}
	return nil
}
