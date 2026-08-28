package httpapi

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/klskk23/nexus-assets/internal/asset"
	"github.com/klskk23/nexus-assets/internal/schema"
)

// A cycle between expression keys must be refused when the key is bound, not
// discovered when an asset fails to evaluate.
func TestCyclicExpressionKeyRefusedAtBindTime(t *testing.T) {
	h := newHarness(t)

	a := decode[map[string]any](t, h.post(t, "/api/fields",
		`{"key":"a","label":"A","type":"computed","options":{"template":"{{ .attrs.b | upper }}"}}`))
	if a["id"] == nil {
		t.Fatalf("creating the first half of the cycle should succeed")
	}
	// b reads a, closing the loop. A definition on its own is harmless -- the
	// loop only matters once something has to evaluate it.
	b := h.post(t, "/api/fields",
		`{"key":"b","label":"B","type":"computed","options":{"template":"{{ .attrs.a | upper }}"}}`)
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

// Archiving a field an expression key reads would make every asset in that
// category impossible to save, so it is refused with the referrers listed.
func TestArchivingAReferencedFieldIsRefusedWithReferrers(t *testing.T) {
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

	rec := h.patch(t, "/api/fields/"+macID, `{"archive":true}`)
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
		`{"options":{"template":"{{ printf \"%s-%s\" .category.code (.attrs.mac | hex2dec) }}"}}`); rec.Code != http.StatusOK {
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
		{"archive a referenced field", func() *httptest.ResponseRecorder {
			return h.patch(t, "/api/fields/"+macID, `{"archive":true}`)
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
