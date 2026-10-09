package asset

import (
	"context"
	"database/sql"
	"testing"

	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/schema"
)

// The field stays effective, so moving its original binding must update scope
// without suppressing its ordinary identity history.
func TestSchemaEffectsSourceChangeKeepsHistory(t *testing.T) {
	f := newFixture(t)
	sch := schema.New(f.svc.db)
	field, err := sch.CreateField(f.ctx, schema.CreateFieldInput{
		Key: "rack_tag", Label: "Rack tag", Type: model.FieldText, IsUnique: true, CategoryIDs: []string{f.rootID},
	})
	if err != nil {
		t.Fatal(err)
	}
	selectFixtureFields(t, f.svc.db, f.ctx, f.catID, field.ID)
	a, err := f.save(t, SaveInput{Attrs: map[string]any{"mac": "001A2B3C4D5E", "rack_tag": "RACK-A"}})
	if err != nil {
		t.Fatal(err)
	}
	err = f.svc.db.Write(f.ctx, func(ctx context.Context, tx *sql.Tx) error {
		before, err := schema.LoadSchemaSnapshot(ctx, tx)
		if err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `DELETE FROM category_field_selections WHERE category_id = ? AND field_id = ?`, f.catID, field.ID); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `UPDATE category_fields SET category_id = ? WHERE category_id = ? AND field_id = ?`, f.catID, f.rootID, field.ID); err != nil {
			return err
		}
		after, err := schema.LoadSchemaSnapshot(ctx, tx)
		if err != nil {
			return err
		}
		plan, err := NewSchemaEffects().Plan(ctx, tx, schema.SchemaChange{Before: before, After: after,
			Changes: []schema.FieldDelta{{CategoryID: f.catID, FieldID: field.ID, Key: field.Key, Change: "source_changed", BeforeSourceCategoryID: f.rootID, AfterSourceCategoryID: f.catID}},
		})
		if err != nil {
			return err
		}
		if len(plan.Issues) != 0 || plan.Apply == nil {
			t.Fatalf("source plan = %+v", plan)
		}
		return plan.Apply(ctx, tx)
	})
	if err != nil {
		t.Fatalf("source effects: %v", err)
	}
	assertSchemaClaimRows(t, f, a.ID, field.Key, []claimRow{{"RACK-A", f.rootID, true, false}, {"RACK-A", f.catID, false, false}})
	got, err := f.svc.Get(f.ctx, a.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.Attrs[field.Key] != "RACK-A" || got.Version != a.Version+1 {
		t.Fatalf("source effects asset = %+v", got)
	}
}
