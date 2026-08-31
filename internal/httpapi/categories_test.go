package httpapi

import (
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"

	"github.com/klskk23/nexus-assets/internal/asset"
	"github.com/klskk23/nexus-assets/internal/schema"
)

// A cycle between expression keys must be refused when the key is bound, not
// discovered when an asset fails to evaluate.
func TestCyclicExpressionKeyRefusedAtBindTime(t *testing.T) {
	h := newHarness(t)

	a := decode[map[string]any](t, h.post(t, "/api/fields",
		`{"key":"a","label":"A","type":"computed","options":{"template":"upper(attrs.b)"}}`))
	if a["id"] == nil {
		t.Fatalf("creating the first half of the cycle should succeed")
	}
	// b reads a, closing the loop. A definition on its own is harmless -- the
	// loop only matters once something has to evaluate it.
	b := h.post(t, "/api/fields",
		`{"key":"b","label":"B","type":"computed","options":{"template":"upper(attrs.a)"}}`)
	if b.Code != http.StatusUnprocessableEntity && b.Code != http.StatusCreated {
		t.Fatalf("unexpected status %d: %s", b.Code, b.Body.String())
	}
	if b.Code == http.StatusUnprocessableEntity {
		return // caught even earlier, which is fine
	}

	catID := decode[map[string]any](t, h.post(t, "/api/categories", `{"code":"CYC","name":"环测"}`))["id"].(string)
	fields := decode[[]map[string]any](t, h.get(t, "/api/fields"))
	var aID string
	for _, f := range fields {
		if f["key"] == "a" {
			aID = f["id"].(string)
		}
	}

	rec := h.post(t, "/api/categories/"+catID+"/bindings", `{"field_id":"`+aID+`"}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("binding a cyclic expression key must be refused, got %d: %s", rec.Code, rec.Body.String())
	}
	if !contains(rec.Body.String(), "循环依赖") {
		t.Errorf("the error should say it is a cycle, got %s", rec.Body.String())
	}
}

// Deleting a field an expression key reads would make every asset in that
// category impossible to save, so it is refused with the referrers listed.
func TestDeletingAReferencedFieldIsRefusedWithReferrers(t *testing.T) {
	h := newHarness(t)

	fields := decode[[]map[string]any](t, h.get(t, "/api/fields"))
	var macID string
	for _, f := range fields {
		if f["key"] == "mac" {
			macID = f["id"].(string)
		}
	}
	if macID == "" {
		t.Fatal("the fixture should have a mac field")
	}

	rec := h.do(t, http.MethodDelete, "/api/fields/"+macID, "")
	if rec.Code != http.StatusConflict {
		t.Fatalf("want 409, got %d: %s", rec.Code, rec.Body.String())
	}
	body := rec.Body.String()
	if !contains(body, CodeReferenceBlocked) {
		t.Errorf("code should be %s, got %s", CodeReferenceBlocked, body)
	}
	if !contains(body, "表达式键") || !contains(body, "设备编号") {
		t.Errorf("the message should name what is in the way, got %s", body)
	}
	if !contains(body, "referrers") {
		t.Errorf("the response should carry the referrer list for the UI, got %s", body)
	}
}

func TestFieldReferrersEndpoint(t *testing.T) {
	h := newHarness(t)
	fields := decode[[]map[string]any](t, h.get(t, "/api/fields"))
	var macID string
	for _, f := range fields {
		if f["key"] == "mac" {
			macID = f["id"].(string)
		}
	}
	refs := decode[[]schema.Referrer](t, h.get(t, "/api/fields/"+macID+"/referrers"))
	if len(refs) != 1 || refs[0].Kind != "field" || refs[0].Label != "设备编号" {
		t.Fatalf("mac is read by the sn expression key, got %+v", refs)
	}
}

func TestRecomputeEndpointPreviewsBeforeApplying(t *testing.T) {
	h := newHarness(t)
	h.seed(t, 0, 3)

	before := decode[assetListResponse](t, h.get(t, "/api/assets"))
	firstSN := before.Items[0].DisplayName

	// Prefix every number with the category code.
	if rec := h.patch(t, "/api/fields/"+h.snFieldID,
		`{"options":{"template":"category.code + \"-\" + hex2dec(attrs.mac)"}}`); rec.Code != http.StatusOK {
		t.Fatalf("update rule: %s", rec.Body.String())
	}

	dry := decode[asset.RecomputeReport](t, h.post(t, "/api/categories/"+h.catID+"/recompute?dry_run=true", ""))
	if dry.Applied {
		t.Error("a dry run must not apply")
	}
	if dry.Affected != 3 || dry.Total != 3 {
		t.Errorf("affected/total = %d/%d, want 3/3", dry.Affected, dry.Total)
	}
	if len(dry.Samples) == 0 {
		t.Error("the preview should show before/after samples")
	}
	after := decode[assetListResponse](t, h.get(t, "/api/assets"))
	if after.Items[0].DisplayName != firstSN {
		t.Error("the dry run changed stored data")
	}

	real := decode[asset.RecomputeReport](t, h.post(t, "/api/categories/"+h.catID+"/recompute?dry_run=false", ""))
	if !real.Applied || real.Affected != 3 {
		t.Fatalf("apply report = %+v", real)
	}
	final := decode[assetListResponse](t, h.get(t, "/api/assets"))
	for _, a := range final.Items {
		if len(a.DisplayName) < 3 || a.DisplayName[:3] != "RT-" {
			t.Errorf("asset %s did not take the new rule", a.DisplayName)
		}
	}
}

// Already covered structurally in nplusone_test.go; this pins the HTTP surface.
func TestMovingAPopulatedCategoryReturnsTheRightCode(t *testing.T) {
	h := newHarness(t)
	h.seed(t, 0, 1)
	rec := h.patch(t, "/api/categories/"+h.catID, `{"parent_id":null}`)
	if rec.Code != http.StatusConflict {
		t.Fatalf("want 409, got %d: %s", rec.Code, rec.Body.String())
	}
	if decode[Envelope](t, rec).Error.Code != CodeCategoryHasAssets {
		t.Errorf("code = %s", decode[Envelope](t, rec).Error.Code)
	}
}

// Clearing the default stock point used to be accepted and quietly ignored, so
// a request that did nothing came back 200.
func TestClearingTheDefaultStockPointIsRefusedNotIgnored(t *testing.T) {
	h := newHarness(t)

	rec := h.patch(t, "/api/holders/"+h.locID, `{"is_default_stock":false}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("want 422, got %d: %s", rec.Code, rec.Body.String())
	}
	if !contains(rec.Body.String(), "只能更换") {
		t.Errorf("the message should say what is allowed instead, got %s", rec.Body.String())
	}

	// Moving it is still fine.
	other := decode[map[string]any](t, h.post(t, "/api/holders",
		`{"type":"location","name":"北京仓库"}`))["id"].(string)
	if rec := h.patch(t, "/api/holders/"+other, `{"is_default_stock":true}`); rec.Code != http.StatusOK {
		t.Fatalf("moving the marker must work: %s", rec.Body.String())
	}
	marked := map[string]bool{}
	for _, e := range decode[[]map[string]any](t, h.get(t, "/api/holders")) {
		marked[e["id"].(string)] = e["is_default_stock"] == true
	}
	if !marked[other] || marked[h.locID] {
		t.Errorf("the marker did not move: %v", marked)
	}
}

// Sentinel errors carry an English identifier so errors.Is can match them. That
// identifier must not reach the screen: principle V puts everything a person
// reads in Chinese.
func TestErrorMessagesReachTheUserWithoutTheEnglishSentinel(t *testing.T) {
	h := newHarness(t)

	fields := decode[[]map[string]any](t, h.get(t, "/api/fields"))
	var macID string
	for _, f := range fields {
		if f["key"] == "mac" {
			macID = f["id"].(string)
		}
	}

	// A field an expression key reads, a display key pointed at a non-unique
	// field, and a key bound twice on one chain: three different sentinels.
	cases := []struct {
		name string
		rec  func() *httptest.ResponseRecorder
		want string
	}{
		{"delete a referenced field", func() *httptest.ResponseRecorder {
			return h.do(t, http.MethodDelete, "/api/fields/"+macID, "")
		}, "field is still referenced"},
		{"display key that is not unique", func() *httptest.ResponseRecorder {
			h.post(t, "/api/fields", `{"key":"note","label":"备注","type":"text"}`)
			all := decode[[]map[string]any](t, h.get(t, "/api/fields"))
			for _, f := range all {
				if f["key"] == "note" {
					h.post(t, "/api/categories/"+h.catID+"/bindings",
						`{"field_id":"`+f["id"].(string)+`"}`)
				}
			}
			return h.patch(t, "/api/categories/"+h.catID, `{"display_key":"note"}`)
		}, "display key is not usable"},
		{"clear the default stock point", func() *httptest.ResponseRecorder {
			return h.patch(t, "/api/holders/"+h.locID, `{"is_default_stock":false}`)
		}, "default stock point"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			body := tc.rec().Body.String()
			if contains(body, tc.want) {
				t.Errorf("the English sentinel leaked into the message: %s", body)
			}
			// The Chinese guidance is what should have survived.
			if !contains(body, "，") && !contains(body, "。") {
				t.Errorf("no Chinese guidance in the message: %s", body)
			}
		})
	}
}

// With archiving gone, unbinding is the only way to retire a field that assets
// already carry values for -- and until now the guard behind it had no caller.
func TestUnbindEndpointDetachesAFieldAndKeepsStoredValues(t *testing.T) {
	h := newHarness(t)
	h.seed(t, 0, 1)

	rec := h.post(t, "/api/fields", `{"key":"rack","label":"机柜","type":"text"}`)
	rackID := decode[map[string]any](t, rec)["id"].(string)
	if rec := h.post(t, "/api/categories/"+h.catID+"/bindings",
		`{"field_id":"`+rackID+`"}`); rec.Code != http.StatusNoContent {
		t.Fatalf("bind: %s", rec.Body.String())
	}

	id := h.firstAssetID(t)
	asset := decode[map[string]any](t, h.get(t, "/api/assets/"+id))["asset"].(map[string]any)
	if rec := h.patch(t, "/api/assets/"+id, `{"category_id":"`+h.catID+
		`","status":"in_stock","owner_id":"`+h.userID+
		`","holder_type":"entity","holder_id":"`+h.locID+
		`","attrs":{"mac":"001A2B3C0001","rack":"R-01"},"version":`+
		jsonNumber(asset["version"])+`}`); rec.Code != http.StatusOK {
		t.Fatalf("fill rack: %s", rec.Body.String())
	}

	if rec := h.do(t, http.MethodDelete,
		"/api/categories/"+h.catID+"/bindings/"+rackID, ""); rec.Code != http.StatusNoContent {
		t.Fatalf("unbind: %d %s", rec.Code, rec.Body.String())
	}

	// Gone from the form the next device will be recorded with...
	schema := decode[map[string]any](t, h.get(t, "/api/categories/"+h.catID+"/schema"))
	for _, f := range schema["fields"].([]any) {
		if f.(map[string]any)["key"] == "rack" {
			t.Error("the unbound field should have left the category schema")
		}
	}
	// ...but the value recorded before it left is still readable.
	after := decode[map[string]any](t, h.get(t, "/api/assets/"+id))["asset"].(map[string]any)
	archived, _ := after["archived_attrs"].(map[string]any)
	if archived["rack"] != "R-01" {
		t.Errorf("the stored value should survive as an archived attribute, got %#v", after["archived_attrs"])
	}
}

func TestUnbindEndpointHonoursTheExistingGuards(t *testing.T) {
	h := newHarness(t)

	fields := decode[[]map[string]any](t, h.get(t, "/api/fields"))
	var macID string
	for _, f := range fields {
		if f["key"] == "mac" {
			macID = f["id"].(string)
		}
	}
	rec := h.do(t, http.MethodDelete, "/api/categories/"+h.catID+"/bindings/"+macID, "")
	if rec.Code != http.StatusConflict {
		t.Fatalf("want 409, got %d: %s", rec.Code, rec.Body.String())
	}
	if !contains(rec.Body.String(), "设备编号") {
		t.Errorf("the refusal should name what reads it, got %s", rec.Body.String())
	}
}

// Two kinds of refusal, two payloads: configuration is fixed by editing the
// configuration, stored data by unbinding instead.
func TestDeleteFieldEndpointCarriesTheRightPayload(t *testing.T) {
	h := newHarness(t)
	h.seed(t, 0, 2)

	rec := h.post(t, "/api/fields", `{"key":"rack","label":"机柜","type":"text"}`)
	rackID := decode[map[string]any](t, rec)["id"].(string)

	// Nothing points at it yet.
	if rec := h.do(t, http.MethodDelete, "/api/fields/"+rackID, ""); rec.Code != http.StatusNoContent {
		t.Fatalf("an unused field must delete: %d %s", rec.Code, rec.Body.String())
	}

	// A field assets carry values for is refused, with the devices named.
	fields := decode[[]map[string]any](t, h.get(t, "/api/fields"))
	var macID string
	for _, f := range fields {
		if f["key"] == "mac" {
			macID = f["id"].(string)
		}
	}
	// mac is read by the sn expression key, so it hits the configuration check
	// first -- which is the intended order: cheapest and most actionable first.
	rec = h.do(t, http.MethodDelete, "/api/fields/"+macID, "")
	if rec.Code != http.StatusConflict || !contains(rec.Body.String(), "referrers") {
		t.Fatalf("want 409 with referrers, got %d: %s", rec.Code, rec.Body.String())
	}
}

// jsonNumber renders a decoded JSON number back into a literal for a request
// body, without dragging in a struct just to carry one field.
func jsonNumber(v any) string {
	return strconv.FormatFloat(v.(float64), 'f', -1, 64)
}

func TestDeleteCategoryEndpoint(t *testing.T) {
	h := newHarness(t)
	h.seed(t, 0, 2)

	// The fixture category holds assets, so it is refused and the devices are
	// named -- "cannot delete" without them is a dead end.
	rec := h.do(t, http.MethodDelete, "/api/categories/"+h.catID, "")
	if rec.Code != http.StatusConflict {
		t.Fatalf("want 409, got %d: %s", rec.Code, rec.Body.String())
	}
	body := rec.Body.String()
	if !contains(body, "blockers") || !contains(body, `"kind":"asset"`) {
		t.Errorf("the refusal should carry the blocking assets, got %s", body)
	}
	if contains(body, "category subtree still holds assets") {
		t.Errorf("the English sentinel leaked into the message: %s", body)
	}

	// An empty category deletes.
	empty := decode[map[string]any](t, h.post(t, "/api/categories", `{"code":"SW","name":"交换机"}`))
	id := empty["id"].(string)
	if rec := h.do(t, http.MethodDelete, "/api/categories/"+id, ""); rec.Code != http.StatusNoContent {
		t.Fatalf("an empty category must delete: %d %s", rec.Code, rec.Body.String())
	}
	for _, c := range decode[[]map[string]any](t, h.get(t, "/api/categories")) {
		if c["id"] == id {
			t.Error("the category should be gone from the list")
		}
	}
}
