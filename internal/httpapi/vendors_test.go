package httpapi

import (
	"net/http"
	"strings"
	"testing"

	"github.com/klskk23/nexus-assets/internal/asset"
	"github.com/klskk23/nexus-assets/internal/authz"
	"github.com/klskk23/nexus-assets/internal/i18n"
	"github.com/klskk23/nexus-assets/internal/model"
)

// saveDevice records one device of a model with the given attributes and
// returns its id.
func (h *harness) saveDevice(t *testing.T, modelID string, attrs map[string]any) string {
	t.Helper()
	a, err := h.assets.Save(h.ctx, asset.SaveInput{
		CategoryID: h.catID, ModelID: &modelID, Status: model.StatusInStock,
		OwnerID: h.userID,
		Holder:  model.Holder{Type: model.HolderTypeEntity, ID: h.locID},
		Attrs:   attrs, ActorID: h.userID,
	})
	if err != nil {
		if fe, ok := err.(asset.FieldErrors); ok {
			t.Fatalf("save device: %v", fe.In(i18n.ZH))
		}
		t.Fatalf("save device: %v", err)
	}
	return a.ID
}

// newVendor registers a vendor through the endpoint and returns its id.
func newVendor(t *testing.T, h *harness, name string) string {
	t.Helper()
	v := decode[map[string]any](t, h.post(t, "/api/vendors", `{"name":"`+name+`"}`))
	id, _ := v["id"].(string)
	if id == "" {
		t.Fatalf("create vendor %s: %v", name, v)
	}
	return id
}

// The list keeps both shapes of 014 decision 92: an array for the pickers that
// need every option, an envelope for anyone who asks to search or page.
func TestVendorListKeepsBothShapes(t *testing.T) {
	h := newHarness(t)
	newVendor(t, h, "Dell")
	newVendor(t, h, "Lenovo")

	plain := h.get(t, "/api/vendors").Body.String()
	if !strings.HasPrefix(strings.TrimSpace(plain), "[") {
		t.Errorf("a bare list must stay an array: %s", plain)
	}
	paged := decode[map[string]any](t, h.get(t, "/api/vendors?q=Dell"))
	items, _ := paged["items"].([]any)
	if len(items) != 1 {
		t.Errorf("searching should narrow to one, got %v", paged)
	}
}

// Renaming a vendor is one row. Every model reads the name through a join, so
// nothing has to be carried across -- which is the reason this became an entity.
func TestRenamingAVendorFollowsThroughToItsModels(t *testing.T) {
	h := newHarness(t)
	dell := newVendor(t, h, "Dell")
	m := decode[map[string]any](t, h.post(t, "/api/models",
		`{"name":"Latitude 5420","vendor_id":"`+dell+`","category_ids":["`+h.catID+`"]}`))
	modelID, _ := m["id"].(string)
	if modelID == "" {
		t.Fatalf("create model: %v", m)
	}
	if got, _ := m["vendor_name"].(string); got != "Dell" {
		t.Errorf("vendor_name = %q on create", got)
	}

	if rec := h.patch(t, "/api/vendors/"+dell, `{"name":"戴尔"}`); rec.Code != http.StatusOK {
		t.Fatalf("rename: %d %s", rec.Code, rec.Body.String())
	}
	body := h.get(t, "/api/models").Body.String()
	if !strings.Contains(body, "戴尔") || strings.Contains(body, `"vendor_name":"Dell"`) {
		t.Errorf("the model should read the new name with nothing else done: %s", body)
	}
}

// Deleting configuration that has produced data is refused, and says how much
// is in the way -- the same rule categories, statuses and holders follow.
func TestDeletingAVendorWithModelsIsRefusedWithACount(t *testing.T) {
	h := newHarness(t)
	dell := newVendor(t, h, "Dell")
	h.post(t, "/api/models", `{"name":"Latitude 5420","vendor_id":"`+dell+`","category_ids":["`+h.catID+`"]}`)

	rec := h.do(t, http.MethodDelete, "/api/vendors/"+dell, "")
	if rec.Code != http.StatusConflict {
		t.Fatalf("want 409 while models point at it, got %d %s", rec.Code, rec.Body.String())
	}
	body := decode[map[string]any](t, rec)
	errObj, _ := body["error"].(map[string]any)
	if errObj["total"] != float64(1) {
		t.Errorf("the refusal should carry the count: %v", body)
	}
}

// The point of the whole feature: one binding, every model of that vendor, and
// a model registered afterwards arrives with it already on.
func TestVendorBindingReachesEveryModelIncludingLaterOnes(t *testing.T) {
	h := newHarness(t)
	dell := newVendor(t, h, "Dell")
	first := decode[map[string]any](t, h.post(t, "/api/models",
		`{"name":"Latitude 5420","vendor_id":"`+dell+`","category_ids":["`+h.catID+`"]}`))
	firstID, _ := first["id"].(string)

	f := decode[map[string]any](t, h.post(t, "/api/fields",
		`{"key":"servicetag","label":"ServiceTag","type":"text","is_unique":true}`))
	fieldID, _ := f["id"].(string)
	if rec := h.post(t, "/api/vendors/"+dell+"/bindings",
		`{"field_id":"`+fieldID+`","sort":10}`); rec.Code != http.StatusNoContent {
		t.Fatalf("bind to vendor: %d %s", rec.Code, rec.Body.String())
	}

	// Registered after the binding, nothing else done.
	second := decode[map[string]any](t, h.post(t, "/api/models",
		`{"name":"Latitude 5430","vendor_id":"`+dell+`","category_ids":["`+h.catID+`"]}`))
	secondID, _ := second["id"].(string)

	// Asked for a device of one of the vendor's models. A category cannot
	// answer for a model any more (026): what a device records is asked of the
	// device, so the schema endpoint takes the model it is about.
	sch := decode[map[string]any](t, h.get(t, "/api/categories/"+h.catID+"/schema?model_id="+firstID))
	fields, _ := sch["fields"].([]any)
	var tag map[string]any
	for _, raw := range fields {
		if row, ok := raw.(map[string]any); ok && row["key"] == "servicetag" {
			tag = row
		}
	}
	if tag == nil {
		t.Fatalf("the vendor's field should be in the category's vocabulary: %v", sch)
	}
	reach := map[string]bool{}
	for _, id := range tag["model_ids"].([]any) {
		reach[id.(string)] = true
	}
	if !reach[firstID] || !reach[secondID] {
		t.Errorf("model_ids should reach both models, got %v", tag["model_ids"])
	}
	if vendors, _ := tag["vendor_ids"].([]any); len(vendors) != 1 || vendors[0] != dell {
		t.Errorf("vendor_ids should say where it is bound, got %v", tag["vendor_ids"])
	}

	// The field list says the same thing in the other shape, and calls the
	// mode "device" rather than naming one of the two device targets.
	list := h.get(t, "/api/fields").Body.String()
	if !strings.Contains(list, `"binding_mode":"device"`) {
		t.Errorf("a vendor-bound field is in device mode: %s", list)
	}
	if !strings.Contains(list, `"vendor_ids":["`+dell+`"]`) {
		t.Errorf("the row should carry the vendor it is bound to: %s", list)
	}

	// Unbinding takes it off every model of that vendor at once.
	if rec := h.do(t, http.MethodDelete,
		"/api/vendors/"+dell+"/bindings/"+fieldID, ""); rec.Code != http.StatusNoContent {
		t.Fatalf("unbind: %d %s", rec.Code, rec.Body.String())
	}
	if body := h.get(t, "/api/categories/"+h.catID+"/schema").Body.String(); strings.Contains(body, "servicetag") {
		t.Errorf("unbinding from the vendor clears it everywhere: %s", body)
	}
}

// Category and device stay exclusive; model and vendor do not exclude each
// other, because both answer "which device".
func TestVendorBindingObeysTheCategoryVersusDeviceRule(t *testing.T) {
	h := newHarness(t)
	dell := newVendor(t, h, "Dell")
	m := decode[map[string]any](t, h.post(t, "/api/models",
		`{"name":"Latitude 5420","vendor_id":"`+dell+`","category_ids":["`+h.catID+`"]}`))
	modelID, _ := m["id"].(string)

	f := decode[map[string]any](t, h.post(t, "/api/fields",
		`{"key":"servicetag","label":"ServiceTag","type":"text"}`))
	fieldID, _ := f["id"].(string)
	h.post(t, "/api/vendors/"+dell+"/bindings", `{"field_id":"`+fieldID+`","sort":10}`)

	if rec := h.post(t, "/api/categories/"+h.catID+"/bindings",
		`{"field_id":"`+fieldID+`","sort":10}`); rec.Code != http.StatusConflict {
		t.Errorf("a vendor field must not also bind a category, got %d %s", rec.Code, rec.Body.String())
	}
	if rec := h.post(t, "/api/models/"+modelID+"/bindings",
		`{"field_id":"`+fieldID+`","sort":10}`); rec.Code != http.StatusNoContent {
		t.Errorf("model and vendor are one side and may both hold it, got %d %s", rec.Code, rec.Body.String())
	}

	// The category-bound mac from the harness may not move to the vendor.
	fields := decode[map[string]any](t, h.get(t, "/api/fields?q=mac"))
	items, _ := fields["items"].([]any)
	mac, _ := items[0].(map[string]any)
	macID, _ := mac["id"].(string)
	if rec := h.post(t, "/api/vendors/"+dell+"/bindings",
		`{"field_id":"`+macID+`","sort":10}`); rec.Code != http.StatusConflict {
		t.Errorf("a category field must not also bind a vendor, got %d %s", rec.Code, rec.Body.String())
	}
}

// Nobody ticks "required" without being told how many devices it eventually
// asks something of (decision 70's promise, one level wider).
func TestVendorRequiredImpactCountsEveryDeviceOfThatVendor(t *testing.T) {
	h := newHarness(t)
	dell := newVendor(t, h, "Dell")
	got := decode[map[string]any](t, h.get(t, "/api/vendors/"+dell+"/required-impact"))
	if got["total"] != float64(0) {
		t.Errorf("a vendor with no devices counts zero, got %v", got)
	}
}

// Every write here is schema.manage. FR-027 keeps the switch count at eighteen,
// and a route without need(...) is an undefended one.
func TestVendorEndpointsNeedSchemaManage(t *testing.T) {
	h := newHarness(t)
	dell := newVendor(t, h, "Dell")
	f := decode[map[string]any](t, h.post(t, "/api/fields",
		`{"key":"servicetag","label":"ServiceTag","type":"text"}`))
	fieldID, _ := f["id"].(string)

	tok := h.asRole(t, authz.UserRoleID)
	for _, call := range []struct{ method, path, body string }{
		{http.MethodPost, "/api/vendors", `{"name":"Lenovo"}`},
		{http.MethodPatch, "/api/vendors/" + dell, `{"name":"戴尔"}`},
		{http.MethodDelete, "/api/vendors/" + dell, ""},
		{http.MethodPost, "/api/vendors/" + dell + "/bindings", `{"field_id":"` + fieldID + `"}`},
		{http.MethodDelete, "/api/vendors/" + dell + "/bindings/" + fieldID, ""},
	} {
		rec := h.doAs(t, tok, call.method, call.path, call.body)
		if rec.Code != http.StatusForbidden {
			t.Errorf("%s %s = %d, want 403", call.method, call.path, rec.Code)
		}
	}
}

// Changing a model's vendor takes away the fields the old vendor provided.
// The values are not deleted -- they become archived attributes, visible and
// read-only -- but that happens to every device of the model at once, so the
// dry-run says how many and which fields before anyone commits.
func TestChangingAModelsVendorArchivesWhatTheOldOneProvided(t *testing.T) {
	h := newHarness(t)
	dell := newVendor(t, h, "Dell")
	lenovo := newVendor(t, h, "Lenovo")
	m := decode[map[string]any](t, h.post(t, "/api/models",
		`{"name":"Latitude 5420","vendor_id":"`+dell+`","category_ids":["`+h.catID+`"]}`))
	modelID, _ := m["id"].(string)

	f := decode[map[string]any](t, h.post(t, "/api/fields",
		`{"key":"servicetag","label":"ServiceTag","type":"text"}`))
	fieldID, _ := f["id"].(string)
	h.post(t, "/api/vendors/"+dell+"/bindings", `{"field_id":"`+fieldID+`","sort":10}`)

	// Two devices of the model, only one with the field filled in.
	withTag := h.saveDevice(t, modelID, map[string]any{"mac": "001A2B3C0001", "servicetag": "ABC1234"})
	h.saveDevice(t, modelID, map[string]any{"mac": "001A2B3C0002"})

	// The dry-run counts the one that actually loses something, and names it.
	impact := decode[map[string]any](t, h.get(t,
		"/api/models/"+modelID+"/vendor-change-impact?vendor_id="+lenovo))
	if impact["total"] != float64(1) {
		t.Errorf("only the device holding a value is affected, got %v", impact)
	}
	if labels, _ := impact["fields"].([]any); len(labels) != 1 || labels[0] != "ServiceTag" {
		t.Errorf("the dry-run should name the field, got %v", impact["fields"])
	}

	if rec := h.patch(t, "/api/models/"+modelID,
		`{"vendor_id":"`+lenovo+`"}`); rec.Code != http.StatusOK {
		t.Fatalf("change vendor: %d %s", rec.Code, rec.Body.String())
	}

	body := decode[map[string]any](t, h.get(t, "/api/assets/"+withTag))
	got, _ := body["asset"].(map[string]any)
	archived, _ := got["archived_attrs"].(map[string]any)
	if archived["servicetag"] != "ABC1234" {
		t.Errorf("the value should survive as an archived attribute, got %v", got["archived_attrs"])
	}
	if attrs, _ := got["attrs"].(map[string]any); attrs["servicetag"] != nil {
		t.Errorf("and should no longer be a live attribute, got %v", attrs)
	}
}

// A field the new vendor also provides, or one bound to the model itself, is
// not lost by the move and must not be counted.
func TestVendorChangeIgnoresFieldsThatSurviveIt(t *testing.T) {
	h := newHarness(t)
	dell := newVendor(t, h, "Dell")
	lenovo := newVendor(t, h, "Lenovo")
	m := decode[map[string]any](t, h.post(t, "/api/models",
		`{"name":"Latitude 5420","vendor_id":"`+dell+`","category_ids":["`+h.catID+`"]}`))
	modelID, _ := m["id"].(string)

	shared := newField(t, h, "servicetag")
	h.post(t, "/api/vendors/"+dell+"/bindings", `{"field_id":"`+shared+`","sort":10}`)
	h.post(t, "/api/vendors/"+lenovo+"/bindings", `{"field_id":"`+shared+`","sort":10}`)
	h.saveDevice(t, modelID, map[string]any{"mac": "001A2B3C0003", "servicetag": "ABC1234"})

	impact := decode[map[string]any](t, h.get(t,
		"/api/models/"+modelID+"/vendor-change-impact?vendor_id="+lenovo))
	if impact["total"] != float64(0) {
		t.Errorf("a field both vendors provide survives the move, got %v", impact)
	}
}

// The model note travels through the endpoints, and PATCH keeps the three
// states the device note has: absent leaves it, an empty string clears it.
func TestModelNoteSurvivesAnEditThatDoesNotMentionIt(t *testing.T) {
	h := newHarness(t)
	dell := newVendor(t, h, "Dell")
	m := decode[map[string]any](t, h.post(t, "/api/models",
		`{"name":"Latitude 5420","vendor_id":"`+dell+`","category_ids":["`+h.catID+`"],
		  "note":"已停产，改买 5430"}`))
	modelID, _ := m["id"].(string)
	if m["note"] != "已停产，改买 5430" {
		t.Fatalf("note on create = %v", m["note"])
	}

	// An edit about something else must not blank it.
	got := decode[map[string]any](t, h.patch(t, "/api/models/"+modelID, `{"category_ids":[]}`))
	if got["note"] != "已停产，改买 5430" {
		t.Errorf("an edit that omits the note should keep it, got %v", got["note"])
	}

	// A note nobody can find again is a note nobody writes twice.
	found := decode[map[string]any](t, h.get(t, "/api/models?q=停产"))
	if items, _ := found["items"].([]any); len(items) != 1 {
		t.Errorf("the note should be searchable, got %v", found)
	}

	got = decode[map[string]any](t, h.patch(t, "/api/models/"+modelID, `{"note":""}`))
	if got["note"] != "" {
		t.Errorf("an empty string clears it, got %v", got["note"])
	}
}
