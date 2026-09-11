package asset

import (
	"fmt"
	"testing"

	"github.com/klskk23/nexus-assets/internal/auth"
	"github.com/klskk23/nexus-assets/internal/holder"
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

// The model count and the category count take the same view of one device.
//
// Compared against each other rather than each against a constant: two tests
// asserting 2 both stay green on the day one path starts counting written-off
// units and the other does not. A model reading 42 inside a category that has
// already left a retired unit out is a difference the interface cannot explain
// and every reader reports as a broken ledger (024 settled this for
// categories; a model is the same question asked one level down).
func TestModelCountsAndCategoryCountsAgreeOnWhatCounts(t *testing.T) {
	f := newFixture(t)
	m, err := f.schema.CreateModel(f.ctx, schema.CreateModelInput{
		Name: "R640",
	})
	if err != nil {
		t.Fatal(err)
	}

	a, err := f.save(t, SaveInput{ModelID: &m.ID, Attrs: map[string]any{"mac": "001A2B3C4D01"}})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.save(t, SaveInput{
		ModelID: &m.ID, Attrs: map[string]any{"mac": "001A2B3C4D02"},
	}); err != nil {
		t.Fatal(err)
	}

	byModel, err := f.svc.CountsByModel(f.ctx)
	if err != nil {
		t.Fatal(err)
	}
	byCategory, err := f.svc.SubtreeCountsByCategory(f.ctx)
	if err != nil {
		t.Fatal(err)
	}
	// Every device here carries this model and sits in this category, so the
	// two numbers are answers to the same question and must match.
	if byModel[m.ID] != byCategory[f.catID] {
		t.Fatalf("model says %d, category says %d", byModel[m.ID], byCategory[f.catID])
	}

	// Retire one and they must move together.
	if _, err := f.save(t, SaveInput{
		ID: a.ID, Version: a.Version, ModelID: &m.ID, Status: model.StatusRetired,
		Attrs: map[string]any{"mac": "001A2B3C4D01"},
	}); err != nil {
		t.Fatal(err)
	}
	byModel, _ = f.svc.CountsByModel(f.ctx)
	byCategory, _ = f.svc.SubtreeCountsByCategory(f.ctx)
	if byModel[m.ID] != byCategory[f.catID] {
		t.Errorf("after retiring one: model %d, category %d -- the two filters have drifted",
			byModel[m.ID], byCategory[f.catID])
	}
	if byModel[m.ID] != 1 {
		t.Errorf("the retired device should be out, got %d", byModel[m.ID])
	}
}

// Present at zero, for the reason every count here is.
func TestModelCountsIncludeModelsWithNothingOnThem(t *testing.T) {
	f := newFixture(t)
	m, err := f.schema.CreateModel(f.ctx, schema.CreateModelInput{
		Name: "Unused",
	})
	if err != nil {
		t.Fatal(err)
	}
	counts, err := f.svc.CountsByModel(f.ctx)
	if err != nil {
		t.Fatal(err)
	}
	if n, ok := counts[m.ID]; !ok || n != 0 {
		t.Errorf("want present at 0, got %d (present: %v)", n, ok)
	}
}

// holderTree builds 国药集团 → 研发部 → 三楼实验室, plus an empty sibling
// warehouse, and returns their ids.
//
// Three levels because that is the deepest the hierarchy rules allow and the
// bug this guards against -- rolling up one level and stopping -- is invisible
// at two.
func holderTree(t *testing.T, f *fixture) (company, dept, lab, empty string) {
	t.Helper()
	co, err := f.holders.Create(f.ctx, holder.CreateInput{Type: model.EntityCompany, Name: "国药集团"})
	if err != nil {
		t.Fatalf("create company: %v", err)
	}
	d, err := f.holders.Create(f.ctx, holder.CreateInput{
		Type: model.EntityDepartment, Name: "研发部", ParentID: &co.ID,
	})
	if err != nil {
		t.Fatalf("create department: %v", err)
	}
	l, err := f.holders.Create(f.ctx, holder.CreateInput{
		Type: model.EntityLocation, Name: "三楼实验室", ParentID: &d.ID,
	})
	if err != nil {
		t.Fatalf("create lab: %v", err)
	}
	e, err := f.holders.Create(f.ctx, holder.CreateInput{
		Type: model.EntityLocation, Name: "外包机房", ParentID: &co.ID,
	})
	if err != nil {
		t.Fatalf("create empty location: %v", err)
	}
	return co.ID, d.ID, l.ID, e.ID
}

// The number beside a holder is its whole subtree, not what it is holding
// itself.
//
// A company holds nothing directly -- devices sit at the locations under it --
// so a count that stops at the node shows 0 on every company and department in
// the tree, which reads as "we have nothing here" about the part of the
// hierarchy people navigate by.
func TestHolderSubtreeCountsRollUpEveryLevel(t *testing.T) {
	f := newFixture(t)
	company, dept, lab, empty := holderTree(t, f)

	for i, at := range []string{lab, lab, dept} {
		if _, err := f.save(t, SaveInput{
			Attrs:  map[string]any{"mac": fmt.Sprintf("001A2B3C4D%02d", i+1)},
			Holder: model.Holder{Type: model.HolderTypeEntity, ID: at},
		}); err != nil {
			t.Fatal(err)
		}
	}

	counts, err := f.svc.SubtreeCountsByHolder(f.ctx)
	if err != nil {
		t.Fatalf("counts: %v", err)
	}
	for _, c := range []struct {
		id   string
		name string
		want int
	}{
		{company, "国药集团", 3},
		{dept, "研发部", 3},
		{lab, "三楼实验室", 2},
		{empty, "外包机房", 0},
	} {
		if counts[c.id] != c.want {
			t.Errorf("%s = %d, want %d", c.name, counts[c.id], c.want)
		}
	}

	// The empty one has a key rather than being absent: a caller reading a
	// missing key gets the zero value anyway, but a rail that has to tell
	// "loading" from "none" cannot, and a blank where a number belongs reads
	// as the former.
	if _, ok := counts[empty]; !ok {
		t.Error("a holder with nothing in it should still have an entry")
	}
}

// The one place the two counts in this file deliberately disagree.
//
// A category is asked "how many working ones do we have" and drops the
// written-off. A holder is asked "how many are standing here", and a
// written-off device is still stacked in that warehouse waiting for disposal.
// Same device, two questions, two right answers.
func TestHolderCountsKeepWhatTheCategoryCountsDrop(t *testing.T) {
	f := newFixture(t)
	_, _, lab, _ := holderTree(t, f)

	a, err := f.save(t, SaveInput{
		Attrs:  map[string]any{"mac": "001A2B3C4D01"},
		Holder: model.Holder{Type: model.HolderTypeEntity, ID: lab},
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.save(t, SaveInput{
		ID: a.ID, Version: a.Version, CategoryID: a.CategoryID, Status: model.StatusRetired,
		Attrs:  map[string]any{"mac": "001A2B3C4D01"},
		Holder: model.Holder{Type: model.HolderTypeEntity, ID: lab},
	}); err != nil {
		t.Fatalf("retire: %v", err)
	}

	byHolder, err := f.svc.SubtreeCountsByHolder(f.ctx)
	if err != nil {
		t.Fatalf("holder counts: %v", err)
	}
	if byHolder[lab] != 1 {
		t.Errorf("三楼实验室 = %d, want 1 -- a written-off device is still standing there", byHolder[lab])
	}

	byCategory, err := f.svc.SubtreeCountsByCategory(f.ctx)
	if err != nil {
		t.Fatalf("category counts: %v", err)
	}
	if byCategory[f.catID] != 0 {
		t.Errorf("category = %d, want 0 -- the distribution leaves the written-off out", byCategory[f.catID])
	}
}

// A device held by a person is not standing at any holder entity.
//
// holder_id alone would match it if an account and an entity ever shared an
// id, which is why the type travels with it everywhere else in this codebase.
func TestHolderCountsIgnoreDevicesHeldByPeople(t *testing.T) {
	f := newFixture(t)
	company, _, _, _ := holderTree(t, f)

	if _, err := f.save(t, SaveInput{
		Attrs:  map[string]any{"mac": "001A2B3C4D01"},
		Status: model.StatusInUse,
		Holder: model.Holder{Type: model.HolderTypeUser, ID: f.userID},
	}); err != nil {
		t.Fatal(err)
	}

	counts, err := f.svc.SubtreeCountsByHolder(f.ctx)
	if err != nil {
		t.Fatalf("counts: %v", err)
	}
	if counts[company] != 0 {
		t.Errorf("国药集团 = %d, want 0 -- that device is with a person", counts[company])
	}
}

/*
The owner distribution answers the same question the category one does.

They sit side by side on the landing page, so a reader takes them for the same
devices sliced two ways -- and they are, which means both have to drop the
written-off. If one counted them and the other did not, the two columns would
add up to totals differing by an amount nothing on that page explains, and the
person who noticed would have no way to find out which one was lying.

Deliberately the opposite judgement from SubtreeCountsByHolder, and for a
reason that is about the screen rather than the domain: a warehouse is asked
what is standing in it, and these two are asked how much of the working fleet
each slice holds.
*/
func TestOwnerDistributionDropsWhatTheCategoryDistributionDrops(t *testing.T) {
	f := newFixture(t)

	a, err := f.save(t, SaveInput{Attrs: map[string]any{"mac": "001A2B3C4D01"}})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.save(t, SaveInput{Attrs: map[string]any{"mac": "001A2B3C4D02"}}); err != nil {
		t.Fatal(err)
	}
	if _, err := f.save(t, SaveInput{
		ID: a.ID, Version: a.Version, CategoryID: a.CategoryID, Status: model.StatusRetired,
		Attrs: map[string]any{"mac": "001A2B3C4D01"},
	}); err != nil {
		t.Fatalf("retire: %v", err)
	}

	ov, err := f.svc.Overview(f.ctx)
	if err != nil {
		t.Fatalf("overview: %v", err)
	}
	if len(ov.OwnerDistribution) != 1 {
		t.Fatalf("expected one owner, got %+v", ov.OwnerDistribution)
	}
	if got := ov.OwnerDistribution[0].Count; got != 1 {
		t.Errorf("owner count = %d, want 1 -- the written-off one is not part of the working fleet", got)
	}

	// The two slices of the same fleet add up to each other.
	byCategory := 0
	for _, c := range ov.CategoryDistribution {
		byCategory += c.Count
	}
	byOwner := 0
	for _, o := range ov.OwnerDistribution {
		byOwner += o.Count
	}
	if byOwner != byCategory {
		t.Errorf("owners total %d and categories total %d -- one screen, two totals", byOwner, byCategory)
	}
	// And the page's own Total is the other number, every asset there is.
	if ov.Total != 2 {
		t.Errorf("total = %d, want 2 -- that one counts the written-off", ov.Total)
	}
}

// Every asset has an owner (NOT NULL, referencing users), so a device moving
// between people never falls out of this distribution.
func TestOwnerDistributionFollowsAReassignment(t *testing.T) {
	f := newFixture(t)
	other, err := f.users.Create(f.ctx, auth.CreateInput{
		Email: "clerk@example.com", Name: "仓管", AuthType: model.AuthLocal, Password: "correct-horse",
	})
	if err != nil {
		t.Fatalf("create user: %v", err)
	}

	a, err := f.save(t, SaveInput{Attrs: map[string]any{"mac": "001A2B3C4D01"}})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.save(t, SaveInput{
		ID: a.ID, Version: a.Version, CategoryID: a.CategoryID, OwnerID: other.ID,
		Attrs: map[string]any{"mac": "001A2B3C4D01"},
	}); err != nil {
		t.Fatalf("reassign: %v", err)
	}

	ov, err := f.svc.Overview(f.ctx)
	if err != nil {
		t.Fatalf("overview: %v", err)
	}
	if len(ov.OwnerDistribution) != 1 || ov.OwnerDistribution[0].OwnerID != other.ID {
		t.Fatalf("expected the device to be under the new owner, got %+v", ov.OwnerDistribution)
	}
}
