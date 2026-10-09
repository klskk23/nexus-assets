package asset

import (
	"context"
	"database/sql"
	"reflect"
	"testing"

	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/schema"
)

// Restoring a static field validates archived values, not unrelated required
// fields. Missing legacy values must not deadlock schema configuration.
func TestSchemaEffectsRestoreStaticValues(t *testing.T) {
	for _, scenario := range []string{"valid", "missing_required", "invalid", "out_of_range", "normalized", "collision"} {
		t.Run(scenario, func(t *testing.T) {
			f := newFixture(t)
			sch := schema.New(f.svc.db)
			input := schema.CreateFieldInput{
				Key: "rack_tag", Label: "Rack tag", Type: model.FieldText, IsUnique: true,
				Required: true, Options: model.FieldOptions{Regex: "^RACK-[A-Z]+$"}, CategoryIDs: []string{f.rootID},
			}
			if scenario == "out_of_range" {
				maxValue := 5.0
				input.Type, input.Options = model.FieldNumber, model.FieldOptions{Max: &maxValue}
			}
			if scenario == "normalized" {
				input.Type, input.Options = model.FieldMAC, model.FieldOptions{}
			}
			field, err := sch.CreateField(f.ctx, input)
			if err != nil {
				t.Fatal(err)
			}
			a, err := f.save(t, SaveInput{Attrs: map[string]any{"mac": "001A2B3C4D5E"}})
			if err != nil {
				t.Fatal(err)
			}
			// Archived state is a fixture; this test starts at the restoration boundary.
			value := "RACK-OLD"
			if scenario == "invalid" {
				value = "bad-format"
			}
			if scenario == "out_of_range" {
				value = "10"
			}
			if scenario == "normalized" {
				value = "00:AA:BB:CC:DD:EE"
			}
			wantValue := value
			if scenario == "normalized" {
				wantValue = "00AABBCCDDEE"
			}
			err = f.svc.db.Write(f.ctx, func(ctx context.Context, tx *sql.Tx) error {
				if scenario == "missing_required" {
					return nil
				}
				if _, err := tx.ExecContext(ctx, `UPDATE assets SET attrs = json_set(attrs, '$.rack_tag', ?) WHERE id = ?`, value, a.ID); err != nil {
					return err
				}
				_, err := tx.ExecContext(ctx, `INSERT INTO asset_unique_values (asset_id, field_key, value, scope_id, created_at, archived_at, search_suppressed)
					VALUES (?, 'rack_tag', ?, ?, '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z', 1)`, a.ID, value, f.rootID)
				return err
			})
			if err != nil {
				t.Fatal(err)
			}
			if scenario == "collision" {
				if _, err := f.save(t, SaveInput{CategoryID: f.rootID, Attrs: map[string]any{"mac": "001A2B3C4D5F", "rack_tag": value}}); err != nil {
					t.Fatal(err)
				}
			}
			before := preparedAssetState(t, f)
			blocked := scenario == "invalid" || scenario == "out_of_range" || scenario == "collision"
			checkedIssue := false
			err = f.svc.db.Write(f.ctx, func(ctx context.Context, tx *sql.Tx) error {
				oldSchema, err := schema.LoadSchemaSnapshot(ctx, tx)
				if err != nil {
					return err
				}
				if _, err := tx.ExecContext(ctx, `INSERT INTO category_field_selections (category_id, field_id) VALUES (?, ?)`, f.catID, field.ID); err != nil {
					return err
				}
				newSchema, err := schema.LoadSchemaSnapshot(ctx, tx)
				if err != nil {
					return err
				}
				plan, err := NewSchemaEffects().Plan(ctx, tx, schema.SchemaChange{
					Before: oldSchema, After: newSchema,
					Changes: []schema.FieldDelta{{CategoryID: f.catID, FieldID: field.ID, Key: field.Key, Change: "added"}},
				})
				if err != nil {
					return err
				}
				if blocked {
					wantCode := "invalid_restored_value"
					if scenario == "collision" {
						wantCode = "unique_conflict"
					}
					if len(plan.Issues) != 1 || plan.Issues[0].Code != wantCode || plan.Issues[0].FieldID != field.ID || plan.Issues[0].AssetID != a.ID || plan.Apply != nil {
						t.Fatalf("plan = %+v, want non-applicable %s issue", plan, wantCode)
					}
					checkedIssue = true
					return plan.Issues[0].Message
				}
				if len(plan.Issues) != 0 || plan.Apply == nil {
					t.Fatalf("restoration plan not ready: %+v", plan)
				}
				return plan.Apply(ctx, tx)
			})
			if blocked {
				if !checkedIssue || err == nil || !reflect.DeepEqual(before, preparedAssetState(t, f)) {
					t.Fatalf("blocked restoration wrote assets or returned no error: %v", err)
				}
				return
			}
			if err != nil {
				t.Fatalf("restore static field: %v", err)
			}
			got, err := f.svc.Get(f.ctx, a.ID)
			if err != nil {
				t.Fatal(err)
			}
			if got.Version != a.Version+1 {
				t.Fatalf("version = %d, want %d", got.Version, a.Version+1)
			}
			if scenario == "missing_required" {
				if _, invented := got.Attrs[field.Key]; invented {
					t.Fatal("restoring required field invented a missing value")
				}
			} else {
				if got.Attrs[field.Key] != wantValue {
					t.Fatalf("restored value = %v, want %s", got.Attrs[field.Key], wantValue)
				}
				assertSchemaClaimRows(t, f, a.ID, field.Key, []claimRow{{value, f.rootID, true, true}, {wantValue, f.rootID, false, false}})
				var indexed string
				if err := f.svc.db.ReadDB().QueryRowContext(f.ctx, `SELECT value FROM asset_search_values WHERE asset_id = ? AND field_key = ?`, a.ID, field.Key).Scan(&indexed); err != nil || indexed != wantValue {
					t.Fatalf("restored search = %q, %v", indexed, err)
				}
			}
		})
	}
}
