package asset

import (
	"testing"

	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/schema"
)

func TestOverviewCountsEveryStatusIncludingZero(t *testing.T) {
	f := newFixture(t)
	for _, mac := range []string{"001A2B3C4D01", "001A2B3C4D02", "001A2B3C4D03"} {
		if _, err := f.save(t, SaveInput{Attrs: map[string]any{"mac": mac}}); err != nil {
			t.Fatal(err)
		}
	}

	ov, err := f.svc.Overview(f.ctx)
	if err != nil {
		t.Fatalf("overview: %v", err)
	}
	if ov.Total != 3 {
		t.Errorf("total = %d, want 3", ov.Total)
	}
	// A card that disappears at zero makes the row jump around as stock moves.
	if len(ov.StatusCounts) != len(model.BuiltinStatuses) {
		t.Fatalf("got %d status entries, want %d", len(ov.StatusCounts), len(model.BuiltinStatuses))
	}
	byStatus := map[model.AssetStatus]int{}
	for _, sc := range ov.StatusCounts {
		byStatus[sc.Status] = sc.Count
	}
	if byStatus[model.StatusInStock] != 3 {
		t.Errorf("in_stock = %d, want 3", byStatus[model.StatusInStock])
	}
	if byStatus[model.StatusLost] != 0 {
		t.Errorf("lost should be present at zero, got %d", byStatus[model.StatusLost])
	}
}

func TestOverviewRollsDescendantsIntoTheirRoot(t *testing.T) {
	f := newFixture(t)

	// The fixture's category is already a child of a root; add a grandchild.
	child, err := f.schema.CreateCategory(f.ctx, schema.CreateCategoryInput{
		Code: "EDGE", Name: "边缘型", ParentID: &f.catID,
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.save(t, SaveInput{Attrs: map[string]any{"mac": "001A2B3C4D01"}}); err != nil {
		t.Fatal(err)
	}
	if _, err := f.save(t, SaveInput{
		CategoryID: child.ID, Attrs: map[string]any{"mac": "001A2B3C4D02"},
	}); err != nil {
		t.Fatal(err)
	}

	ov, err := f.svc.Overview(f.ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(ov.CategoryDistribution) != 1 {
		t.Fatalf("one top-level category, got %d: %+v", len(ov.CategoryDistribution), ov.CategoryDistribution)
	}
	if ov.CategoryDistribution[0].Count != 2 {
		t.Errorf("the root should carry both descendants, got %d", ov.CategoryDistribution[0].Count)
	}
	if ov.CategoryDistribution[0].Name != "网络设备" {
		t.Errorf("distribution names the root, got %q", ov.CategoryDistribution[0].Name)
	}
}

// "How many SDWAN routers do we have" is a question about usable stock;
// counting written-off units gives a misleadingly large answer.
func TestOverviewLeavesRetiredOutOfTheDistributionButNotTheTotal(t *testing.T) {
	f := newFixture(t)
	a, err := f.save(t, SaveInput{Attrs: map[string]any{"mac": "001A2B3C4D01"}})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.save(t, SaveInput{Attrs: map[string]any{"mac": "001A2B3C4D02"}}); err != nil {
		t.Fatal(err)
	}

	if _, err := f.save(t, SaveInput{
		ID: a.ID, Version: a.Version, Status: model.StatusRetired,
		Attrs: map[string]any{"mac": "001A2B3C4D01"},
	}); err != nil {
		t.Fatalf("retire: %v", err)
	}

	ov, err := f.svc.Overview(f.ctx)
	if err != nil {
		t.Fatal(err)
	}
	if ov.Total != 2 {
		t.Errorf("total keeps the retired device, got %d", ov.Total)
	}
	if ov.CategoryDistribution[0].Count != 1 {
		t.Errorf("the distribution drops it, got %d", ov.CategoryDistribution[0].Count)
	}
	for _, sc := range ov.StatusCounts {
		if sc.Status == model.StatusRetired && sc.Count != 1 {
			t.Errorf("retired card = %d, want 1", sc.Count)
		}
	}
}

func TestOverviewOnAnEmptyDatabase(t *testing.T) {
	f := newFixture(t)
	ov, err := f.svc.Overview(f.ctx)
	if err != nil {
		t.Fatalf("overview: %v", err)
	}
	if ov.Total != 0 {
		t.Errorf("total = %d", ov.Total)
	}
	if len(ov.StatusCounts) != len(model.BuiltinStatuses) {
		t.Error("the cards should exist before any asset does")
	}
	if len(ov.CategoryDistribution) != 1 || ov.CategoryDistribution[0].Count != 0 {
		t.Errorf("a configured but empty category should read zero, got %+v", ov.CategoryDistribution)
	}
}
