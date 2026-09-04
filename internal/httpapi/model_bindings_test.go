package httpapi

import (
	"net/http"
	"strconv"
	"strings"
	"testing"
)

// modelWithField creates a model in the harness category and hangs a new field
// on it, returning both ids.
func modelWithField(t *testing.T, h *harness, modelName, key string, unique bool) (modelID, fieldID string) {
	t.Helper()
	m := decode[map[string]any](t, h.post(t, "/api/models",
		`{"name":"`+modelName+`","vendor":"Dell","category_ids":["`+h.catID+`"]}`))
	modelID, _ = m["id"].(string)
	if modelID == "" {
		t.Fatalf("create model %s: %v", modelName, m)
	}

	uniq := "false"
	if unique {
		uniq = "true"
	}
	f := decode[map[string]any](t, h.post(t, "/api/fields",
		`{"key":"`+key+`","label":"`+key+`","type":"text","is_unique":`+uniq+`}`))
	fieldID, _ = f["id"].(string)
	if fieldID == "" {
		t.Fatalf("create field %s: %v", key, f)
	}

	if rec := h.post(t, "/api/models/"+modelID+"/bindings",
		`{"field_id":"`+fieldID+`","required":false,"sort":10}`); rec.Code != http.StatusNoContent {
		t.Fatalf("bind %s to %s: %d %s", key, modelName, rec.Code, rec.Body.String())
	}
	return modelID, fieldID
}

// A field hangs on categories or on models, never both (decision 96). Mixing
// them would leave required flags disagreeing about one asset and the
// uniqueness scope without a single answer.
func TestBindingModesRefuseEachOther(t *testing.T) {
	h := newHarness(t)
	modelID, modelField := modelWithField(t, h, "Latitude 5420", "servicetag", false)

	rec := h.post(t, "/api/categories/"+h.catID+"/bindings",
		`{"field_id":"`+modelField+`","required":false,"sort":10}`)
	if rec.Code != http.StatusConflict {
		t.Errorf("binding a model field to a category should be refused, got %d %s", rec.Code, rec.Body.String())
	}

	// And the other way round.
	f := decode[map[string]any](t, h.post(t, "/api/fields",
		`{"key":"rack","label":"机柜位","type":"text","category_ids":["`+h.catID+`"]}`))
	categoryField, _ := f["id"].(string)
	rec = h.post(t, "/api/models/"+modelID+"/bindings",
		`{"field_id":"`+categoryField+`","required":false,"sort":10}`)
	if rec.Code != http.StatusConflict {
		t.Errorf("binding a category field to a model should be refused, got %d %s", rec.Code, rec.Body.String())
	}
}

// A model field reaches the category's schema, and says which models it is for
// so the interface can decide when to offer it.
func TestModelFieldAppearsInTheCategorySchema(t *testing.T) {
	h := newHarness(t)
	modelID, _ := modelWithField(t, h, "Latitude 5420", "servicetag", false)

	body := h.get(t, "/api/categories/"+h.catID+"/schema").Body.String()
	if !strings.Contains(body, "servicetag") {
		t.Fatalf("the category's schema should carry the model's field: %s", body)
	}
	if !strings.Contains(body, modelID) {
		t.Errorf("the field should name the model it is bound to: %s", body)
	}
}

// Uniqueness reaches every model the field is bound to, not each model
// separately (decision 99): a Dell service tag is unique across Dell's
// catalogue, not merely within one product line.
func TestModelFieldUniquenessSpansEveryBoundModel(t *testing.T) {
	h := newHarness(t)
	first, fieldID := modelWithField(t, h, "Latitude 5420", "servicetag", true)

	second := decode[map[string]any](t, h.post(t, "/api/models",
		`{"name":"OptiPlex 7090","vendor":"Dell","category_ids":["`+h.catID+`"]}`))
	secondID, _ := second["id"].(string)
	if rec := h.post(t, "/api/models/"+secondID+"/bindings",
		`{"field_id":"`+fieldID+`","required":false,"sort":10}`); rec.Code != http.StatusNoContent {
		t.Fatal(rec.Body.String())
	}

	if rec := h.post(t, "/api/assets", `{"category_id":"`+h.catID+`","owner_id":"`+h.userID+
		`","holder_type":"entity","holder_id":"`+h.locID+`","model_id":"`+first+
		`","attrs":{"mac":"001A2B3C4D01","servicetag":"ABC1234"}}`); rec.Code != http.StatusCreated {
		t.Fatalf("first device: %d %s", rec.Code, rec.Body.String())
	}
	rec := h.post(t, "/api/assets", `{"category_id":"`+h.catID+`","owner_id":"`+h.userID+
		`","holder_type":"entity","holder_id":"`+h.locID+`","model_id":"`+secondID+
		`","attrs":{"mac":"001A2B3C4D02","servicetag":"ABC1234"}}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Errorf("the same tag under a different model must still collide, got %d %s",
			rec.Code, rec.Body.String())
	}
}

// The numbering field has to name every asset in the category, and a model
// field only covers some of them (decision 100).
func TestDisplayKeyRefusesAModelField(t *testing.T) {
	h := newHarness(t)
	modelWithField(t, h, "Latitude 5420", "servicetag", true)

	rec := h.patch(t, "/api/categories/"+h.catID, `{"display_key":"servicetag"}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected a refusal, got %d %s", rec.Code, rec.Body.String())
	}
	if body := rec.Body.String(); !strings.Contains(body, "型号") {
		t.Errorf("the refusal should say the field is bound to models: %s", body)
	}
}

// Changing an asset's model changes which fields apply to it. The value left
// behind is kept and shown read-only, the same as unbinding a field (decision
// 98) -- and the change itself is not blocked.
func TestChangingModelArchivesTheFieldItLeavesBehind(t *testing.T) {
	h := newHarness(t)
	dell, _ := modelWithField(t, h, "Latitude 5420", "servicetag", false)
	lenovo := decode[map[string]any](t, h.post(t, "/api/models",
		`{"name":"ThinkPad T14","vendor":"Lenovo","category_ids":["`+h.catID+`"]}`))
	lenovoID, _ := lenovo["id"].(string)

	created := decode[map[string]any](t, h.post(t, "/api/assets",
		`{"category_id":"`+h.catID+`","owner_id":"`+h.userID+
			`","holder_type":"entity","holder_id":"`+h.locID+`","model_id":"`+dell+
			`","attrs":{"mac":"001A2B3C4D03","servicetag":"ABC9999"}}`))
	id, _ := created["id"].(string)
	version, _ := created["version"].(float64)

	rec := h.patch(t, "/api/assets/"+id, `{"category_id":"`+h.catID+`","owner_id":"`+h.userID+
		`","holder_type":"entity","holder_id":"`+h.locID+`","model_id":"`+lenovoID+
		`","attrs":{"mac":"001A2B3C4D03"},"version":`+strconv.Itoa(int(version))+`}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("changing the model must not be blocked: %d %s", rec.Code, rec.Body.String())
	}

	after := h.get(t, "/api/assets/"+id).Body.String()
	if !strings.Contains(after, "archived_attrs") || !strings.Contains(after, "ABC9999") {
		t.Errorf("the value should survive as an archived attribute: %s", after)
	}
}

// An asset with no model sees no model fields at all.
func TestAssetWithoutAModelSeesNoModelFields(t *testing.T) {
	h := newHarness(t)
	modelWithField(t, h, "Latitude 5420", "servicetag", false)

	created := decode[map[string]any](t, h.post(t, "/api/assets",
		`{"category_id":"`+h.catID+`","owner_id":"`+h.userID+
			`","holder_type":"entity","holder_id":"`+h.locID+
			`","attrs":{"mac":"001A2B3C4D04","servicetag":"NOPE"}}`))
	id, _ := created["id"].(string)
	if id == "" {
		t.Fatalf("create: %v", created)
	}

	body := h.get(t, "/api/assets/"+id).Body.String()
	// Not a live attribute: the field does not apply here, so the value it was
	// handed is an orphan rather than data.
	if strings.Contains(body, `"attrs":{"mac":"001A2B3C4D04","servicetag"`) {
		t.Errorf("servicetag must not be live on a device with no model: %s", body)
	}
}

// A required model binding says how many devices it will eventually ask
// somebody to fill in -- this model's, and only this model's.
func TestRequiredImpactCountsOnlyThatModelsDevices(t *testing.T) {
	h := newHarness(t)
	dell, _ := modelWithField(t, h, "Latitude 5420", "servicetag", false)
	other := decode[map[string]any](t, h.post(t, "/api/models",
		`{"name":"ThinkPad T14","vendor":"Lenovo","category_ids":["`+h.catID+`"]}`))
	otherID, _ := other["id"].(string)

	for i, m := range []string{dell, dell, otherID} {
		rec := h.post(t, "/api/assets", `{"category_id":"`+h.catID+`","owner_id":"`+h.userID+
			`","holder_type":"entity","holder_id":"`+h.locID+`","model_id":"`+m+
			`","attrs":{"mac":"001A2B3C4E0`+strconv.Itoa(i)+`"}}`)
		if rec.Code != http.StatusCreated {
			t.Fatalf("seed %d: %s", i, rec.Body.String())
		}
	}

	body := h.get(t, "/api/models/"+dell+"/required-impact").Body.String()
	if !strings.Contains(body, `"total":2`) {
		t.Errorf("only this model's devices count, got %s", body)
	}
}

// Columns are the category's schema; rows are the query (decision 102). The
// column is there whether or not this export happened to match a device of
// that model -- otherwise the file's shape would change with the filter, and
// anything downstream parsing a fixed header would break on it.
func TestExportKeepsTheModelColumnWithNoMatchingDevices(t *testing.T) {
	h := newHarness(t)
	modelWithField(t, h, "Latitude 5420", "servicetag", false)
	h.seed(t, 0, 1) // a device with no model at all

	body := h.get(t, "/api/export.csv?category_id="+h.catID).Body.String()
	if !strings.Contains(body, "servicetag") {
		t.Errorf("the column should stand whether or not a row fills it: %s", body)
	}
}

// The import template is the same field set, so it gains the column too.
func TestImportTemplateCarriesModelFields(t *testing.T) {
	h := newHarness(t)
	modelWithField(t, h, "Latitude 5420", "servicetag", false)

	body := h.get(t, "/api/categories/"+h.catID+"/import-template.csv").Body.String()
	if !strings.Contains(body, "servicetag") {
		t.Errorf("the template should offer the column: %s", body)
	}
}

// The list narrows by model, which is what makes a model field's column worth
// showing at all (decision 103).
func TestAssetsFilterByModel(t *testing.T) {
	h := newHarness(t)
	dell, _ := modelWithField(t, h, "Latitude 5420", "servicetag", false)
	other := decode[map[string]any](t, h.post(t, "/api/models",
		`{"name":"ThinkPad T14","vendor":"Lenovo","category_ids":["`+h.catID+`"]}`))
	otherID, _ := other["id"].(string)

	for i, m := range []string{dell, otherID} {
		if rec := h.post(t, "/api/assets", `{"category_id":"`+h.catID+`","owner_id":"`+h.userID+
			`","holder_type":"entity","holder_id":"`+h.locID+`","model_id":"`+m+
			`","attrs":{"mac":"001A2B3C4F0`+strconv.Itoa(i)+`"}}`); rec.Code != http.StatusCreated {
			t.Fatal(rec.Body.String())
		}
	}

	body := h.get(t, "/api/assets?model_id="+dell).Body.String()
	if !strings.Contains(body, `"total":1`) {
		t.Errorf("only the one model's devices should come back: %s", body)
	}
}

// The column belongs to the category, the value belongs to the device. Once an
// asset's model no longer has the field, its stored value is archived -- and
// the export must not go on showing it as though it were live.
//
// Found by walking the quickstart against a running server: the column was
// right and the cell was wrong.
func TestExportLeavesTheCellEmptyForAnotherModel(t *testing.T) {
	h := newHarness(t)
	dell, _ := modelWithField(t, h, "Latitude 5420", "servicetag", false)
	lenovo := decode[map[string]any](t, h.post(t, "/api/models",
		`{"name":"ThinkPad T14","vendor":"Lenovo","category_ids":["`+h.catID+`"]}`))
	lenovoID, _ := lenovo["id"].(string)

	created := decode[map[string]any](t, h.post(t, "/api/assets",
		`{"category_id":"`+h.catID+`","owner_id":"`+h.userID+
			`","holder_type":"entity","holder_id":"`+h.locID+`","model_id":"`+dell+
			`","attrs":{"mac":"001A2B3C4D77","servicetag":"KEEPME"}}`))
	id, _ := created["id"].(string)
	version, _ := created["version"].(float64)

	// Move it to a model that does not have the field.
	if rec := h.patch(t, "/api/assets/"+id, `{"category_id":"`+h.catID+`","owner_id":"`+h.userID+
		`","holder_type":"entity","holder_id":"`+h.locID+`","model_id":"`+lenovoID+
		`","attrs":{"mac":"001A2B3C4D77"},"version":`+strconv.Itoa(int(version))+`}`); rec.Code != http.StatusOK {
		t.Fatal(rec.Body.String())
	}

	body := h.get(t, "/api/export.csv?category_id="+h.catID).Body.String()
	if !strings.Contains(body, "servicetag") && !strings.Contains(body, "ServiceTag") {
		t.Fatalf("the column should still stand: %s", body)
	}
	if strings.Contains(body, "KEEPME") {
		t.Errorf("an archived value must not be exported as a live one: %s", body)
	}
}

// Creating a field and binding it to models in one step, the way creating and
// binding to categories has worked since v6 decision 72. Without it the only
// route to a model field was create-then-edit, and the create dialog would have
// to offer one of the two modes and hide the other.
func TestCreateFieldBoundToModels(t *testing.T) {
	h := newHarness(t)
	m := decode[map[string]any](t, h.post(t, "/api/models",
		`{"name":"Latitude 5420","vendor":"Dell","category_ids":["`+h.catID+`"]}`))
	modelID, _ := m["id"].(string)

	created := decode[map[string]any](t, h.post(t, "/api/fields",
		`{"key":"servicetag","label":"ServiceTag","type":"text","is_unique":true,
		  "model_ids":["`+modelID+`"],"required":true}`))
	if created["id"] == nil {
		t.Fatalf("create: %v", created)
	}

	body := h.get(t, "/api/fields").Body.String()
	if !strings.Contains(body, modelID) {
		t.Errorf("the new field should come back bound to the model: %s", body)
	}
	if !strings.Contains(body, `"binding_mode":"model"`) {
		t.Errorf("and in model mode: %s", body)
	}
	// Required is per binding, so the row says where, not just whether.
	if !strings.Contains(body, `"required_in":["`+modelID+`"]`) {
		t.Errorf("the required binding should be named: %s", body)
	}
}

// The two modes stay exclusive whichever door they arrive through: asking for
// both on a create is the same mistake as binding both later, and the field
// must not be left behind half-bound.
func TestCreateFieldRefusesBothBindingModes(t *testing.T) {
	h := newHarness(t)
	m := decode[map[string]any](t, h.post(t, "/api/models",
		`{"name":"Latitude 5420","vendor":"Dell","category_ids":["`+h.catID+`"]}`))
	modelID, _ := m["id"].(string)

	rec := h.post(t, "/api/fields",
		`{"key":"servicetag","label":"ServiceTag","type":"text",
		  "category_ids":["`+h.catID+`"],"model_ids":["`+modelID+`"]}`)
	if rec.Code == http.StatusCreated {
		t.Fatalf("both modes at once should be refused: %s", rec.Body.String())
	}
	if body := h.get(t, "/api/fields").Body.String(); strings.Contains(body, "servicetag") {
		t.Errorf("a refused create must leave no field behind: %s", body)
	}
}

// A field required on one category and optional on another cannot be reported
// with a single flag, so the row names the bindings that ask for a value.
func TestRequiredIsReportedPerBinding(t *testing.T) {
	h := newHarness(t)
	// A separate chain, because the same key may not be bound twice on one.
	other := decode[map[string]any](t, h.post(t, "/api/categories",
		`{"code":"PRN","name":"打印机"}`))
	otherID, _ := other["id"].(string)

	f := decode[map[string]any](t, h.post(t, "/api/fields",
		`{"key":"rack","label":"机柜","type":"text","category_ids":["`+h.catID+`"],"required":true}`))
	fieldID, _ := f["id"].(string)
	if rec := h.post(t, "/api/categories/"+otherID+"/bindings",
		`{"field_id":"`+fieldID+`","required":false}`); rec.Code != http.StatusNoContent {
		t.Fatalf("bind to the other category: %s", rec.Body.String())
	}

	body := h.get(t, "/api/fields").Body.String()
	if !strings.Contains(body, `"required_in":["`+h.catID+`"]`) {
		t.Errorf("only the binding that asks for a value should be listed: %s", body)
	}
}
