package asset

import (
	"context"
	"database/sql"
	"errors"
	"reflect"
	"slices"
	"strings"
	"testing"

	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/schema"
)

// Exercise the real in-memory draft planner rather than constructing an after
// snapshot with SQL. A successful addition and a refused withdrawal share the
// same service assembly and must retain the public confirmation boundary.
func TestSchemaEffectsCategoryAdditionAndUnconfirmedWithdrawal(t *testing.T) {
	f := newFixture(t)
	sch := schema.NewWithEffects(f.svc.db, NewSchemaEffects())
	f.svc = NewService(f.svc.db, sch)
	field, err := sch.CreateField(f.ctx, schema.CreateFieldInput{
		Key: "rack_tag", Label: "Rack tag", Type: model.FieldText, IsUnique: true, CategoryIDs: []string{f.rootID},
	})
	if err != nil {
		t.Fatal(err)
	}
	a, err := f.save(t, SaveInput{Attrs: map[string]any{"mac": "001A2B3C4D5E"}})
	if err != nil {
		t.Fatal(err)
	}
	if err := f.svc.db.Write(f.ctx, func(ctx context.Context, tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `UPDATE assets SET attrs = json_set(attrs, '$.rack_tag', 'RACK-A') WHERE id = ?`, a.ID)
		return err
	}); err != nil {
		t.Fatal(err)
	}
	baseline, err := sch.PreviewCategory(f.ctx, f.catID, schema.CategoryDraft{})
	if err != nil {
		t.Fatal(err)
	}
	selected := append(append([]string{}, baseline.SelectedFieldIDs...), field.ID)
	before := preparedAssetState(t, f)
	preview, err := sch.PreviewCategory(f.ctx, f.catID, schema.CategoryDraft{InheritedFieldIDs: &selected})
	if err != nil || len(preview.Issues) != 0 || preview.AssetCount != 1 {
		t.Fatalf("addition preview = %+v, %v", preview, err)
	}
	if !reflect.DeepEqual(before, preparedAssetState(t, f)) {
		t.Fatal("real category preview wrote asset data")
	}
	unchanged, err := sch.PreviewCategory(f.ctx, f.catID, schema.CategoryDraft{})
	if err != nil || !reflect.DeepEqual(unchanged.SelectedFieldIDs, baseline.SelectedFieldIDs) {
		t.Fatalf("preview wrote selections: %+v, %v", unchanged, err)
	}
	if _, err := sch.UpdateCategory(f.ctx, f.catID, schema.UpdateCategoryInput{InheritedFieldIDs: &selected}); err != nil {
		t.Fatalf("add inherited field: %v", err)
	}
	got, err := f.svc.Get(f.ctx, a.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.Version != a.Version+1 || got.Attrs[field.Key] != "RACK-A" {
		t.Fatalf("category addition effects = %+v", got)
	}
	assertSchemaClaimRows(t, f, a.ID, field.Key, []claimRow{{"RACK-A", f.rootID, false, false}})
	beforeWithdrawal := preparedAssetState(t, f)
	if _, err := sch.UpdateCategory(f.ctx, f.catID, schema.UpdateCategoryInput{InheritedFieldIDs: &baseline.SelectedFieldIDs}); !errors.Is(err, schema.ErrConfirmationRequired) {
		t.Fatalf("unconfirmed withdrawal = %v, want confirmation required", err)
	}
	if !reflect.DeepEqual(beforeWithdrawal, preparedAssetState(t, f)) {
		t.Fatal("unconfirmed withdrawal changed asset data")
	}
	unchanged, err = sch.PreviewCategory(f.ctx, f.catID, schema.CategoryDraft{})
	if err != nil || len(unchanged.SelectedFieldIDs) != len(selected) || !slices.Contains(unchanged.SelectedFieldIDs, field.ID) {
		t.Fatalf("unconfirmed withdrawal changed selections: %+v, %v", unchanged, err)
	}
}

func TestSchemaEffectsCategoryAdditionFailureRollsBackMetadata(t *testing.T) {
	f := newFixture(t)
	sch := schema.NewWithEffects(f.svc.db, NewSchemaEffects())
	f.svc = NewService(f.svc.db, sch)
	field, err := sch.CreateField(f.ctx, schema.CreateFieldInput{
		Key: "purchase_note", Label: "Purchase note", Type: model.FieldText, CategoryIDs: []string{f.rootID},
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.save(t, SaveInput{Attrs: map[string]any{"mac": "001A2B3C4D5E"}}); err != nil {
		t.Fatal(err)
	}
	baseline, err := sch.PreviewCategory(f.ctx, f.catID, schema.CategoryDraft{})
	if err != nil {
		t.Fatal(err)
	}
	selected := append(append([]string{}, baseline.SelectedFieldIDs...), field.ID)
	before := preparedAssetState(t, f)
	if err := f.svc.db.Write(f.ctx, func(ctx context.Context, tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `CREATE TRIGGER refuse_schema_search BEFORE INSERT ON asset_search_values
			BEGIN SELECT RAISE(ABORT, 'injected category effect failure'); END`)
		return err
	}); err != nil {
		t.Fatal(err)
	}
	name := "Must not commit"
	_, err = sch.UpdateCategory(f.ctx, f.catID, schema.UpdateCategoryInput{Name: &name, InheritedFieldIDs: &selected})
	if err == nil || !strings.Contains(err.Error(), "injected category effect failure") {
		t.Fatalf("category write failure = %v, want injected effect failure", err)
	}
	if !reflect.DeepEqual(before, preparedAssetState(t, f)) {
		t.Fatal("failed category write left partial asset/index effects")
	}
	cat, err := sch.GetCategory(f.ctx, f.catID)
	if err != nil || !reflect.DeepEqual(cat, baseline.Category) {
		t.Fatalf("failed category write changed metadata: %+v, %v", cat, err)
	}
	current, err := sch.PreviewCategory(f.ctx, f.catID, schema.CategoryDraft{})
	if err != nil || !reflect.DeepEqual(current.SelectedFieldIDs, baseline.SelectedFieldIDs) {
		t.Fatalf("failed category write changed selections: %+v, %v", current, err)
	}
}
