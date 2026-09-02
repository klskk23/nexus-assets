package httpapi

import (
	"net/http"
	"testing"
)

type rowPage struct {
	Columns []string            `json:"columns"`
	Rows    []map[string]string `json:"rows"`
	Total   int                 `json:"total"`
	Offset  int                 `json:"offset"`
	Limit   int                 `json:"limit"`
}

// The tabular view anything outside this system reads: a spreadsheet, a report,
// a label printer. Columns are field keys, not labels, so a consumer binds to
// something that survives someone renaming a field for readability.
func TestRowsUsesFieldKeysAsColumns(t *testing.T) {
	h := newHarness(t)
	h.seed(t, 0, 2)

	page := decode[rowPage](t, h.get(t, "/api/rows?category_id="+h.catID))
	if page.Total != 2 || len(page.Rows) != 2 {
		t.Fatalf("rows = %d of %d, want 2 of 2", len(page.Rows), page.Total)
	}

	want := []string{
		"sys_id", "sys_sn", "sys_category", "sys_status",
		"sys_holder", "sys_owner", "sys_model", "sys_note", "sys_created_at",
		"mac", "sn",
	}
	if len(page.Columns) != len(want) {
		t.Fatalf("columns = %v, want %v", page.Columns, want)
	}
	for i, c := range want {
		if page.Columns[i] != c {
			t.Errorf("column %d = %q, want %q", i, page.Columns[i], c)
		}
	}

	// Every row carries exactly the declared columns: a consumer that trusts
	// the header must not meet a row that is missing one of them.
	for _, row := range page.Rows {
		if len(row) != len(page.Columns) {
			t.Fatalf("row has %d values for %d columns: %v", len(row), len(page.Columns), row)
		}
		for _, c := range page.Columns {
			if _, ok := row[c]; !ok {
				t.Errorf("row is missing column %q", c)
			}
		}
		if row["sys_sn"] == "" || row["mac"] == "" {
			t.Errorf("values did not come through: %v", row)
		}
		// The built-ins are rendered, not raw: a label saying an id helps nobody.
		if row["sys_status"] != "在库" {
			t.Errorf("status should read as a person reads it, got %q", row["sys_status"])
		}
	}
}

// Field keys are only unique within one category's chain, so a column called
// "rack" means nothing across categories -- and the caller cannot tell. The
// refusal names the parameter so it can be acted on.
func TestRowsRefusesWithoutACategory(t *testing.T) {
	h := newHarness(t)
	h.seed(t, 0, 1)

	rec := h.get(t, "/api/rows")
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("rows without a category = %d, want 422", rec.Code)
	}
	if _, ok := decode[Envelope](t, rec).Error.Fields["category_id"]; !ok {
		t.Errorf("the refusal should hang off category_id, got %s", rec.Body.String())
	}
}

// "Print the ones I ticked" is the whole reason this takes ids.
func TestRowsNarrowsToTheGivenIDs(t *testing.T) {
	h := newHarness(t)
	h.seed(t, 0, 3)

	all := decode[rowPage](t, h.get(t, "/api/rows?category_id="+h.catID))
	if all.Total != 3 {
		t.Fatalf("seeded %d rows, want 3", all.Total)
	}
	first, second := all.Rows[0]["sys_id"], all.Rows[1]["sys_id"]

	got := decode[rowPage](t, h.get(t,
		"/api/rows?category_id="+h.catID+"&ids="+first+","+second))
	if got.Total != 2 {
		t.Fatalf("narrowed to %d rows, want 2", got.Total)
	}
	for _, row := range got.Rows {
		if row["sys_id"] != first && row["sys_id"] != second {
			t.Errorf("row %s was not asked for", row["sys_id"])
		}
	}

	// An id that matches nothing is an empty result, not everything.
	none := decode[rowPage](t, h.get(t, "/api/rows?category_id="+h.catID+"&ids=nobody"))
	if none.Total != 0 {
		t.Errorf("an unknown id returned %d rows", none.Total)
	}
}

// The endpoint exists so a script can read it, and a script holds an API key.
func TestRowsAcceptsAnAPIKey(t *testing.T) {
	h := newHarness(t)
	h.seed(t, 0, 1)

	created := decode[struct {
		Secret string `json:"secret"`
	}](t, h.post(t, "/api/api-keys", `{"name":"标签打印","days":0}`))

	rec := h.getWithKey(t, "/api/rows?category_id="+h.catID, created.Secret)
	if rec.Code != http.StatusOK {
		t.Fatalf("with an api key = %d %s", rec.Code, rec.Body.String())
	}
	if decode[rowPage](t, rec).Total != 1 {
		t.Error("the key should see the same rows a person does")
	}
}

// These strings go onto a label a person picks up, so a stored true has to
// come out as a word. Which word is the reader's language -- unlike a status
// label, which is configured data and reads the same in both.
func TestRowsRendersValuesForTheReader(t *testing.T) {
	h := newHarness(t)

	rec := h.post(t, "/api/fields", `{"key":"managed","label":"纳管","type":"boolean"}`)
	if rec.Code != http.StatusCreated {
		t.Fatal(rec.Body.String())
	}
	fieldID := decode[map[string]any](t, rec)["id"].(string)
	if b := h.post(t, "/api/categories/"+h.catID+"/bindings",
		`{"field_id":"`+fieldID+`","required":false,"sort":30}`); b.Code != http.StatusNoContent {
		t.Fatal(b.Body.String())
	}
	if a := h.post(t, "/api/assets", `{"category_id":"`+h.catID+`","status":"in_stock","owner_id":"`+
		h.userID+`","holder_type":"entity","holder_id":"`+h.locID+
		`","attrs":{"mac":"001A2B3C9001","managed":"true"}}`); a.Code != http.StatusCreated {
		t.Fatal(a.Body.String())
	}

	zh := decode[rowPage](t, h.get(t, "/api/rows?category_id="+h.catID))
	if zh.Rows[0]["managed"] != "是" {
		t.Errorf("boolean in Chinese = %q, want 是", zh.Rows[0]["managed"])
	}
	en := decode[rowPage](t, h.doLang(t, "en", http.MethodGet, "/api/rows?category_id="+h.catID, ""))
	if en.Rows[0]["managed"] != "Yes" {
		t.Errorf("boolean in English = %q, want Yes", en.Rows[0]["managed"])
	}
	// A status label is configured data, not translated copy: it reads the same
	// either way, and a consumer should not expect otherwise.
	if en.Rows[0]["sys_status"] != zh.Rows[0]["sys_status"] {
		t.Errorf("status labels are data and must not be translated: %q vs %q",
			en.Rows[0]["sys_status"], zh.Rows[0]["sys_status"])
	}
}
