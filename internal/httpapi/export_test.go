package httpapi

import (
	"net/http"
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
