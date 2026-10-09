package schema

import (
	"errors"
	"testing"

	"github.com/klskk23/nexus-assets/internal/model"
)

func TestInheritanceSearchRebuildUsesFieldIdentity(t *testing.T) {
	s, ctx := newStore(t)
	root, child := tree(t, s, ctx)
	sibling, err := s.CreateCategory(ctx, CreateCategoryInput{Code: "OTHER", Name: "Other"})
	if err != nil {
		t.Fatal(err)
	}
	mine, err := s.CreateField(ctx, CreateFieldInput{Key: "shared", Label: "Mine", Type: model.FieldText, CategoryIDs: []string{root.ID}})
	if err != nil {
		t.Fatal(err)
	}
	theirs, err := s.CreateField(ctx, CreateFieldInput{Key: "shared", Label: "Theirs", Type: model.FieldText, CategoryIDs: []string{sibling.ID}, Searchable: true})
	if err != nil {
		t.Fatal(err)
	}
	seedAsset(t, s, ctx, root.ID, "live", `{"shared":"live"}`)
	seedAsset(t, s, ctx, child.ID, "archived", `{"shared":"archived"}`)
	seedAsset(t, s, ctx, sibling.ID, "sibling", `{"shared":"sibling"}`)
	on, off := true, false
	if _, err := s.UpdateField(ctx, theirs.ID, UpdateFieldInput{Searchable: &off}); err != nil {
		t.Fatal(err)
	}
	if _, err := s.UpdateField(ctx, theirs.ID, UpdateFieldInput{Searchable: &on}); err != nil {
		t.Fatal(err)
	}
	for _, enabled := range []bool{true, false, true} {
		if _, err := s.UpdateField(ctx, mine.ID, UpdateFieldInput{Searchable: &enabled}); err != nil {
			t.Fatal(err)
		}
		var siblingCount, archivedCount, liveCount int
		for id, dest := range map[string]*int{"sibling": &siblingCount, "archived": &archivedCount, "live": &liveCount} {
			if err := s.db.ReadDB().QueryRowContext(ctx, `SELECT count(*) FROM asset_search_values WHERE asset_id = ? AND field_key = 'shared'`, id).Scan(dest); err != nil {
				t.Fatal(err)
			}
		}
		wantLive := 0
		if enabled {
			wantLive = 1
		}
		if siblingCount != 1 || archivedCount != 0 || liveCount != wantLive {
			t.Fatalf("searchable=%v: sibling=%d archived=%d live=%d", enabled, siblingCount, archivedCount, liveCount)
		}
	}
}

func TestInheritanceDeleteProtectsUnboundArchivedValues(t *testing.T) {
	s, ctx := newStore(t)
	root, _ := tree(t, s, ctx)
	field, err := s.CreateField(ctx, CreateFieldInput{Key: "retired", Label: "Retired", Type: model.FieldText})
	if err != nil {
		t.Fatal(err)
	}
	seedAsset(t, s, ctx, root.ID, "archived", `{"retired":"keep me"}`)
	_, blockers, total, err := s.DeleteField(ctx, field.ID)
	if !errors.Is(err, ErrFieldInUse) || total != 1 || len(blockers) != 1 {
		t.Fatalf("unbound archived guard: blockers=%v total=%d err=%v", blockers, total, err)
	}
}

func TestInheritanceDeleteDoesNotRemoveSiblingSameKey(t *testing.T) {
	s, ctx := newStore(t)
	root, _ := tree(t, s, ctx)
	other, err := s.CreateCategory(ctx, CreateCategoryInput{Code: "OTHER", Name: "Other"})
	if err != nil {
		t.Fatal(err)
	}
	mine, err := s.CreateField(ctx, CreateFieldInput{Key: "shared", Label: "Mine", Type: model.FieldText, CategoryIDs: []string{root.ID}})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = s.CreateField(ctx, CreateFieldInput{Key: "shared", Label: "Other", Type: model.FieldText, CategoryIDs: []string{other.ID}}); err != nil {
		t.Fatal(err)
	}
	seedAsset(t, s, ctx, other.ID, "sibling", `{"shared":"retain"}`)
	if _, _, _, err = s.DeleteField(ctx, mine.ID); err != nil {
		t.Fatal(err)
	}
	var value string
	if err = s.db.ReadDB().QueryRowContext(ctx, `SELECT json_extract(attrs,'$.shared') FROM assets WHERE id='sibling'`).Scan(&value); err != nil {
		t.Fatal(err)
	}
	if value != "retain" {
		t.Fatalf("sibling value lost: %q", value)
	}
}

func TestInheritanceFieldFilterUsesSelectionsNotAncestorPaths(t *testing.T) {
	s, ctx := newStore(t)
	root, child := tree(t, s, ctx)
	field, err := s.CreateField(ctx, CreateFieldInput{Key: "chosen", Label: "Chosen", Type: model.FieldText, CategoryIDs: []string{root.ID}})
	if err != nil {
		t.Fatal(err)
	}
	page, err := s.ListFieldPage(ctx, FieldFilter{CategoryID: child.ID, Limit: 50})
	if err != nil || page.Total != 0 {
		t.Fatalf("unselected page=%+v err=%v", page, err)
	}
	selectFixtureFields(t, s, ctx, child.ID, field.ID)
	page, err = s.ListFieldPage(ctx, FieldFilter{CategoryID: child.ID, Limit: 50})
	if err != nil || page.Total != 1 || page.Items[0].ID != field.ID {
		t.Fatalf("selected page=%+v err=%v", page, err)
	}
	direct, err := s.BoundCategories(ctx)
	if err != nil || len(direct[field.ID]) != 1 || direct[field.ID][0] != root.ID {
		t.Fatalf("direct bindings=%v err=%v", direct, err)
	}
}

func TestInheritanceReferrersDoNotCrossDisjointModels(t *testing.T) {
	s, ctx := newStore(t)
	tree(t, s, ctx)
	m1, m2 := modelOn(t, s, ctx, "One"), modelOn(t, s, ctx, "Two")
	mine, err := s.CreateField(ctx, CreateFieldInput{Key: "input", Label: "Mine", Type: model.FieldText, ModelIDs: []string{m1.ID}})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = s.CreateField(ctx, CreateFieldInput{Key: "input", Label: "Theirs", Type: model.FieldText, ModelIDs: []string{m2.ID}}); err != nil {
		t.Fatal(err)
	}
	if _, err = s.CreateField(ctx, CreateFieldInput{Key: "derived", Label: "Derived", Type: model.FieldComputed, Options: model.FieldOptions{Template: `upper(attrs.input)`}, ModelIDs: []string{m2.ID}}); err != nil {
		t.Fatal(err)
	}
	refs, err := s.ReferrersOf(ctx, mine.ID, mine.Key)
	if err != nil || len(refs) != 0 {
		t.Fatalf("disjoint readers=%v err=%v", refs, err)
	}
}

func TestInheritanceFieldAssetCountDeduplicatesActualReach(t *testing.T) {
	s, ctx := newStore(t)
	root, child := tree(t, s, ctx)
	field, err := s.CreateField(ctx, CreateFieldInput{Key: "counted", Label: "Counted", Type: model.FieldText, CategoryIDs: []string{root.ID}})
	if err != nil {
		t.Fatal(err)
	}
	seedAsset(t, s, ctx, root.ID, "root-count", `{}`)
	seedAsset(t, s, ctx, child.ID, "child-count", `{}`)
	if count, err := s.FieldAssetCount(ctx, field.ID); err != nil || count != 1 {
		t.Fatalf("unselected count=%d err=%v", count, err)
	}
	selectFixtureFields(t, s, ctx, child.ID, field.ID)
	if count, err := s.FieldAssetCount(ctx, field.ID); err != nil || count != 2 {
		t.Fatalf("selected count=%d err=%v", count, err)
	}
	vendor, err := s.CreateVendor(ctx, "Maker")
	if err != nil {
		t.Fatal(err)
	}
	m, err := s.CreateModel(ctx, CreateModelInput{Name: "Model", VendorID: vendor.ID})
	if err != nil {
		t.Fatal(err)
	}
	device, err := s.CreateField(ctx, CreateFieldInput{Key: "device_count", Label: "Device", Type: model.FieldText, ModelIDs: []string{m.ID}, VendorIDs: []string{vendor.ID}})
	if err != nil {
		t.Fatal(err)
	}
	setModel(t, s, ctx, m.ID, "child-count")
	if count, err := s.FieldAssetCount(ctx, device.ID); err != nil || count != 1 {
		t.Fatalf("deduplicated count=%d err=%v", count, err)
	}
	if _, err := s.FieldAssetCount(ctx, "missing"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("missing count error=%v", err)
	}
}
