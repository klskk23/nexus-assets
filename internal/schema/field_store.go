package schema

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/klskk23/nexus-assets/internal/i18n"
	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/store"
)

const fieldCols = `id, key, label, type, options, is_unique, searchable, required, created_at, updated_at`

func scanField(row interface{ Scan(...any) error }) (model.FieldDefinition, error) {
	var f model.FieldDefinition
	var opts string
	var created, updated string
	var isUnique, searchable, required int
	if err := row.Scan(&f.ID, &f.Key, &f.Label, &f.Type, &opts, &isUnique, &searchable,
		&required, &created, &updated); err != nil {
		return f, err
	}
	f.IsUnique = isUnique == 1
	f.Searchable = searchable == 1
	f.Required = required == 1
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
// FieldFilter narrows a field listing.
type FieldFilter struct {
	// CategoryID limits the list to the fields that category has, inherited
	// ones included -- the same set its assets are asked to fill in.
	CategoryID string
	// Q searches the key and the label. Both, because half the people here
	// think of a field by what the form says and half by what the expression
	// reads.
	Q string
	// Type narrows to one kind, which is how somebody finds every computed
	// field to see what the numbering rules are.
	Type model.FieldType
	// VendorID keeps the fields bound to one vendor, and GroupID the ones in
	// one group (016). Both are "where would I find it", which is the question
	// a library of a hundred fields makes hard to answer any other way.
	VendorID string
	GroupID  string
	Offset   int
	Limit    int
}

// FieldPage is one page of the field library.
type FieldPage struct {
	Items  []model.FieldDefinition `json:"items"`
	Total  int                     `json:"total"`
	Offset int                     `json:"offset"`
	Limit  int                     `json:"limit"`
}

// ListFieldPage answers the field library one page at a time, optionally
// limited to one category's effective fields.
//
// Paging and the filter live together because the library is now allowed to
// hold two fields with the same key under different categories: without a way
// to ask "this category's fields", the list stops being readable the moment a
// key repeats.
func (s *Store) ListFieldPage(ctx context.Context, f FieldFilter) (FieldPage, error) {
	page := FieldPage{Items: []model.FieldDefinition{}, Offset: f.Offset, Limit: f.Limit}

	all, err := s.ListFields(ctx)
	if err != nil {
		return page, err
	}
	all = search(all, f)
	if f.CategoryID != "" {
		effective, err := s.EffectiveFields(ctx, f.CategoryID)
		if err != nil {
			return page, err
		}
		keep := make(map[string]struct{}, len(effective))
		for _, b := range effective {
			keep[b.ID] = struct{}{}
		}
		var kept []model.FieldDefinition
		for _, fd := range all {
			if _, ok := keep[fd.ID]; ok {
				kept = append(kept, fd)
			}
		}
		all = kept
	}

	if f.VendorID != "" || f.GroupID != "" {
		keep, err := s.fieldsIn(ctx, f)
		if err != nil {
			return page, err
		}
		var kept []model.FieldDefinition
		for _, fd := range all {
			if _, ok := keep[fd.ID]; ok {
				kept = append(kept, fd)
			}
		}
		all = kept
	}

	page.Total = len(all)
	if f.Offset < len(all) {
		end := f.Offset + f.Limit
		if f.Limit <= 0 || end > len(all) {
			end = len(all)
		}
		page.Items = all[f.Offset:end]
	}
	return page, nil
}

// fieldsIn is the id set the vendor and group filters keep.
//
// Both narrow, so a request naming a vendor and a group asks for the fields in
// both -- the intersection, which is what putting two filters on one row means
// everywhere else on these pages.
func (s *Store) fieldsIn(ctx context.Context, f FieldFilter) (map[string]struct{}, error) {
	out := map[string]struct{}{}
	first := true
	for _, q := range []struct {
		sql string
		arg string
	}{
		{`SELECT field_id FROM vendor_fields WHERE vendor_id = ?`, f.VendorID},
		{`SELECT field_id FROM field_group_members WHERE group_id = ?`, f.GroupID},
	} {
		if q.arg == "" {
			continue
		}
		rows, err := s.db.ReadDB().QueryContext(ctx, q.sql, q.arg)
		if err != nil {
			return nil, fmt.Errorf("filter fields: %w", err)
		}
		found := map[string]struct{}{}
		for rows.Next() {
			var id string
			if err := rows.Scan(&id); err != nil {
				rows.Close()
				return nil, err
			}
			found[id] = struct{}{}
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return nil, err
		}
		if first {
			out, first = found, false
			continue
		}
		for id := range out {
			if _, ok := found[id]; !ok {
				delete(out, id)
			}
		}
	}
	return out, nil
}

// BoundCategories maps each field id to the categories that bind it.
//
// The binding is what gives a field a home now, so the list has to show it:
// two fields with the same key are told apart by where they live.
func (s *Store) BoundCategories(ctx context.Context) (map[string][]string, error) {
	rows, err := s.db.ReadDB().QueryContext(ctx,
		`SELECT cf.field_id, cf.category_id FROM category_fields cf
		 JOIN categories c ON c.id = cf.category_id ORDER BY c.path`)
	if err != nil {
		return nil, fmt.Errorf("load field bindings: %w", err)
	}
	defer rows.Close()
	out := map[string][]string{}
	for rows.Next() {
		var fieldID, categoryID string
		if err := rows.Scan(&fieldID, &categoryID); err != nil {
			return nil, err
		}
		out[fieldID] = append(out[fieldID], categoryID)
	}
	return out, rows.Err()
}

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

// CreateFieldInput describes a new field.
type CreateFieldInput struct {
	Key      string
	Label    string
	Type     model.FieldType
	Options  model.FieldOptions
	IsUnique bool
	// CategoryIDs binds the new field as it is created. A field bound nowhere
	// is on no form and holds no value, so making that the only thing a create
	// can produce meant every new field needed a second trip through the edit
	// dialog.
	CategoryIDs []string
	// ModelIDs binds it to models instead (015, decision 96). Passing both is
	// refused by the same guard that refuses it later, so the two modes cannot
	// be mixed by coming in through the door marked "create".
	ModelIDs []string
	// VendorIDs binds it to vendors, which is the other half of the device
	// side (016, decision 110). It may be given together with ModelIDs -- both
	// answer "which device" -- and never together with CategoryIDs.
	VendorIDs []string
	// Searchable puts the values within reach of the asset search. Unique
	// implies it, so this is only asked of the fields that are not.
	Searchable bool
	// Required belongs to the field and reaches every binding it has (018).
	// It is a write-time rule, not a data invariant: existing assets keep
	// whatever they have, and the next edit of one is where it is asked for.
	Required bool
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
		Options: in.Options, IsUnique: in.IsUnique, Searchable: in.Searchable,
		Required:  in.Required,
		CreatedAt: now, UpdatedAt: now,
	}
	err = s.db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO field_definitions
			   (id, key, label, type, options, is_unique, searchable, required, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			f.ID, f.Key, f.Label, string(f.Type), string(opts), boolInt(f.IsUnique),
			boolInt(f.Searchable), boolInt(f.Required),
			store.FormatTime(now), store.FormatTime(now)); err != nil {
			return err
		}
		// Bound in the same transaction, so a refused binding -- a key already
		// on that chain, an expression whose inputs are not there -- leaves no
		// field behind either. The refusal is about the pair, and half of it is
		// not worth keeping.
		for i, categoryID := range in.CategoryIDs {
			if err := bindTx(ctx, tx, categoryID, f.ID, (i+1)*10); err != nil {
				return err
			}
		}
		for i, modelID := range in.ModelIDs {
			if err := bindModelTx(ctx, tx, modelID, f.ID, (i+1)*10); err != nil {
				return err
			}
		}
		for i, vendorID := range in.VendorIDs {
			if err := bindVendorTx(ctx, tx, vendorID, f.ID, (i+1)*10); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		// The domain errors binding raises are written for a person and carry
		// their own catalogue key; wrapping them would hide that behind
		// "create field:".
		if i18n.HasText(err) || errors.Is(err, ErrNotFound) {
			return f, err
		}
		return f, fmt.Errorf("create field: %w", err)
	}
	return f, nil
}

// UpdateFieldInput carries the mutable parts of a field definition.
type UpdateFieldInput struct {
	Label   *string
	Options *model.FieldOptions
	// Required can be changed after the fact; IsUnique deliberately cannot.
	// Turning uniqueness on would have to prove the existing values do not
	// collide and backfill asset_unique_values for every asset that has one,
	// which is a job of its own -- whereas required only ever describes the
	// next edit, so flipping it is free.
	Required *bool
	// Searchable can be changed after the fact -- which is the whole point:
	// whether a value is worth finding is learned by using the system, not
	// decided the minute the field is created.
	Searchable *bool
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
		if in.Required != nil {
			cur.Required = *in.Required
		}
		searchChanged := false
		if in.Searchable != nil && *in.Searchable != cur.Searchable {
			cur.Searchable = *in.Searchable
			searchChanged = true
		}
		now := time.Now().UTC()
		opts, err := json.Marshal(cur.Options)
		if err != nil {
			return err
		}
		cur.UpdatedAt = now
		if _, err := tx.ExecContext(ctx,
			`UPDATE field_definitions SET label = ?, options = ?, searchable = ?, required = ?,
			     updated_at = ? WHERE id = ?`,
			cur.Label, string(opts), boolInt(cur.Searchable), boolInt(cur.Required),
			store.FormatTime(now), id); err != nil {
			return err
		}
		// Backfill in the same transaction, so the switch and the index can
		// never disagree.
		//
		// The alternative -- indexing only what is saved from now on -- leaves
		// the search answering for some devices and not others, with nothing on
		// screen to say which. That is the version nobody reports as a bug
		// because it looks like the search simply missed.
		if searchChanged {
			if err := reindexField(ctx, tx, cur); err != nil {
				return err
			}
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
		// And the other kind (015). model_fields.field_id references
		// field_definitions without a cascade, so leaving these behind does not
		// orphan a row -- it makes the delete fail outright, which is what
		// deleting a model-bound field used to do.
		{`DELETE FROM model_fields WHERE field_id = ?`, []any{id}},
		// And the third (016). Same shape, same missing cascade, so the same
		// 500 waits here for anyone who forgets it. field_group_members does
		// cascade and is deliberately absent from this list.
		{`DELETE FROM vendor_fields WHERE field_id = ?`, []any{id}},
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

// search narrows the library by what was typed and by kind.
//
// The key and the label are both searched: half the people here think of a
// field by what the form says, and half by what the expression reads.
func search(all []model.FieldDefinition, f FieldFilter) []model.FieldDefinition {
	if f.Q == "" && f.Type == "" {
		return all
	}
	q := strings.ToLower(strings.TrimSpace(f.Q))
	kept := make([]model.FieldDefinition, 0, len(all))
	for _, fd := range all {
		if f.Type != "" && fd.Type != f.Type {
			continue
		}
		if q != "" && !strings.Contains(strings.ToLower(fd.Key), q) &&
			!strings.Contains(strings.ToLower(fd.Label), q) {
			continue
		}
		kept = append(kept, fd)
	}
	return kept
}

// reindexField brings the search index in line with one field's switch.
//
// Turning it on walks every asset that carries the key; turning it off drops
// the rows. Both in the caller's transaction: a half-applied change here is a
// search that answers for some devices and not others, and nothing on screen
// distinguishes that from a value simply not being there.
//
// Values come out of the attrs JSON with json_extract rather than being
// re-derived, because what is indexed must be what is stored -- deriving it a
// second way is a second answer waiting to differ from the first.
func reindexField(ctx context.Context, tx *sql.Tx, f model.FieldDefinition) error {
	if _, err := tx.ExecContext(ctx,
		`DELETE FROM asset_search_values WHERE field_key = ?`, f.Key); err != nil {
		return fmt.Errorf("clear index for %q: %w", f.Key, err)
	}
	if !f.Findable() {
		return nil
	}
	// trim() then the emptiness check, for the same reason the write path
	// skips blanks: an empty string in the index is matched by every search.
	_, err := tx.ExecContext(ctx, `
		INSERT INTO asset_search_values (asset_id, field_key, value)
		SELECT id, ?, trim(json_extract(attrs, '$.' || ?))
		  FROM assets
		 WHERE json_extract(attrs, '$.' || ?) IS NOT NULL
		   AND trim(json_extract(attrs, '$.' || ?)) <> ''`,
		f.Key, f.Key, f.Key, f.Key)
	if err != nil {
		return fmt.Errorf("reindex %q: %w", f.Key, err)
	}
	return nil
}
