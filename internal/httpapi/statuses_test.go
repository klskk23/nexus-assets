package httpapi

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/klskk23/nexus-assets/internal/model"
)

func TestStatusListIsSeededAndOrdered(t *testing.T) {
	h := newHarness(t)

	res := h.do(t, http.MethodGet, "/api/statuses", "")
	if res.Code != http.StatusOK {
		t.Fatalf("list: %d %s", res.Code, res.Body)
	}
	var list []model.Status
	if err := json.Unmarshal(res.Body.Bytes(), &list); err != nil {
		t.Fatal(err)
	}
	if len(list) != 5 {
		t.Fatalf("got %d statuses, want 5", len(list))
	}
	if list[0].Key != model.StatusInStock || list[0].Color != "green" {
		t.Errorf("first entry = %+v, want in_stock/green", list[0])
	}
}

// The whole feature in one pass: add a status, move a device into it, and see
// it counted -- the pipeline, the transition check and the overview all read
// the same rows.
func TestCustomStatusIsUsableEndToEnd(t *testing.T) {
	h := newHarness(t)
	h.seed(t, 1, 1)

	res := h.do(t, http.MethodPost, "/api/statuses",
		`{"key":"on_loan","label":"外借中","color":"violet","counts_as_available":true}`)
	if res.Code != http.StatusCreated {
		t.Fatalf("create status: %d %s", res.Code, res.Body)
	}

	id := h.firstAssetID(t)
	res = h.do(t, http.MethodPost, "/api/transfers",
		`{"asset_ids":["`+id+`"],"to_status":"on_loan","note":"借给客户"}`)
	if res.Code != http.StatusOK && res.Code != http.StatusCreated {
		t.Fatalf("transfer into the new status: %d %s", res.Code, res.Body)
	}

	res = h.do(t, http.MethodGet, "/api/overview", "")
	var ov struct {
		StatusCounts []struct {
			Status string `json:"status"`
			Count  int    `json:"count"`
		} `json:"status_counts"`
	}
	if err := json.Unmarshal(res.Body.Bytes(), &ov); err != nil {
		t.Fatal(err)
	}
	var found bool
	for _, s := range ov.StatusCounts {
		if s.Status == "on_loan" {
			found = true
			if s.Count != 1 {
				t.Errorf("on_loan count = %d, want 1", s.Count)
			}
		}
	}
	if !found {
		t.Errorf("the new status should have a card of its own, got %+v", ov.StatusCounts)
	}

	// And it now refuses to be deleted, naming what is in the way.
	res = h.do(t, http.MethodDelete, "/api/statuses/on_loan", "")
	if res.Code != http.StatusConflict {
		t.Fatalf("delete while in use: %d %s", res.Code, res.Body)
	}
	if !strings.Contains(res.Body.String(), "1 台") {
		t.Errorf("refusal should say how many devices are in the way, got %s", res.Body)
	}
}

// A rejected key or colour is the operator's to fix in one edit. Reporting it
// as a 500 would say the server broke.
func TestBadStatusInputIsAValidationFailureNotAnInternalError(t *testing.T) {
	h := newHarness(t)

	for _, body := range []string{
		`{"key":"On Loan","label":"外借中","color":"violet"}`,
		`{"key":"on_loan","label":"外借中","color":"#ff00aa"}`,
	} {
		res := h.do(t, http.MethodPost, "/api/statuses", body)
		if res.Code != http.StatusUnprocessableEntity {
			t.Errorf("%s gave %d, want 422: %s", body, res.Code, res.Body)
		}
		if strings.Contains(res.Body.String(), "内部错误") {
			t.Errorf("%s should explain what to fix, got %s", body, res.Body)
		}
	}

	// A duplicate key is a conflict, and the message has to name it.
	if res := h.do(t, http.MethodPost, "/api/statuses",
		`{"key":"in_stock","label":"重复","color":"red"}`); res.Code != http.StatusConflict {
		t.Errorf("duplicate key gave %d, want 409: %s", res.Code, res.Body)
	}
}

func TestBuiltinStatusDeleteIsRefused(t *testing.T) {
	h := newHarness(t)

	res := h.do(t, http.MethodDelete, "/api/statuses/retired", "")
	if res.Code != http.StatusConflict {
		t.Fatalf("got %d, want 409: %s", res.Code, res.Body)
	}
	if !strings.Contains(res.Body.String(), "已报废") {
		t.Errorf("refusal should name the status, got %s", res.Body)
	}
}

func TestUnknownStatusIsRefusedOnTransfer(t *testing.T) {
	h := newHarness(t)
	h.seed(t, 1, 1)

	res := h.do(t, http.MethodPost, "/api/transfers",
		`{"asset_ids":["`+h.firstAssetID(t)+`"],"to_status":"invented"}`)
	if res.Code != http.StatusUnprocessableEntity {
		t.Fatalf("got %d, want 422: %s", res.Code, res.Body)
	}
}
