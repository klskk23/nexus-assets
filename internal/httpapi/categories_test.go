package httpapi

import (
	"net/http"
	"testing"

	"github.com/klskk23/nexus-assets/internal/asset"
	"github.com/klskk23/nexus-assets/internal/schema"
)

// A cycle between computed fields must be refused when the rule is saved, not
// discovered when an asset fails to evaluate.
func TestCyclicComputedRuleRefusedWithTheCyclePath(t *testing.T) {
	h := newHarness(t)

	a := decode[map[string]any](t, h.post(t, "/api/fields",
		`{"key":"a","label":"A","type":"computed","options":{"template":"{{ .attrs.b | upper }}"}}`))
	if a["id"] == nil {
		t.Fatalf("creating the first half of the cycle should succeed")
	}

	// b reads a, closing the loop.
	rec := h.post(t, "/api/fields",
		`{"key":"b","label":"B","type":"computed","options":{"template":"{{ .attrs.a | upper }}"}}`)
	if rec.Code != http.StatusUnprocessableEntity && rec.Code != http.StatusCreated {
		t.Fatalf("unexpected status %d: %s", rec.Code, rec.Body.String())
	}

	// Whether the cycle is caught on definition or on first evaluation, saving
	// an asset that would need it must fail and name the loop.
	if rec.Code == http.StatusCreated {
		catRec := h.post(t, "/api/categories", `{"code":"CYC","name":"环测","sn_template":"{{ .attrs.a }}"}`)
		catID := decode[map[string]any](t, catRec)["id"].(string)
		fields := decode[[]map[string]any](t, h.get(t, "/api/fields"))
		for _, f := range fields {
			if f["key"] == "a" || f["key"] == "b" {
				h.post(t, "/api/categories/"+catID+"/bindings",
					`{"field_id":"`+f["id"].(string)+`"}`)
			}
		}
		bad := h.post(t, "/api/assets", `{"category_id":"`+catID+`","owner_id":"`+h.userID+
			`","holder_type":"entity","holder_id":"`+h.locID+`","attrs":{}}`)
		if bad.Code != http.StatusUnprocessableEntity {
			t.Fatalf("an asset needing a cyclic rule must not save, got %d: %s", bad.Code, bad.Body.String())
		}
		if !contains(bad.Body.String(), "cycle") && !contains(bad.Body.String(), "->") {
			t.Errorf("the error should show the cycle path, got %s", bad.Body.String())
		}
	}
}

// Archiving a field a serial-number rule reads would make every asset in that
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
	if !contains(body, "编号生成规则") {
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
	if len(refs) != 1 || refs[0].Kind != "category" {
		t.Fatalf("mac is read by the category rule, got %+v", refs)
	}
}

func TestRecomputeEndpointPreviewsBeforeApplying(t *testing.T) {
	h := newHarness(t)
	h.seed(t, 0, 3)

	before := decode[assetListResponse](t, h.get(t, "/api/assets"))
	firstSN := before.Items[0].SN

	// Prefix every number with the category code.
	if rec := h.patch(t, "/api/categories/"+h.catID,
		`{"sn_template":"{{ printf \"%s-%s\" .category.code (.attrs.mac | hex2dec) }}"}`); rec.Code != http.StatusOK {
		t.Fatalf("update rule: %s", rec.Body.String())
	}

	dry := decode[asset.RecomputeReport](t, h.post(t, "/api/categories/"+h.catID+"/recompute-sn?dry_run=true", ""))
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
	if after.Items[0].SN != firstSN {
		t.Error("the dry run changed stored data")
	}

	real := decode[asset.RecomputeReport](t, h.post(t, "/api/categories/"+h.catID+"/recompute-sn?dry_run=false", ""))
	if !real.Applied || real.Affected != 3 {
		t.Fatalf("apply report = %+v", real)
	}
	final := decode[assetListResponse](t, h.get(t, "/api/assets"))
	for _, a := range final.Items {
		if len(a.SN) < 3 || a.SN[:3] != "RT-" {
			t.Errorf("asset %s did not take the new rule", a.SN)
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
