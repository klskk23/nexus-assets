package asset

import (
	"context"
	"errors"
	"reflect"
	"testing"

	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/schema"
)

func TestSchemaEffectsPlanFailsClosed(t *testing.T) {
	plan, err := NewSchemaEffects().Plan(context.Background(), nil, schema.SchemaChange{})
	if plan != nil || !errors.Is(err, schema.ErrSchemaEffectsUnavailable) {
		t.Fatalf("Plan = (%+v, %v), want nil plan and effects unavailable", plan, err)
	}
}

func TestSchemaEffectsPreviewPlansStaticAdditionWithoutWrites(t *testing.T) {
	f := newFixture(t)
	sch := schema.NewWithEffects(f.svc.db, NewSchemaEffects())
	f.svc = NewService(f.svc.db, sch)
	created, err := f.save(t, SaveInput{Attrs: map[string]any{"mac": "00:1A:2B:3C:4D:5E"}})
	if err != nil {
		t.Fatalf("save asset: %v", err)
	}
	field, err := sch.CreateField(f.ctx, schema.CreateFieldInput{
		Key: "purchase_note", Label: "Purchase note", Type: model.FieldText,
	})
	if err != nil {
		t.Fatalf("create parent field: %v", err)
	}
	if err := sch.Bind(f.ctx, f.rootID, field.ID, 40); err != nil {
		t.Fatalf("bind parent field: %v", err)
	}
	assetBefore, err := f.svc.Get(f.ctx, created.ID)
	if err != nil {
		t.Fatalf("get asset before preview: %v", err)
	}
	categoryBefore, err := sch.GetCategory(f.ctx, f.catID)
	if err != nil {
		t.Fatalf("get category before preview: %v", err)
	}
	selectionState := func() string {
		t.Helper()
		var state string
		if err := f.svc.db.ReadDB().QueryRowContext(f.ctx, `SELECT coalesce(group_concat(field_id, ','), '')
			FROM (SELECT field_id FROM category_field_selections WHERE category_id = ? ORDER BY field_id)`, f.catID).Scan(&state); err != nil {
			t.Fatalf("read category selections: %v", err)
		}
		return state
	}
	selectionsBefore := selectionState()
	baseline, err := sch.PreviewCategory(f.ctx, f.catID, schema.CategoryDraft{})
	if err != nil {
		t.Fatalf("preview unchanged category: %v", err)
	}
	choices := append(append([]string{}, baseline.SelectedFieldIDs...), field.ID)
	preview, err := sch.PreviewCategory(f.ctx, f.catID, schema.CategoryDraft{InheritedFieldIDs: &choices})
	if err != nil {
		t.Fatalf("preview inherited field: %v", err)
	}
	if preview.AssetCount != 1 {
		t.Fatalf("asset count = %d, want 1", preview.AssetCount)
	}
	if len(preview.Issues) != 0 {
		t.Fatalf("static addition issues = %+v, want ready preview", preview.Issues)
	}

	name := "Renamed child"
	rename, err := sch.PreviewCategory(f.ctx, f.catID, schema.CategoryDraft{Name: &name})
	if err != nil {
		t.Fatalf("preview rename: %v", err)
	}
	if rename.AssetCount != 0 || len(rename.Issues) != 0 || rename.Category.Name != name {
		t.Fatalf("rename preview = %+v, want renamed category without asset effects", rename)
	}
	assetAfter, err := f.svc.Get(f.ctx, created.ID)
	if err != nil {
		t.Fatalf("get asset after previews: %v", err)
	}
	if !reflect.DeepEqual(assetBefore, assetAfter) {
		t.Fatalf("previews changed asset: before=%+v after=%+v", assetBefore, assetAfter)
	}
	categoryAfter, err := sch.GetCategory(f.ctx, f.catID)
	if err != nil {
		t.Fatalf("get category after previews: %v", err)
	}
	if !reflect.DeepEqual(categoryBefore, categoryAfter) {
		t.Fatalf("previews changed category: before=%+v after=%+v", categoryBefore, categoryAfter)
	}
	if selectionsAfter := selectionState(); selectionsAfter != selectionsBefore {
		t.Fatalf("previews changed selections: before=%s after=%s", selectionsBefore, selectionsAfter)
	}
}
