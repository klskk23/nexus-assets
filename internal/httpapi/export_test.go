package httpapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// TestExportRefusesWithoutACategory keeps the refusal at the boundary rather
// than in a disabled button: the address is one somebody can type.
func TestExportRefusesWithoutACategory(t *testing.T) {
	h := newHarness(t)
	h.seed(t, 0, 1)

	rec := h.get(t, "/api/export.csv")
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected a refusal, got %d: %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "category_id") {
		t.Errorf("the refusal should name the field that is missing: %s", rec.Body.String())
	}
}

// TestExportTakesTheChosenFields covers the three states of the parameter,
// which are three different requests and not two.
func TestExportTakesTheChosenFields(t *testing.T) {
	h := newHarness(t)
	h.seed(t, 0, 1)

	all := h.get(t, "/api/export.csv?category_id="+h.catID)
	if all.Code != http.StatusOK {
		t.Fatalf("status %d: %s", all.Code, all.Body.String())
	}
	if !strings.Contains(header(all.Body.String()), "基准 MAC") {
		t.Errorf("saying nothing should export every field: %q", header(all.Body.String()))
	}

	none := h.get(t, "/api/export.csv?category_id="+h.catID+"&fields=")
	if !strings.Contains(header(none.Body.String()), "资产编号") {
		t.Errorf("the fixed columns stay whatever is chosen: %q", header(none.Body.String()))
	}
	if strings.Contains(header(none.Body.String()), "基准 MAC") {
		t.Errorf("an empty choice is a choice, not a missing one: %q", header(none.Body.String()))
	}

	one := h.get(t, "/api/export.csv?category_id="+h.catID+"&fields=sn")
	head := header(one.Body.String())
	if !strings.Contains(head, "设备编号") || strings.Contains(head, "基准 MAC") {
		t.Errorf("only the chosen field should be there: %q", head)
	}
}

// header is the first CSV line, past the byte-order mark Excel needs.
func header(body string) string {
	return strings.SplitN(strings.TrimPrefix(body, "\ufeff"), "\n", 2)[0]
}

// TestHealthAnswersWithoutACredential pins what a container runtime and a
// reverse proxy rely on: an answer, without a token, that means the process can
// still reach its database.
func TestHealthAnswersWithoutACredential(t *testing.T) {
	h := newHarness(t)

	req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	rec := httptest.NewRecorder()
	h.router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status %d: %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), `"status":"ok"`) {
		t.Errorf("unexpected body: %s", rec.Body.String())
	}
}

// TestCreateFieldBindsInOneStep covers the create path a field editor needs:
// a field that is bound nowhere is on no form, so creating one and binding it
// used to be two trips through two dialogs.
func TestCreateFieldBindsInOneStep(t *testing.T) {
	h := newHarness(t)

	rec := h.do(t, http.MethodPost, "/api/fields", `{
		"key":"rack","label":"机柜位","type":"text",
		"category_ids":["`+h.catID+`"],"required":true}`)
	if rec.Code != http.StatusCreated {
		t.Fatalf("status %d: %s", rec.Code, rec.Body.String())
	}

	// Bound, and bound as required -- the flag travels with it.
	schema := h.get(t, "/api/categories/"+h.catID+"/schema").Body.String()
	if !strings.Contains(schema, `"key":"rack"`) {
		t.Fatalf("the new field is not on the category: %s", schema)
	}

	// A key already on that chain is refused, and the field is not left behind
	// half-created: the pair is the request, and half of it is worth nothing.
	rec = h.do(t, http.MethodPost, "/api/fields", `{
		"key":"rack","label":"另一个机柜位","type":"text",
		"category_ids":["`+h.catID+`"]}`)
	if rec.Code != http.StatusConflict {
		t.Fatalf("a duplicate key on one chain should be refused, got %d: %s", rec.Code, rec.Body.String())
	}
	list := h.get(t, "/api/fields?limit=100").Body.String()
	if strings.Contains(list, "另一个机柜位") {
		t.Error("the refused field was still created; create and bind must be one transaction")
	}
}

// TestAssetNoteTravelsEverywhereTheBuiltInsDo pins the note as a built-in
// alongside category, status, holder and owner: it is written over HTTP, comes
// back on read, and appears in both tabular views.
func TestAssetNoteTravelsEverywhereTheBuiltInsDo(t *testing.T) {
	h := newHarness(t)
	h.seed(t, 0, 1)
	id := h.firstAssetID(t)

	var before struct {
		Asset struct {
			Version int            `json:"version"`
			Attrs   map[string]any `json:"attrs"`
		} `json:"asset"`
	}
	if err := json.Unmarshal(h.get(t, "/api/assets/"+id).Body.Bytes(), &before); err != nil {
		t.Fatal(err)
	}

	// The whole record is sent, as the form does: this is a full save with a
	// note added, not a patch of one column.
	attrs, err := json.Marshal(before.Asset.Attrs)
	if err != nil {
		t.Fatal(err)
	}
	rec := h.patch(t, "/api/assets/"+id,
		`{"category_id":"`+h.catID+`","owner_id":"`+h.userID+`","holder_type":"entity","holder_id":"`+
			h.locID+`","version":`+itoa(before.Asset.Version)+`,"attrs":`+string(attrs)+
			`,"note":"借给上海试点，移动前先问"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d: %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "借给上海试点") {
		t.Errorf("the note should come back on the response: %s", rec.Body.String())
	}
	if !strings.Contains(h.get(t, "/api/assets/"+id).Body.String(), "借给上海试点") {
		t.Error("the note did not survive a reload")
	}

	csv := h.get(t, "/api/export.csv?category_id="+h.catID).Body.String()
	if !strings.Contains(header(csv), "备注") || !strings.Contains(csv, "借给上海试点") {
		t.Errorf("the export should carry the note: %q", csv)
	}
	rows := h.get(t, "/api/rows?category_id="+h.catID).Body.String()
	if !strings.Contains(rows, `"sys_note"`) || !strings.Contains(rows, "借给上海试点") {
		t.Errorf("the row view should carry the note: %s", rows)
	}
}
