package asset

import (
	"context"
	"database/sql"
	"errors"
	"reflect"
	"testing"

	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/schema"
)

func TestInheritanceRequiredExemptionEndsAtNextSave(t *testing.T) {
	f := newFixture(t)
	a, err := f.save(t, SaveInput{Attrs: map[string]any{"mac": "001A2B3C4D5E"}})
	if err != nil {
		t.Fatal(err)
	}
	field, err := f.schema.CreateField(f.ctx, schema.CreateFieldInput{Key: "purchased", Label: "Purchased", Type: model.FieldDate, Required: true, CategoryIDs: []string{f.rootID}})
	if err != nil {
		t.Fatal(err)
	}
	preview, err := f.schema.PreviewCategory(f.ctx, f.catID, schema.CategoryDraft{})
	if err != nil {
		t.Fatal(err)
	}
	selected := append(preview.SelectedFieldIDs, field.ID)
	if _, err := f.schema.UpdateCategory(f.ctx, f.catID, schema.UpdateCategoryInput{InheritedFieldIDs: &selected}); err != nil {
		t.Fatalf("existing missing required value must not block inheritance: %v", err)
	}
	got, err := f.svc.Get(f.ctx, a.ID)
	if err != nil {
		t.Fatal(err)
	}
	if _, invented := got.Attrs[field.Key]; invented {
		t.Fatal("inheritance invented required value")
	}
	for _, input := range []SaveInput{
		{Attrs: map[string]any{"mac": "001A2B3C4D5F"}},
		{ID: got.ID, Version: got.Version, Attrs: got.Attrs},
	} {
		before := preparedAssetState(t, f)
		_, err := f.save(t, input)
		var fields FieldErrors
		if !errors.As(err, &fields) || fields[field.Key].Error() == "" {
			t.Fatalf("save must enforce inherited required field: %v", err)
		}
		if !reflect.DeepEqual(before, preparedAssetState(t, f)) {
			t.Fatal("failed required validation wrote data")
		}
	}
}

func TestInheritanceComputedResultsHaveNoLegacyExemption(t *testing.T) {
	for _, scenario := range []string{"empty_result", "missing_input", "unique_collision", "archived_input"} {
		t.Run(scenario, func(t *testing.T) {
			f := newFixture(t)
			input, err := f.schema.CreateField(f.ctx, schema.CreateFieldInput{Key: "legacy", Label: "Legacy", Type: model.FieldText, Required: true, CategoryIDs: []string{f.rootID}})
			if err != nil {
				t.Fatal(err)
			}
			template := `""`
			if scenario == "unique_collision" {
				template = `"DUPLICATE"`
			}
			if scenario == "missing_input" || scenario == "archived_input" {
				template = `attrs.legacy`
			}
			computed, err := f.schema.CreateField(f.ctx, schema.CreateFieldInput{Key: "restored", Label: "Restored", Type: model.FieldComputed, IsUnique: true, Options: model.FieldOptions{Template: template}, CategoryIDs: []string{f.rootID}})
			if err != nil {
				t.Fatal(err)
			}
			for _, mac := range []string{"001A2B3C4D01", "001A2B3C4D02"} {
				if _, err := f.save(t, SaveInput{Attrs: map[string]any{"mac": mac}}); err != nil {
					t.Fatal(err)
				}
			}
			if err := f.svc.db.Write(f.ctx, func(ctx context.Context, tx *sql.Tx) error {
				if _, err := tx.ExecContext(ctx, `UPDATE assets SET attrs = json_set(attrs, '$.restored', id)`); err != nil {
					return err
				}
				if scenario == "archived_input" {
					_, err := tx.ExecContext(ctx, `UPDATE assets SET attrs = json_set(attrs, '$.legacy', id)`)
					return err
				}
				return nil
			}); err != nil {
				t.Fatal(err)
			}
			before := preparedAssetState(t, f)
			checked := false
			err = f.svc.db.Write(f.ctx, func(ctx context.Context, tx *sql.Tx) error {
				old, err := schema.LoadSchemaSnapshot(ctx, tx)
				if err != nil {
					return err
				}
				// The archived-input case deliberately exercises the effect boundary with
				// invalid legacy metadata. Raw attrs must not satisfy a missing live field.
				restored := []string{computed.ID}
				if scenario == "missing_input" {
					restored = append(restored, input.ID)
				}
				deltas := []schema.FieldDelta{}
				for _, id := range restored {
					if _, err := tx.ExecContext(ctx, `INSERT INTO category_field_selections(category_id,field_id) VALUES (?,?)`, f.catID, id); err != nil {
						return err
					}
					deltas = append(deltas, schema.FieldDelta{CategoryID: f.catID, FieldID: id, Change: "added"})
				}
				next, err := schema.LoadSchemaSnapshot(ctx, tx)
				if err != nil {
					return err
				}
				plan, err := NewSchemaEffects().Plan(ctx, tx, schema.SchemaChange{Before: old, After: next, Changes: deltas})
				if err != nil {
					return err
				}
				if len(plan.Issues) == 0 || plan.Apply != nil {
					t.Fatalf("invalid computed results accepted: %+v", plan)
				}
				want := "computation_failed"
				if scenario == "unique_collision" {
					want = "unique_conflict"
				}
				if plan.Issues[0].Code != want {
					t.Fatalf("issue = %+v", plan.Issues[0])
				}
				checked = true
				return plan.Issues[0].Message
			})
			if !checked || err == nil {
				t.Fatalf("missing expected computation rejection: %v", err)
			}
			if !reflect.DeepEqual(before, preparedAssetState(t, f)) {
				t.Fatal("computed failure left metadata, attrs, versions or indexes")
			}
		})
	}
}

func TestSchemaComputationCacheReusesProgramsOnlyWithinOnePlan(t *testing.T) {
	f := newFixture(t)
	snapshot, err := f.schema.Snapshot(f.ctx)
	if err != nil {
		t.Fatal(err)
	}
	resolved, err := snapshot.AssetSchema(f.catID, nil)
	if err != nil {
		t.Fatal(err)
	}
	cache := newSchemaComputeCache()
	first, err := cache.get(resolved)
	if err != nil {
		t.Fatal(err)
	}
	second, err := cache.get(resolved)
	if err != nil {
		t.Fatal(err)
	}
	if first != second || first.programs["sn"] != second.programs["sn"] || len(cache) != 1 {
		t.Fatal("same schema recompiled within one plan")
	}
	f.setTemplate(t, `"NEW-" + hex2dec(attrs.mac)`)
	next, err := f.schema.Snapshot(f.ctx)
	if err != nil {
		t.Fatal(err)
	}
	changed, err := next.AssetSchema(f.catID, nil)
	if err != nil {
		t.Fatal(err)
	}
	third, err := cache.get(changed)
	if err != nil {
		t.Fatal(err)
	}
	if third == first || third.programs["sn"] == first.programs["sn"] {
		t.Fatal("changed schema reused stale compiled program")
	}
	fresh, err := newSchemaComputeCache().get(resolved)
	if err != nil {
		t.Fatal(err)
	}
	if fresh == first {
		t.Fatal("cache leaked across plans")
	}
	for _, template := range []string{`attrs[category.code]`, `map([1,2], {# + 1})`, `unknown_name`} {
		unsafe := schema.AssetSchema{Fields: []model.BoundField{{FieldDefinition: model.FieldDefinition{Key: "unsafe", Type: model.FieldComputed, Options: model.FieldOptions{Template: template}}}}}
		if _, err := cache.get(unsafe); err == nil {
			t.Fatalf("cached compilation bypassed AST guard: %s", template)
		}
	}
}
