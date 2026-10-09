package httpapi

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"

	"github.com/klskk23/nexus-assets/internal/asset"
	"github.com/klskk23/nexus-assets/internal/authz"
	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/schema"
)

func TestFieldAssetCountHTTPSelectedCategoryReach(t *testing.T) {
	h := newHarness(t)
	field, err := h.schema.CreateField(h.ctx, schema.CreateFieldInput{Key: "counted", Label: "Counted", Type: model.FieldText, CategoryIDs: []string{h.catID}})
	if err != nil {
		t.Fatal(err)
	}
	selected := []string{field.ID}
	child := countCategory(t, h, "CH", &h.catID, &selected)
	leaf := countCategory(t, h, "LEAF", &child.ID, &selected)
	skipped := countCategory(t, h, "SKIP", &h.catID, nil)
	h.seed(t, 1, 2)
	for _, id := range []string{child.ID, leaf.ID, skipped.ID} {
		saveCountAsset(t, h, id, nil, nil)
	}
	requireFieldCount(t, h, field.ID, 4)
	unbound, err := h.schema.CreateField(h.ctx, schema.CreateFieldInput{Key: "unbound", Label: "Unbound", Type: model.FieldText})
	if err != nil {
		t.Fatal(err)
	}
	requireFieldCount(t, h, unbound.ID, 0)
	// Filtering uses effective reach, but the binding column stays a direct fact.
	for _, tc := range []struct {
		id   string
		want int
	}{{child.ID, 1}, {leaf.ID, 1}, {skipped.ID, 0}} {
		rec := h.get(t, "/api/fields?category_id="+tc.id)
		requireInheritanceStatus(t, rec, 200)
		var page struct {
			Items []struct {
				ID          string   `json:"id"`
				CategoryIDs []string `json:"category_ids"`
			} `json:"items"`
			Total int `json:"total"`
		}
		if err := json.Unmarshal(rec.Body.Bytes(), &page); err != nil {
			t.Fatal(err)
		}
		if page.Total != tc.want || len(page.Items) != tc.want {
			t.Fatalf("effective field filter=%+v", page)
		}
		if tc.want != 0 && (page.Items[0].ID != field.ID || !reflect.DeepEqual(page.Items[0].CategoryIDs, []string{h.catID})) {
			t.Fatalf("inheritance became a direct binding: %+v", page)
		}
	}
}

func TestFieldAssetCountHTTPDeduplicatesModelVendorReach(t *testing.T) {
	h := newHarness(t)
	vendor, err := h.schema.CreateVendor(h.ctx, "Count vendor")
	if err != nil {
		t.Fatal(err)
	}
	first, err := h.schema.CreateModel(h.ctx, schema.CreateModelInput{Name: "First", VendorID: vendor.ID})
	if err != nil {
		t.Fatal(err)
	}
	second, err := h.schema.CreateModel(h.ctx, schema.CreateModelInput{Name: "Second", VendorID: vendor.ID})
	if err != nil {
		t.Fatal(err)
	}
	other, err := h.schema.CreateModel(h.ctx, schema.CreateModelInput{Name: "Other"})
	if err != nil {
		t.Fatal(err)
	}
	field, err := h.schema.CreateField(h.ctx, schema.CreateFieldInput{Key: "device_count", Label: "Counted", Type: model.FieldText, ModelIDs: []string{first.ID}, VendorIDs: []string{vendor.ID}})
	if err != nil {
		t.Fatal(err)
	}
	a := countCategory(t, h, "A", nil, nil)
	b := countCategory(t, h, "B", nil, nil)
	for i, id := range []*string{&first.ID, &first.ID, &second.ID, &other.ID, nil} {
		category := a.ID
		if i%2 == 1 {
			category = b.ID
		}
		saveCountAsset(t, h, category, id, nil)
	}
	requireFieldCount(t, h, field.ID, 3)
}

func TestFieldAssetCountHTTPReadAuthAndLocalizedNotFound(t *testing.T) {
	h := newHarness(t)
	h.seed(t, 1, 1)
	token := h.asRole(t, authz.UserRoleID)
	before := inheritanceHTTPState(t, h)
	path := "/api/fields/" + h.snFieldID + "/asset-count"
	rec := h.doAs(t, token, http.MethodGet, path, "")
	requireInheritanceStatus(t, rec, 200)
	if got := decode[struct {
		Count int `json:"count"`
	}](t, rec); got.Count != 1 {
		t.Fatalf("reader count=%+v", got)
	}
	rec = httptest.NewRecorder()
	h.router.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
	requireInheritanceStatus(t, rec, 401)
	for _, tc := range []struct{ lang, text string }{{"en", "No such record"}, {"zh", "找不到"}} {
		rec := h.doLang(t, tc.lang, http.MethodGet, "/api/fields/missing/asset-count", "")
		requireInheritanceStatus(t, rec, 404)
		got := decode[Envelope](t, rec).Error
		if got.Code != "not_found" || !strings.Contains(got.Message, tc.text) {
			t.Fatalf("localized missing field=%+v", got)
		}
	}
	if inheritanceHTTPState(t, h) != before {
		t.Fatal("read-only count changed data or audit")
	}
}

func requireFieldCount(t *testing.T, h *harness, id string, want int) {
	t.Helper()
	rec := h.get(t, "/api/fields/"+id+"/asset-count")
	requireInheritanceStatus(t, rec, 200)
	got := decode[struct {
		Count int `json:"count"`
	}](t, rec)
	if got.Count != want {
		t.Fatalf("count=%d want=%d", got.Count, want)
	}
}

func countCategory(t *testing.T, h *harness, code string, parent *string, selected *[]string) model.Category {
	t.Helper()
	cat, err := h.schema.CreateCategory(h.ctx, schema.CreateCategoryInput{Code: code, Name: code, ParentID: parent, InheritedFieldIDs: selected})
	if err != nil {
		t.Fatal(err)
	}
	return cat
}

func saveCountAsset(t *testing.T, h *harness, category string, modelID *string, attrs map[string]any) model.Asset {
	t.Helper()
	got, err := h.assets.Save(h.ctx, asset.SaveInput{CategoryID: category, ModelID: modelID, Status: model.StatusInStock, OwnerID: h.userID, Holder: model.Holder{Type: model.HolderTypeEntity, ID: h.locID}, Attrs: attrs, ActorID: h.userID})
	if err != nil {
		t.Fatal(fmt.Errorf("save counted asset: %w", err))
	}
	return got
}
