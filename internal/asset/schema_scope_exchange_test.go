package asset

import (
	"context"
	"database/sql"
	"reflect"
	"testing"

	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/schema"
)

// The effects boundary must accept a legal final scope exchange even when each
// destination is occupied before the batch. This does not relax public move guards.
func TestSchemaEffectsFinalScopeExchange(t *testing.T) {
	f := newFixture(t)
	sch := schema.New(f.svc.db)
	var roots, children []model.Category
	for _, code := range []string{"LEFT", "RIGHT"} {
		root, err := sch.CreateCategory(f.ctx, schema.CreateCategoryInput{Code: code, Name: code})
		if err != nil {
			t.Fatal(err)
		}
		child, err := sch.CreateCategory(f.ctx, schema.CreateCategoryInput{Code: code + "_CHILD", Name: code + " child", ParentID: &root.ID})
		if err != nil {
			t.Fatal(err)
		}
		roots, children = append(roots, root), append(children, child)
	}
	field, err := sch.CreateField(f.ctx, schema.CreateFieldInput{
		Key: "rack_tag", Label: "Rack tag", Type: model.FieldText, IsUnique: true,
		CategoryIDs: []string{roots[0].ID, roots[1].ID},
	})
	if err != nil {
		t.Fatal(err)
	}
	var assets []model.Asset
	for _, child := range children {
		selectFixtureFields(t, f.svc.db, f.ctx, child.ID, field.ID)
		a, err := f.save(t, SaveInput{CategoryID: child.ID, Attrs: map[string]any{"rack_tag": "RACK-A"}})
		if err != nil {
			t.Fatal(err)
		}
		assets = append(assets, a)
	}
	beforeState := preparedAssetState(t, f)
	err = f.svc.db.Write(f.ctx, func(ctx context.Context, tx *sql.Tx) error {
		before, err := schema.LoadSchemaSnapshot(ctx, tx)
		if err != nil {
			return err
		}
		var changes []schema.FieldDelta
		for i, child := range children {
			destination := roots[1-i]
			if _, err := tx.ExecContext(ctx, `UPDATE categories SET parent_id = ?, path = ? WHERE id = ?`, destination.ID, destination.Path+child.ID+"/", child.ID); err != nil {
				return err
			}
			changes = append(changes, schema.FieldDelta{
				CategoryID: child.ID, FieldID: field.ID, Key: field.Key, Change: "source_changed",
				BeforeSourceCategoryID: roots[i].ID, AfterSourceCategoryID: destination.ID,
			})
		}
		after, err := schema.LoadSchemaSnapshot(ctx, tx)
		if err != nil {
			return err
		}
		plan, err := NewSchemaEffects().Plan(ctx, tx, schema.SchemaChange{Before: before, After: after, Changes: changes})
		if err != nil {
			return err
		}
		if len(plan.Issues) != 0 || len(plan.Assets) != 2 || plan.Apply == nil {
			t.Fatalf("final scope exchange plan = %+v", plan)
		}
		return plan.Apply(ctx, tx)
	})
	if err != nil {
		t.Fatalf("legal final scope exchange refused: %v", err)
	}
	for i, a := range assets {
		assertSchemaClaimRows(t, f, a.ID, field.Key, []claimRow{
			{"RACK-A", roots[i].ID, true, false},
			{"RACK-A", roots[1-i].ID, false, false},
		})
		got, err := f.svc.Get(f.ctx, a.ID)
		if err != nil {
			t.Fatal(err)
		}
		if got.Version != a.Version+1 || !reflect.DeepEqual(got.Attrs, a.Attrs) {
			t.Fatalf("scope exchange asset = %+v", got)
		}
	}
	afterState := preparedAssetState(t, f)
	if !reflect.DeepEqual(beforeState["asset_transfers"], afterState["asset_transfers"]) {
		t.Fatal("scope exchange changed transfers")
	}
	// Successful rebuilding may change rowid order; only the indexed identities
	// and values are stable. Rollback tests still compare the original rows.
	var count int
	if err := f.svc.db.ReadDB().QueryRowContext(f.ctx, `SELECT COUNT(*) FROM asset_search_values`).Scan(&count); err != nil || count != 2 {
		t.Fatalf("search row count = %d, %v", count, err)
	}
	for _, a := range assets {
		var value string
		if err := f.svc.db.ReadDB().QueryRowContext(f.ctx, `SELECT value FROM asset_search_values WHERE asset_id = ? AND field_key = 'rack_tag'`, a.ID).Scan(&value); err != nil || value != "RACK-A" {
			t.Fatalf("search value for %s = %q, %v", a.ID, value, err)
		}
	}
}
