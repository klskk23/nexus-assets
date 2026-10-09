package schema

import (
	"context"
	"database/sql"
	"path/filepath"
	"reflect"
	"testing"

	"github.com/pressly/goose/v3"

	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/store"
	"github.com/klskk23/nexus-assets/migrations"
)

// This catches incomplete migration backfills, changed source/rule/order
// resolution, and any legacy-category fallback to automatic inheritance.
func TestMigrationSelectionPreservesLegacyFieldsWithoutFutureInheritance(t *testing.T) {
	ctx := context.Background()
	db, err := store.Open(filepath.Join(t.TempDir(), "legacy-selection-023.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := db.Close(); err != nil {
			t.Errorf("close migration database: %v", err)
		}
	})
	if err := goose.SetDialect("sqlite3"); err != nil {
		t.Fatal(err)
	}
	goose.SetBaseFS(migrations.FS)
	if err := goose.UpToContext(ctx, db.WriteDBForTest(), ".", 23); err != nil {
		t.Fatalf("migrate empty database to 023: %v", err)
	}
	seedLegacySelectionMigration(t, ctx, db)
	s := New(db)

	// Capture the real pre-024 resolver over a real 023 database. Do not create
	// selections through the new API or derive expectations from the snapshot.
	bindings, err := s.BindingsByCategory(ctx)
	if err != nil {
		t.Fatal(err)
	}
	cases := []struct {
		id      string
		path    string
		ids     []string
		sources []string
		sorts   []int
	}{
		{"root", "/root/", []string{"root-z", "root-a", "root-n"}, []string{"", "", ""}, []int{20, 20, 50}},
		{"child", "/root/child/", []string{"root-z", "root-a", "root-n", "child-z", "child-a"}, []string{"root", "root", "root", "", ""}, []int{20, 20, 50, -5, -5}},
		{"leaf", "/root/child/leaf/", []string{"root-z", "root-a", "root-n", "child-z", "child-a", "leaf"}, []string{"root", "root", "root", "child", "child", ""}, []int{20, 20, 50, -5, -5, -10}},
		{"sibling", "/root/sibling/", []string{"root-z", "root-a", "root-n", "sibling"}, []string{"root", "root", "root", ""}, []int{20, 20, 50, 2}},
	}
	legacy := make(map[string][]model.BoundField, len(cases))
	for _, tc := range cases {
		fields, err := Resolve(tc.path, bindings)
		if err != nil {
			t.Fatalf("resolve legacy %s: %v", tc.id, err)
		}
		if len(fields) != len(tc.ids) {
			t.Fatalf("legacy %s field count = %d, want %d", tc.id, len(fields), len(tc.ids))
		}
		for i, field := range fields {
			if field.ID != tc.ids[i] || field.InheritedFrom != tc.sources[i] || field.Sort != tc.sorts[i] {
				t.Fatalf("legacy %s field %d = (%s, %q, %d), want (%s, %q, %d)",
					tc.id, i, field.ID, field.InheritedFrom, field.Sort, tc.ids[i], tc.sources[i], tc.sorts[i])
			}
			assertLegacyMigrationRules(t, field)
		}
		legacy[tc.id] = fields
	}

	if err := goose.UpToContext(ctx, db.WriteDBForTest(), ".", 24); err != nil {
		t.Fatalf("upgrade legacy database from 023 to 024: %v", err)
	}
	// Full BoundField equality includes IDs, ordering, original source (and thus
	// unique scope), options, both required flags, uniqueness and searchability.
	// Re-loading also guards equal-sort ordering, not just a cached first result.
	for range 3 {
		assertMigratedSelectionFields(t, ctx, s, legacy)
	}

	for _, parentID := range []string{"root", "child"} {
		t.Run("new_field_on_"+parentID, func(t *testing.T) {
			field, err := s.CreateField(ctx, CreateFieldInput{
				Key: "new_" + parentID, Label: "New " + parentID, Type: model.FieldText,
			})
			if err != nil {
				t.Fatal(err)
			}
			if err := s.Bind(ctx, parentID, field.ID, 100); err != nil {
				t.Fatalf("bind new field to migrated %s: %v", parentID, err)
			}
			legacy[parentID] = append(legacy[parentID], model.BoundField{FieldDefinition: field, Sort: 100})
			// Only the direct parent's expectation changes: its pre-existing
			// child, leaf and sibling must retain their exact migrated fields.
			assertMigratedSelectionFields(t, ctx, s, legacy)
		})
	}
}

func seedLegacySelectionMigration(t *testing.T, ctx context.Context, db *store.Store) {
	t.Helper()
	if err := db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		// Equal-sort fields are inserted in reverse ID order. The obsolete
		// binding.required deliberately disagrees with field.required.
		statements := []string{
			`INSERT INTO categories (id, code, name, parent_id, path, created_at, updated_at) VALUES
			 ('root', 'ROOT', 'Root', NULL, '/root/', '2026-10-08T00:00:00Z', '2026-10-08T00:00:00Z'),
			 ('child', 'CHILD', 'Child', 'root', '/root/child/', '2026-10-08T00:00:00Z', '2026-10-08T00:00:00Z'),
			 ('leaf', 'LEAF', 'Leaf', 'child', '/root/child/leaf/', '2026-10-08T00:00:00Z', '2026-10-08T00:00:00Z'),
			 ('sibling', 'SIBLING', 'Sibling', 'root', '/root/sibling/', '2026-10-08T00:00:00Z', '2026-10-08T00:00:00Z')`,
			`INSERT INTO field_definitions (id, key, label, type, options, is_unique, searchable, required, created_at, updated_at) VALUES
			 ('root-z', 'serial', 'Serial', 'text', '{"regex":"^[A-Z]+$","regex_hint":"Uppercase letters"}', 1, 0, 1, '2026-10-08T00:00:00Z', '2026-10-08T00:00:00Z'),
			 ('root-a', 'note', 'Note', 'text', '{}', 0, 1, 0, '2026-10-08T00:00:00Z', '2026-10-08T00:00:00Z'),
			 ('root-n', 'watts', 'Watts', 'number', '{"min":1,"max":48,"precision":0,"unit":"W"}', 0, 0, 1, '2026-10-08T00:00:00Z', '2026-10-08T00:00:00Z'),
			 ('child-z', 'tag', 'Child tag', 'text', '{}', 1, 1, 0, '2026-10-08T00:00:00Z', '2026-10-08T00:00:00Z'),
			 ('child-a', 'enabled', 'Enabled', 'boolean', '{}', 0, 0, 0, '2026-10-08T00:00:00Z', '2026-10-08T00:00:00Z'),
			 ('leaf', 'display', 'Display', 'computed', '{"template":"attrs.serial + \"-unit\""}', 0, 1, 1, '2026-10-08T00:00:00Z', '2026-10-08T00:00:00Z'),
			 ('sibling', 'tag', 'Sibling tag', 'text', '{"regex":"^[0-9]+$"}', 0, 1, 1, '2026-10-08T00:00:00Z', '2026-10-08T00:00:00Z')`,
			`INSERT INTO category_fields (category_id, field_id, required, sort) VALUES
			 ('root', 'root-n', 0, 50), ('root', 'root-z', 0, 20), ('root', 'root-a', 1, 20),
			 ('child', 'child-z', 1, -5), ('child', 'child-a', 1, -5),
			 ('leaf', 'leaf', 0, -10), ('sibling', 'sibling', 0, 2)`,
		}
		for _, statement := range statements {
			if _, err := tx.ExecContext(ctx, statement); err != nil {
				return err
			}
		}
		return nil
	}); err != nil {
		t.Fatalf("seed real 023 schema: %v", err)
	}
}

func assertLegacyMigrationRules(t *testing.T, field model.BoundField) {
	t.Helper()
	min, max, precision := 1.0, 48.0, 0
	type rules struct {
		key        string
		fieldType  model.FieldType
		options    model.FieldOptions
		required   bool
		unique     bool
		searchable bool
	}
	want := map[string]rules{
		"root-z":  {"serial", model.FieldText, model.FieldOptions{Regex: "^[A-Z]+$", RegexHint: "Uppercase letters"}, true, true, false},
		"root-a":  {"note", model.FieldText, model.FieldOptions{}, false, false, true},
		"root-n":  {"watts", model.FieldNumber, model.FieldOptions{Min: &min, Max: &max, Precision: &precision, Unit: "W"}, true, false, false},
		"child-z": {"tag", model.FieldText, model.FieldOptions{}, false, true, true},
		"child-a": {"enabled", model.FieldBoolean, model.FieldOptions{}, false, false, false},
		"leaf":    {"display", model.FieldComputed, model.FieldOptions{Template: `attrs.serial + "-unit"`}, true, false, true},
		"sibling": {"tag", model.FieldText, model.FieldOptions{Regex: "^[0-9]+$"}, true, false, true},
	}[field.ID]
	got := rules{field.Key, field.Type, field.Options, field.Required, field.IsUnique, field.Searchable}
	if !reflect.DeepEqual(got, want) || field.FieldDefinition.Required != want.required {
		t.Fatalf("legacy field %s rules = %+v (definition required %v), want %+v",
			field.ID, got, field.FieldDefinition.Required, want)
	}
}

func assertMigratedSelectionFields(t *testing.T, ctx context.Context, s *Store, want map[string][]model.BoundField) {
	t.Helper()
	snapshot, err := s.Snapshot(ctx)
	if err != nil {
		t.Fatalf("load migrated snapshot: %v", err)
	}
	for _, categoryID := range []string{"root", "child", "leaf", "sibling"} {
		fields, err := snapshot.EffectiveFields(categoryID)
		if err != nil {
			t.Fatalf("snapshot fields for %s: %v", categoryID, err)
		}
		if !reflect.DeepEqual(fields, want[categoryID]) {
			t.Errorf("snapshot fields for %s = %+v, want legacy %+v", categoryID, fields, want[categoryID])
		}
		fields, err = s.EffectiveFields(ctx, categoryID)
		if err != nil {
			t.Fatalf("public effective fields for %s: %v", categoryID, err)
		}
		if !reflect.DeepEqual(fields, want[categoryID]) {
			t.Errorf("public effective fields for %s = %+v, want legacy %+v", categoryID, fields, want[categoryID])
		}
	}
}
