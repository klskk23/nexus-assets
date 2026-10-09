package asset

import (
	"context"
	"database/sql"
	"reflect"
	"testing"

	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/schema"
)

// A restored computed chain must use current effective inputs, not archived
// results. Unrelated computations must not turn a schema edit into a full recompute.
func TestSchemaEffectsRestoresOnlyNecessaryComputations(t *testing.T) {
	for _, scenario := range []string{"chain", "missing_input", "existing_chain"} {
		t.Run(scenario, func(t *testing.T) {
			failure := scenario == "missing_input"
			f := newFixture(t)
			sch := schema.New(f.svc.db)
			var fields []model.FieldDefinition
			for _, input := range []schema.CreateFieldInput{
				{Key: "batch_hex", Type: model.FieldText, Required: true},
				{Key: "batch_decimal", Type: model.FieldComputed, Options: model.FieldOptions{Template: "hex2dec(attrs.batch_hex)"}},
				{Key: "batch_label", Type: model.FieldComputed, IsUnique: true, Options: model.FieldOptions{Template: `"B-" + attrs.batch_decimal`}},
				{Key: "unrelated", Type: model.FieldComputed, Options: model.FieldOptions{Template: "hex2dec(attrs.mac)"}},
			} {
				input.Label, input.CategoryIDs = input.Key, []string{f.rootID}
				field, err := sch.CreateField(f.ctx, input)
				if err != nil {
					t.Fatal(err)
				}
				fields = append(fields, field)
			}
			a, err := f.save(t, SaveInput{Attrs: map[string]any{"mac": "001A2B3C4D5E"}})
			if err != nil {
				t.Fatal(err)
			}
			// Persisted legacy computed values are deliberately obsolete. The unrelated
			// field already exists and must not be recomputed by this schema edit.
			err = f.svc.db.Write(f.ctx, func(ctx context.Context, tx *sql.Tx) error {
				if _, err := tx.ExecContext(ctx, `INSERT INTO category_field_selections (category_id, field_id) VALUES (?, ?)`, f.catID, fields[3].ID); err != nil {
					return err
				}
				// This legacy boundary fixture keeps the dependent fields effective while
				// restoring their input. It exercises dependency propagation, not public
				// schema validation, which rejects creating the incomplete starting set.
				if scenario == "existing_chain" {
					for _, field := range fields[1:3] {
						if _, err := tx.ExecContext(ctx, `INSERT INTO category_field_selections (category_id, field_id) VALUES (?, ?)`, f.catID, field.ID); err != nil {
							return err
						}
					}
				}
				if _, err := tx.ExecContext(ctx, `UPDATE assets SET attrs = json_set(attrs, '$.batch_decimal', 'OLD', '$.batch_label', 'OLD-LABEL', '$.unrelated', 'KEEP') WHERE id = ?`, a.ID); err != nil {
					return err
				}
				if !failure {
					_, err := tx.ExecContext(ctx, `UPDATE assets SET attrs = json_set(attrs, '$.batch_hex', '10') WHERE id = ?`, a.ID)
					return err
				}
				return nil
			})
			if err != nil {
				t.Fatal(err)
			}
			before := preparedAssetState(t, f)
			checkedFailure := false
			err = f.svc.db.Write(f.ctx, func(ctx context.Context, tx *sql.Tx) error {
				oldSchema, err := schema.LoadSchemaSnapshot(ctx, tx)
				if err != nil {
					return err
				}
				var deltas []schema.FieldDelta
				restored := fields[:3]
				if scenario == "existing_chain" {
					restored = fields[:1]
				}
				for _, field := range restored {
					if _, err := tx.ExecContext(ctx, `INSERT INTO category_field_selections (category_id, field_id) VALUES (?, ?)`, f.catID, field.ID); err != nil {
						return err
					}
					deltas = append(deltas, schema.FieldDelta{CategoryID: f.catID, FieldID: field.ID, Key: field.Key, Change: "added"})
				}
				newSchema, err := schema.LoadSchemaSnapshot(ctx, tx)
				if err != nil {
					return err
				}
				plan, err := NewSchemaEffects().Plan(ctx, tx, schema.SchemaChange{Before: oldSchema, After: newSchema, Changes: deltas})
				if err != nil {
					return err
				}
				if failure {
					if len(plan.Issues) != 1 || plan.Issues[0].Code != "computation_failed" || plan.Issues[0].AssetID != a.ID || plan.Issues[0].FieldKey != "batch_decimal" || plan.Apply != nil {
						t.Fatalf("failed computation plan = %+v", plan)
					}
					checkedFailure = true
					return plan.Issues[0].Message
				}
				if len(plan.Issues) != 0 || plan.Apply == nil {
					t.Fatalf("computation plan = %+v", plan)
				}
				return plan.Apply(ctx, tx)
			})
			if failure {
				if !checkedFailure || err == nil || !reflect.DeepEqual(before, preparedAssetState(t, f)) {
					t.Fatalf("computation failure not reported atomically: %v", err)
				}
				return
			}
			if err != nil {
				t.Fatalf("restore computed chain: %v", err)
			}
			got, err := f.svc.Get(f.ctx, a.ID)
			if err != nil {
				t.Fatal(err)
			}
			if got.Attrs["batch_decimal"] != "16" || got.Attrs["batch_label"] != "B-16" || got.Attrs["unrelated"] != "KEEP" || got.Version != a.Version+1 {
				t.Fatalf("computed restore = %+v", got)
			}
			assertSchemaClaimRows(t, f, a.ID, "batch_label", []claimRow{{"B-16", f.rootID, false, false}})
		})
	}
}
