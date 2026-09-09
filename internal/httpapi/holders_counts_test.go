package httpapi

import (
	"encoding/json"
	"fmt"
	"net/http"
	"testing"

	"github.com/klskk23/nexus-assets/internal/asset"
	"github.com/klskk23/nexus-assets/internal/holder"
	"github.com/klskk23/nexus-assets/internal/model"
)

// A company, a department under it, two locations, one of them empty.
//
// Three levels because that is the deepest the hierarchy rules allow, and a
// roll-up that stops after one level looks correct at two.
func seedHolderTree(t *testing.T, h *harness) (company, dept, lab, empty string) {
	t.Helper()
	co, err := h.holders.Create(h.ctx, holder.CreateInput{Type: model.EntityCompany, Name: "国药集团"})
	if err != nil {
		t.Fatalf("create company: %v", err)
	}
	d, err := h.holders.Create(h.ctx, holder.CreateInput{
		Type: model.EntityDepartment, Name: "研发部", ParentID: &co.ID,
	})
	if err != nil {
		t.Fatalf("create department: %v", err)
	}
	l, err := h.holders.Create(h.ctx, holder.CreateInput{
		Type: model.EntityLocation, Name: "三楼实验室", ParentID: &d.ID,
	})
	if err != nil {
		t.Fatalf("create lab: %v", err)
	}
	e, err := h.holders.Create(h.ctx, holder.CreateInput{
		Type: model.EntityLocation, Name: "外包机房", ParentID: &co.ID,
	})
	if err != nil {
		t.Fatalf("create empty: %v", err)
	}
	return co.ID, d.ID, l.ID, e.ID
}

func (h *harness) putAt(t *testing.T, holderID, mac string, status model.AssetStatus) {
	t.Helper()
	if _, err := h.assets.Save(h.ctx, asset.SaveInput{
		CategoryID: h.catID, Status: status, OwnerID: h.userID,
		Holder:  model.Holder{Type: model.HolderTypeEntity, ID: holderID},
		Attrs:   map[string]any{"mac": mac},
		ActorID: h.userID,
	}); err != nil {
		t.Fatalf("put device at %s: %v", holderID, err)
	}
}

/*
The number on the rail and the list it links to, compared against each other.

The subtree is spelled out twice on the server -- once as a roll-up for the
counts, once as a subquery for the filter -- because a count wants every
holder at once and a filter has to compose into one WHERE clause. Two
spellings of one idea is the shape this codebase keeps getting burned by, and
a comment in each pointing at the other is not a guard.

Compared to each other rather than to constants, for the same reason
categoryCounts.test.tsx gives: two assertions of "3" would both stay green on
the day the two paths start disagreeing, because whoever changed the fixture
would change both numbers. Each of them being wrong is possible; both being
wrong in the same way is not.

Every holder in the tree, not a sample: the roll-up and the recursion can
agree at the leaves and part company at the root, which is exactly the level
somebody navigates by.
*/
func TestHolderCountsAgreeWithTheFilteredList(t *testing.T) {
	h := newHarness(t)
	company, dept, lab, empty := seedHolderTree(t, h)

	h.putAt(t, lab, "001A2B3C4D01", model.StatusInStock)
	h.putAt(t, lab, "001A2B3C4D02", model.StatusRetired)
	h.putAt(t, dept, "001A2B3C4D03", model.StatusInStock)
	h.putAt(t, h.locID, "001A2B3C4D04", model.StatusInStock)

	rec := h.get(t, "/api/holders/counts")
	if rec.Code != http.StatusOK {
		t.Fatalf("counts returned %d: %s", rec.Code, rec.Body.String())
	}
	counts := decode[map[string]int](t, rec)

	for _, c := range []struct {
		id   string
		name string
	}{
		{company, "国药集团"},
		{dept, "研发部"},
		{lab, "三楼实验室"},
		{empty, "外包机房"},
		{h.locID, "上海仓库"},
	} {
		listed := decode[struct {
			Total int `json:"total"`
		}](t, h.get(t, fmt.Sprintf(
			"/api/assets?holder_type=entity&holder_id=%s&holder_include_descendants=true&limit=1", c.id)))

		if counts[c.id] != listed.Total {
			t.Errorf("%s: the rail says %d and the list it links to has %d",
				c.name, counts[c.id], listed.Total)
		}
	}
}

// The written-off device is in the holder's number, because it is still
// standing in that room. The category distribution leaves it out, because that
// one is asked how many working ones there are. Both readings are on this one
// response, so a change to either shows up here.
func TestHolderCountsKeepTheWrittenOffAndCategoryCountsDoNot(t *testing.T) {
	h := newHarness(t)
	_, _, lab, _ := seedHolderTree(t, h)
	h.putAt(t, lab, "001A2B3C4D01", model.StatusRetired)

	byHolder := decode[map[string]int](t, h.get(t, "/api/holders/counts"))
	if byHolder[lab] != 1 {
		t.Errorf("三楼实验室 = %d, want 1 -- it is still standing there", byHolder[lab])
	}

	byCategory := decode[map[string]int](t, h.get(t, "/api/categories/counts"))
	if byCategory[h.catID] != 0 {
		t.Errorf("category = %d, want 0 -- the distribution leaves the written-off out", byCategory[h.catID])
	}
}

// Without the parameter, holder_id still means that one holder.
//
// Every link and saved filter already out there was written under that
// meaning. This is why the flag could not be the category one, which defaults
// the other way: one switch cannot carry two defaults.
func TestAssetsHolderFilterStillMeansThatHolderAlone(t *testing.T) {
	h := newHarness(t)
	company, _, lab, _ := seedHolderTree(t, h)
	h.putAt(t, lab, "001A2B3C4D01", model.StatusInStock)

	var out struct {
		Total int `json:"total"`
	}
	rec := h.get(t, "/api/assets?holder_type=entity&holder_id="+company+"&limit=1")
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if out.Total != 0 {
		t.Errorf("total = %d, want 0 -- the company itself is holding nothing", out.Total)
	}

	rec = h.get(t, "/api/assets?holder_type=entity&holder_id="+company+"&holder_include_descendants=true&limit=1")
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if out.Total != 1 {
		t.Errorf("total = %d, want 1 -- with the flag, the lab below it counts", out.Total)
	}
}

// A device held by a person is not standing at any holder entity, and the
// subtree filter must not pick it up on the way past.
func TestHolderSubtreeFilterIgnoresDevicesHeldByPeople(t *testing.T) {
	h := newHarness(t)
	company, _, _, _ := seedHolderTree(t, h)
	if _, err := h.assets.Save(h.ctx, asset.SaveInput{
		CategoryID: h.catID, Status: model.StatusInUse, OwnerID: h.userID,
		Holder:  model.Holder{Type: model.HolderTypeUser, ID: h.userID},
		Attrs:   map[string]any{"mac": "001A2B3C4D01"},
		ActorID: h.userID,
	}); err != nil {
		t.Fatal(err)
	}

	listed := decode[struct {
		Total int `json:"total"`
	}](t, h.get(t, "/api/assets?holder_type=entity&holder_id="+company+"&holder_include_descendants=true&limit=1"))
	if listed.Total != 0 {
		t.Errorf("total = %d, want 0 -- that device is with a person", listed.Total)
	}
}
