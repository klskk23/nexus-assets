package httpapi

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/klskk23/nexus-assets/internal/asset"
	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/schema"
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

// TestExportOfTickedDevicesSplitsByCategory covers the selection export: what
// was ticked, not what is filtered, and one file per category because past the
// fixed columns a category's columns are its own fields.
func TestExportOfTickedDevicesSplitsByCategory(t *testing.T) {
	h := newHarness(t)
	h.seed(t, 0, 2)
	// Captured before the third device exists, so this is one of the seeded
	// category's own: the list is newest first.
	one := h.assetIDs(t)[0]

	// A second category with a field of its own, and one device in it.
	other, err := h.schema.CreateCategory(h.ctx, schema.CreateCategoryInput{Code: "OF", Name: "办公设备"})
	if err != nil {
		t.Fatal(err)
	}
	tag, err := h.schema.CreateField(h.ctx, schema.CreateFieldInput{
		Key: "asset_tag", Label: "资产标签", Type: model.FieldText,
		CategoryIDs: []string{other.ID},
	})
	if err != nil {
		t.Fatal(err)
	}
	_ = tag
	third, err := h.assets.Save(h.ctx, asset.SaveInput{
		CategoryID: other.ID, Status: model.StatusInStock, OwnerID: h.userID,
		Holder:  model.Holder{Type: model.HolderTypeEntity, ID: h.locID},
		Attrs:   map[string]any{"asset_tag": "OF-0001"},
		ActorID: h.userID,
	})
	if err != nil {
		t.Fatal(err)
	}

	// One category ticked: a plain CSV, named for it, holding only that device.
	rec := h.get(t, "/api/export.csv?ids="+one)
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d: %s", rec.Code, rec.Body.String())
	}
	if ct := rec.Header().Get("Content-Type"); !strings.HasPrefix(ct, "text/csv") {
		t.Errorf("one category should come back as a CSV, got %s", ct)
	}
	if n := strings.Count(strings.TrimSpace(rec.Body.String()), "\n"); n != 1 {
		t.Errorf("expected a header and one row, got %d line breaks: %s", n, rec.Body.String())
	}

	// Two categories ticked: a zip with one CSV each, each carrying its own
	// category's fields.
	rec = h.get(t, "/api/export.csv?ids="+one+","+third.ID)
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d: %s", rec.Code, rec.Body.String())
	}
	if ct := rec.Header().Get("Content-Type"); ct != "application/zip" {
		t.Fatalf("two categories should come back zipped, got %s", ct)
	}
	zr, err := zip.NewReader(bytes.NewReader(rec.Body.Bytes()), int64(rec.Body.Len()))
	if err != nil {
		t.Fatalf("the archive does not open: %v", err)
	}
	got := map[string]string{}
	for _, f := range zr.File {
		r, err := f.Open()
		if err != nil {
			t.Fatal(err)
		}
		b, err := io.ReadAll(r)
		if err != nil {
			t.Fatal(err)
		}
		got[f.Name] = string(b)
	}
	if len(got) != 2 {
		t.Fatalf("expected one file per category, got %v", got)
	}
	if !strings.Contains(got["办公设备.csv"], "资产标签") {
		t.Errorf("each file should carry its own category's fields: %q", got["办公设备.csv"])
	}
	if strings.Contains(got["办公设备.csv"], "基准 MAC") {
		t.Error("a category's file must not carry another category's columns")
	}
	if !strings.Contains(got["SDWAN 路由器.csv"], "基准 MAC") {
		t.Errorf("the other file lost its own columns: %q", got["SDWAN 路由器.csv"])
	}

	// Nothing ticked is refused the same way an export with no category is:
	// there is no category to take columns from either way.
	if rec := h.get(t, "/api/export.csv?ids="); rec.Code != http.StatusUnprocessableEntity {
		t.Errorf("an empty selection should be refused, got %d", rec.Code)
	}
}
