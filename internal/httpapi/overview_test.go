package httpapi

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/klskk23/nexus-assets/internal/asset"
	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/store"
)

// The cards and the list page must never disagree; two ways of counting the
// same thing is exactly how a dashboard loses people's trust.
func TestStatusCountsMatchTheListEndpoint(t *testing.T) {
	h := newHarness(t)
	h.seed(t, 0, 6)

	ids := decode[assetListResponse](t, h.get(t, "/api/assets?limit=10")).Items
	// Spread them across statuses.
	moves := []struct {
		id     string
		status model.AssetStatus
	}{
		{ids[0].ID, model.StatusInUse},
		{ids[1].ID, model.StatusInUse},
		{ids[2].ID, model.StatusInRepair},
		{ids[3].ID, model.StatusRetired},
	}
	for _, m := range moves {
		body := `{"asset_ids":["` + m.id + `"],"to_status":"` + string(m.status) + `"`
		if m.status == model.StatusInUse {
			body += `,"to_holder_type":"user","to_holder_id":"` + h.userID + `"`
		}
		if rec := h.post(t, "/api/transfers", body+`}`); rec.Code != http.StatusCreated {
			t.Fatalf("move to %s: %s", m.status, rec.Body.String())
		}
	}

	ov := decode[overviewResponse](t, h.get(t, "/api/overview"))

	for _, sc := range ov.StatusCounts {
		list := decode[assetListResponse](t, h.get(t, "/api/assets?status="+string(sc.Status)))
		if sc.Count != list.Total {
			t.Errorf("status %s: overview says %d, the list says %d", sc.Status, sc.Count, list.Total)
		}
	}
	// Every status gets a card even at zero, so they do not appear and vanish.
	if len(ov.StatusCounts) != len(model.AllStatuses) {
		t.Errorf("got %d status cards, want %d", len(ov.StatusCounts), len(model.AllStatuses))
	}
	if ov.Total != 6 {
		t.Errorf("total = %d, want 6", ov.Total)
	}
}

func TestCategoryDistributionRollsUpAndExcludesRetired(t *testing.T) {
	h := newHarness(t)

	// A two-level tree under the harness's root category.
	child := decode[map[string]any](t, h.post(t, "/api/categories",
		`{"code":"EDGE","name":"边缘型","parent_id":"`+h.catID+`"}`))
	childID := child["id"].(string)

	h.seed(t, 0, 3) // three on the root category
	// Two more on the child.
	for i := 100; i < 102; i++ {
		body := fmt.Sprintf(`{"category_id":"%s","owner_id":"%s","holder_type":"entity","holder_id":"%s","attrs":{"mac":"001A2B3C%04X"}}`,
			childID, h.userID, h.locID, i)
		if rec := h.post(t, "/api/assets", body); rec.Code != http.StatusCreated {
			t.Fatalf("seed child asset: %s", rec.Body.String())
		}
	}

	ov := decode[overviewResponse](t, h.get(t, "/api/overview"))
	if len(ov.CategoryDistribution) != 1 {
		t.Fatalf("one top-level category, got %d: %+v", len(ov.CategoryDistribution), ov.CategoryDistribution)
	}
	if ov.CategoryDistribution[0].Count != 5 {
		t.Errorf("the root should roll up its descendants: got %d, want 5", ov.CategoryDistribution[0].Count)
	}

	// Retiring one takes it out of the distribution but not out of the total:
	// "how many do we have" is a question about usable stock.
	first := decode[assetListResponse](t, h.get(t, "/api/assets?limit=1")).Items[0]
	if rec := h.post(t, "/api/transfers",
		`{"asset_ids":["`+first.ID+`"],"to_status":"retired"}`); rec.Code != http.StatusCreated {
		t.Fatalf("retire: %s", rec.Body.String())
	}

	ov = decode[overviewResponse](t, h.get(t, "/api/overview"))
	if ov.CategoryDistribution[0].Count != 4 {
		t.Errorf("a retired device must leave the distribution: got %d, want 4", ov.CategoryDistribution[0].Count)
	}
	if ov.Total != 5 {
		t.Errorf("but it stays in the total: got %d, want 5", ov.Total)
	}
}

// Twenty devices shipped together are one action; listing them twenty times
// would bury everything else that ever happened.
func TestRecentTransfersFoldABatchIntoOneEntry(t *testing.T) {
	h := newHarness(t)
	h.seed(t, 0, 12)

	items := decode[assetListResponse](t, h.get(t, "/api/assets?limit=20")).Items
	ids := make([]string, 0, len(items))
	for _, a := range items {
		ids = append(ids, `"`+a.ID+`"`)
	}
	body := `{"asset_ids":[` + joinStrings(ids, ",") + `],"to_status":"in_use","to_holder_type":"user","to_holder_id":"` + h.userID + `"}`
	if rec := h.post(t, "/api/transfers", body); rec.Code != http.StatusCreated {
		t.Fatalf("batch: %s", rec.Body.String())
	}

	ov := decode[overviewResponse](t, h.get(t, "/api/overview"))

	batches := map[string]int{}
	creates := 0
	for _, tr := range ov.RecentTransfers {
		if tr.BatchID != nil {
			batches[*tr.BatchID]++
		}
		if tr.Kind == model.KindCreate {
			creates++
		}
	}
	if len(batches) != 1 {
		t.Fatalf("expected one folded batch, got %d: %+v", len(batches), batches)
	}
	for id, n := range batches {
		if n != 1 {
			t.Errorf("batch %s appears %d times, should be folded into one", id, n)
		}
	}
	// The fold must leave room for the individual events, not eat the page.
	if creates == 0 {
		t.Error("folding the batch should free space for the creation events")
	}
	if len(ov.RecentTransfers) > recentTransferLimit {
		t.Errorf("got %d entries, limit is %d", len(ov.RecentTransfers), recentTransferLimit)
	}
}

func TestOverviewOnAnEmptySystem(t *testing.T) {
	h := newHarness(t)
	ov := decode[overviewResponse](t, h.get(t, "/api/overview"))
	if ov.Total != 0 {
		t.Errorf("total = %d", ov.Total)
	}
	if len(ov.StatusCounts) != len(model.AllStatuses) {
		t.Error("the cards should still be there at zero")
	}
	if ov.RecentTransfers == nil {
		t.Error("an empty list must serialise as [] rather than null")
	}
}

// The landing page must not get slower as the category tree grows.
func TestOverviewIssuesAConstantNumberOfQueries(t *testing.T) {
	h := newHarness(t)
	h.seed(t, 0, 3)

	count := store.ResetQueryCount()
	if rec := h.get(t, "/api/overview"); rec.Code != http.StatusOK {
		t.Fatalf("overview: %d", rec.Code)
	}
	small := count()

	for i := 0; i < 8; i++ {
		if rec := h.post(t, "/api/categories",
			fmt.Sprintf(`{"code":"C%d","name":"类别%d"}`, i, i)); rec.Code != http.StatusCreated {
			t.Fatal(rec.Body.String())
		}
	}
	count = store.ResetQueryCount()
	if rec := h.get(t, "/api/overview"); rec.Code != http.StatusOK {
		t.Fatalf("overview: %d", rec.Code)
	}
	large := count()

	t.Logf("queries: %d with 1 category, %d with 9", small, large)
	if large != small {
		t.Errorf("query count grew from %d to %d as categories were added; "+
			"something counts per category", small, large)
	}
}

func joinStrings(parts []string, sep string) string {
	out := ""
	for i, p := range parts {
		if i > 0 {
			out += sep
		}
		out += p
	}
	return out
}

var _ = asset.Overview{}
