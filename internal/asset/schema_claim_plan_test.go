package asset

import (
	"context"
	"database/sql"
	"reflect"
	"slices"
	"testing"

	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/schema"
)

// Excluding affected assets from old occupancy must not exclude their final
// claims from collision detection. Normalization happens before that comparison.
func TestSchemaEffectsRejectsBatchFinalClaimCollision(t *testing.T) {
	f := newFixture(t)
	sch := schema.NewWithEffects(f.svc.db, NewSchemaEffects())
	f.svc = NewService(f.svc.db, sch)
	field, err := sch.CreateField(f.ctx, schema.CreateFieldInput{
		Key: "rack_mac", Label: "Rack MAC", Type: model.FieldMAC, IsUnique: true, CategoryIDs: []string{f.rootID},
	})
	if err != nil {
		t.Fatal(err)
	}
	var ids []string
	for _, mac := range []string{"001A2B3C4D5E", "001A2B3C4D5F"} {
		a, err := f.save(t, SaveInput{Attrs: map[string]any{"mac": mac}})
		if err != nil {
			t.Fatal(err)
		}
		ids = append(ids, a.ID)
	}
	if err := f.svc.db.Write(f.ctx, func(ctx context.Context, tx *sql.Tx) error {
		for i, value := range []string{"00:AA:BB:CC:DD:EE", "00AABBCCDDEE"} {
			if _, err := tx.ExecContext(ctx, `UPDATE assets SET attrs = json_set(attrs, '$.rack_mac', ?) WHERE id = ?`, value, ids[i]); err != nil {
				return err
			}
		}
		return nil
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
	if err != nil {
		t.Fatal(err)
	}
	if preview.AssetCount != 2 || len(preview.Issues) != 1 {
		t.Fatalf("batch preview = %+v, want two assets and one collision", preview)
	}
	slices.Sort(ids)
	issue := preview.Issues[0]
	if issue.Code != "unique_conflict" || issue.FieldID != field.ID || issue.AssetID != ids[1] || issue.ConflictAssetID != ids[0] {
		t.Fatalf("batch collision issue = %+v", issue)
	}
	if !reflect.DeepEqual(before, preparedAssetState(t, f)) {
		t.Fatal("collision preview changed asset data")
	}
	name := "Must not commit"
	if _, err := sch.UpdateCategory(f.ctx, f.catID, schema.UpdateCategoryInput{Name: &name, InheritedFieldIDs: &selected}); err == nil {
		t.Fatal("batch collision was accepted")
	}
	if !reflect.DeepEqual(before, preparedAssetState(t, f)) {
		t.Fatal("batch collision left partial asset effects")
	}
	current, err := sch.PreviewCategory(f.ctx, f.catID, schema.CategoryDraft{})
	if err != nil || !reflect.DeepEqual(current.Category, baseline.Category) || !reflect.DeepEqual(current.SelectedFieldIDs, baseline.SelectedFieldIDs) {
		t.Fatalf("batch collision changed metadata or selections: %+v, %v", current, err)
	}
}
