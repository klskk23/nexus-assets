package httpapi

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/klskk23/nexus-assets/internal/model"
)

// A non-unique searchable category field may still be the display key. The
// display value is only a label; every read and write must continue to use the
// asset UUID as the identity.
func TestNonUniqueDisplayKeyKeepsAssetIdentityByUUID(t *testing.T) {
	h := newHarness(t)

	field := decode[struct {
		ID string `json:"id"`
	}](t, h.post(t, "/api/fields", `{
		"key":"rack","label":"机柜位","type":"text","searchable":true,
		"category_ids":["`+h.catID+`"]
	}`))
	if field.ID == "" {
		t.Fatal("the searchable display field should be created")
	}

	if rec := h.patch(t, "/api/categories/"+h.catID, `{"display_key":"rack"}`); rec.Code != http.StatusOK {
		t.Fatalf("a non-unique searchable field should be accepted as display key, got %d: %s", rec.Code, rec.Body.String())
	}

	create := func(mac, rack string) model.Asset {
		rec := h.post(t, "/api/assets", fmt.Sprintf(`{
			"category_id":%q,"status":"in_stock","owner_id":%q,
			"holder_type":"entity","holder_id":%q,
			"attrs":{"mac":%q,"rack":%q}
		}`, h.catID, h.userID, h.locID, mac, rack))
		if rec.Code != http.StatusCreated {
			t.Fatalf("create asset %s: %d %s", mac, rec.Code, rec.Body.String())
		}
		return decode[model.Asset](t, rec)
	}

	first := create("001A2B3C1001", "shared")
	second := create("001A2B3C1002", "shared")
	solo := create("001A2B3C1003", "solo")
	empty := create("001A2B3C1004", "")

	if first.ID == second.ID || first.DisplayName != "shared" || second.DisplayName != "shared" {
		t.Fatalf("duplicate display values must be allowed for distinct assets: first=%+v second=%+v", first, second)
	}
	if empty.DisplayName != model.ShortID(empty.ID) {
		t.Errorf("an empty display value should fall back to the short UUID: got %q, want %q", empty.DisplayName, model.ShortID(empty.ID))
	}

	shared := decode[assetListResponse](t, h.get(t, "/api/assets?q=shared&exact=false"))
	if shared.Total != 2 || len(shared.Items) != 2 {
		t.Fatalf("duplicate non-unique search returned %d rows: %+v", shared.Total, shared.Items)
	}
	if shared.ExactMatchID != "" {
		t.Errorf("duplicate non-unique search must not exact-jump, got %q", shared.ExactMatchID)
	}
	seen := map[string]bool{}
	for _, item := range shared.Items {
		seen[item.ID] = true
	}
	if !seen[first.ID] || !seen[second.ID] {
		t.Errorf("duplicate search returned IDs %v, want %s and %s", seen, first.ID, second.ID)
	}

	single := decode[assetListResponse](t, h.get(t, "/api/assets?q=solo&exact=false"))
	if single.Total != 1 || len(single.Items) != 1 || single.Items[0].ID != solo.ID {
		t.Fatalf("single non-unique search returned %+v", single)
	}
	if single.ExactMatchID != "" {
		t.Errorf("a single non-unique match must not exact-jump, got %q", single.ExactMatchID)
	}

	gotFirst := decode[struct {
		Asset model.Asset `json:"asset"`
	}](t, h.get(t, "/api/assets/"+first.ID)).Asset
	gotSecond := decode[struct {
		Asset model.Asset `json:"asset"`
	}](t, h.get(t, "/api/assets/"+second.ID)).Asset
	if gotFirst.ID != first.ID || gotSecond.ID != second.ID {
		t.Fatalf("GET must address assets by UUID: first=%s second=%s", gotFirst.ID, gotSecond.ID)
	}

	if rec := h.patch(t, "/api/assets/"+first.ID, fmt.Sprintf(`{
		"category_id":%q,"status":"in_stock","owner_id":%q,
		"holder_type":"entity","holder_id":%q,"version":%d,
		"attrs":{"mac":%q,"rack":"edited"}
	}`, h.catID, h.userID, h.locID, gotFirst.Version, gotFirst.Attrs["mac"])); rec.Code != http.StatusOK {
		t.Fatalf("edit by UUID: %d %s", rec.Code, rec.Body.String())
	}
	if got := decode[struct {
		Asset model.Asset `json:"asset"`
	}](t, h.get(t, "/api/assets/"+second.ID)).Asset; got.DisplayName != "shared" {
		t.Errorf("editing one duplicate must not change the other: got %q", got.DisplayName)
	}
	if got := decode[struct {
		Asset model.Asset `json:"asset"`
	}](t, h.get(t, "/api/assets/"+first.ID)).Asset; got.DisplayName != "edited" {
		t.Errorf("edited asset display value = %q, want edited", got.DisplayName)
	}

	if rec := h.post(t, "/api/transfers", `{"asset_ids":["`+first.ID+`"],"to_status":"in_use","to_holder_type":"user","to_holder_id":"`+h.userID+`"}`); rec.Code != http.StatusCreated {
		t.Fatalf("transfer by UUID: %d %s", rec.Code, rec.Body.String())
	}
	if got := decode[struct {
		Asset model.Asset `json:"asset"`
	}](t, h.get(t, "/api/assets/"+second.ID)).Asset; got.Status != model.StatusInStock {
		t.Errorf("transferring one duplicate must not move the other: status = %q", got.Status)
	}
	if got := decode[struct {
		Asset model.Asset `json:"asset"`
	}](t, h.get(t, "/api/assets/"+first.ID)).Asset; got.Status != model.StatusInUse {
		t.Errorf("transferred asset status = %q, want %q", got.Status, model.StatusInUse)
	}

	if rec := h.do(t, http.MethodDelete, "/api/assets/"+first.ID+"?confirm=edited", ""); rec.Code != http.StatusNoContent {
		t.Fatalf("delete by UUID: %d %s", rec.Code, rec.Body.String())
	}
	if rec := h.get(t, "/api/assets/"+first.ID); rec.Code != http.StatusNotFound {
		t.Fatalf("deleted UUID should be gone, got %d: %s", rec.Code, rec.Body.String())
	}
	if rec := h.get(t, "/api/assets/"+second.ID); rec.Code != http.StatusOK {
		t.Fatalf("deleting one duplicate must keep the other: %d %s", rec.Code, rec.Body.String())
	}
}
