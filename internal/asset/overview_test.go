package asset

import (
	"fmt"
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

// The tree count is what the categories page puts beside every node, and it
// has to agree with the overview exactly (024 FR-007). These four tests pin
// the two ways it can be wrong without looking wrong.

// Every level on the chain gets the device, and gets it once. AncestorIDs
// already includes the category itself, so an implementation that appends the
// id again doubles every leaf -- and leaves the root looking roughly right,
// which is the hardest version to spot from the numbers.
func TestSubtreeCountsAddOncePerLevel(t *testing.T) {
	f := newFixture(t)
	grand, err := f.schema.CreateCategory(f.ctx, schema.CreateCategoryInput{
		Code: "EDGE", Name: "边缘型", ParentID: &f.catID,
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.save(t, SaveInput{
		CategoryID: grand.ID, Attrs: map[string]any{"mac": "001A2B3C4D01"},
	}); err != nil {
		t.Fatal(err)
	}

	counts, err := f.svc.SubtreeCountsByCategory(f.ctx)
	if err != nil {
		t.Fatal(err)
	}
	for _, c := range []struct {
		id   string
		what string
	}{{f.rootID, "root"}, {f.catID, "middle"}, {grand.ID, "leaf"}} {
		if counts[c.id] != 1 {
			t.Errorf("%s = %d, want 1 (one device, counted once at each level)", c.what, counts[c.id])
		}
	}
}

// A category counts what hangs off it directly, not only what its children
// hold. The mirror image of the bug above: drop the category itself from the
// chain and every parent under-reports by exactly its own devices.
func TestSubtreeCountsIncludeTheCategoryItself(t *testing.T) {
	f := newFixture(t)
	if _, err := f.save(t, SaveInput{
		CategoryID: f.rootID, Attrs: map[string]any{"mac": "001A2B3C4D01"},
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := f.save(t, SaveInput{
		CategoryID: f.rootID, Attrs: map[string]any{"mac": "001A2B3C4D02"},
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := f.save(t, SaveInput{Attrs: map[string]any{"mac": "001A2B3C4D03"}}); err != nil {
		t.Fatal(err)
	}

	counts, err := f.svc.SubtreeCountsByCategory(f.ctx)
	if err != nil {
		t.Fatal(err)
	}
	if counts[f.rootID] != 3 {
		t.Errorf("root = %d, want 3 (its own two plus the child's one)", counts[f.rootID])
	}
	if counts[f.catID] != 1 {
		t.Errorf("child = %d, want 1", counts[f.catID])
	}
}

// The same statuses the overview leaves out. "How many of these do we have"
// is a question about usable stock at both ends of the system.
func TestSubtreeCountsLeaveOutWhatTheDistributionLeavesOut(t *testing.T) {
	f := newFixture(t)
	a, err := f.save(t, SaveInput{Attrs: map[string]any{"mac": "001A2B3C4D01"}})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.save(t, SaveInput{
		ID: a.ID, Version: a.Version, Status: model.StatusRetired,
		Attrs: map[string]any{"mac": "001A2B3C4D01"},
	}); err != nil {
		t.Fatal(err)
	}

	counts, err := f.svc.SubtreeCountsByCategory(f.ctx)
	if err != nil {
		t.Fatal(err)
	}
	if counts[f.rootID] != 0 || counts[f.catID] != 0 {
		t.Errorf("retired counts nowhere, got root=%d child=%d", counts[f.rootID], counts[f.catID])
	}
}

// The two numbers are compared against each other, not each against a
// constant. Two tests asserting `== 3` would both pass on the day the two
// paths start disagreeing, because a fixture change moves both constants and
// nothing notices the drift.
func TestOverviewAndSubtreeCountsAgreeByConstruction(t *testing.T) {
	f := newFixture(t)
	grand, err := f.schema.CreateCategory(f.ctx, schema.CreateCategoryInput{
		Code: "EDGE", Name: "边缘型", ParentID: &f.catID,
	})
	if err != nil {
		t.Fatal(err)
	}
	for i, cat := range []string{f.rootID, f.catID, grand.ID, grand.ID} {
		if _, err := f.save(t, SaveInput{
			CategoryID: cat, Attrs: map[string]any{"mac": fmt.Sprintf("001A2B3C4D0%d", i+1)},
		}); err != nil {
			t.Fatal(err)
		}
	}

	ov, err := f.svc.Overview(f.ctx)
	if err != nil {
		t.Fatal(err)
	}
	counts, err := f.svc.SubtreeCountsByCategory(f.ctx)
	if err != nil {
		t.Fatal(err)
	}
	for _, cc := range ov.CategoryDistribution {
		if counts[cc.CategoryID] != cc.Count {
			t.Errorf("%s: overview says %d, the tree says %d -- one category cannot have two answers",
				cc.Name, cc.Count, counts[cc.CategoryID])
		}
	}
}
