package httpapi

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/klskk23/nexus-assets/internal/model"
)

func TestDepartmentWithoutACompanyIsAValidationFailure(t *testing.T) {
	h := newHarness(t)

	res := h.do(t, http.MethodPost, "/api/holders", `{"type":"department","name":"运维部"}`)
	if res.Code != http.StatusUnprocessableEntity {
		t.Fatalf("got %d, want 422: %s", res.Code, res.Body)
	}
	// Reported against the field the operator has to change.
	if !strings.Contains(res.Body.String(), "parent_id") {
		t.Errorf("refusal should name parent_id, got %s", res.Body)
	}
}

func TestHolderNoteAndParentRoundTrip(t *testing.T) {
	h := newHarness(t)

	res := h.do(t, http.MethodPost, "/api/holders",
		`{"type":"company","name":"XX 集团","note":"总部"}`)
	if res.Code != http.StatusCreated {
		t.Fatalf("create company: %d %s", res.Code, res.Body)
	}
	var co model.HolderEntity
	if err := json.Unmarshal(res.Body.Bytes(), &co); err != nil {
		t.Fatal(err)
	}
	if co.Note != "总部" {
		t.Errorf("note = %q", co.Note)
	}

	res = h.do(t, http.MethodPost, "/api/holders",
		`{"type":"department","name":"运维部","parent_id":"`+co.ID+`"}`)
	if res.Code != http.StatusCreated {
		t.Fatalf("create department: %d %s", res.Code, res.Body)
	}

	res = h.do(t, http.MethodPatch, "/api/holders/"+co.ID, `{"note":"改到 B 座"}`)
	if res.Code != http.StatusOK {
		t.Fatalf("patch note: %d %s", res.Code, res.Body)
	}
	if !strings.Contains(res.Body.String(), "改到 B 座") {
		t.Errorf("patched note not returned: %s", res.Body)
	}
}

// The reported bug: 转移 sends no status, so the asset stays in stock, and
// picking a department came back as a complaint about the status.
func TestInStockAssetCanBeHandedToADepartment(t *testing.T) {
	h := newHarness(t)
	h.seed(t, 1, 1)

	res := h.do(t, http.MethodPost, "/api/holders", `{"type":"company","name":"XX 集团"}`)
	var co model.HolderEntity
	if err := json.Unmarshal(res.Body.Bytes(), &co); err != nil {
		t.Fatal(err)
	}
	res = h.do(t, http.MethodPost, "/api/holders",
		`{"type":"department","name":"运维部","parent_id":"`+co.ID+`"}`)
	var dept model.HolderEntity
	if err := json.Unmarshal(res.Body.Bytes(), &dept); err != nil {
		t.Fatal(err)
	}

	id := h.firstAssetID(t)
	res = h.do(t, http.MethodPost, "/api/transfers",
		`{"asset_ids":["`+id+`"],"to_holder_type":"entity","to_holder_id":"`+dept.ID+`"}`)
	if res.Code != http.StatusOK && res.Code != http.StatusCreated {
		t.Fatalf("handing stock to a department: %d %s", res.Code, res.Body)
	}
}

// Turning the switch back on restores the refusal -- and it now names the
// holder field, not the status the operator never touched.
func TestLocationConstraintRefusalNamesTheHolderField(t *testing.T) {
	h := newHarness(t)
	h.seed(t, 1, 1)

	if res := h.do(t, http.MethodPatch, "/api/statuses/in_stock",
		`{"requires_location":true}`); res.Code != http.StatusOK {
		t.Fatalf("switch the constraint on: %d %s", res.Code, res.Body)
	}
	res := h.do(t, http.MethodPost, "/api/holders", `{"type":"company","name":"XX 集团"}`)
	var co model.HolderEntity
	if err := json.Unmarshal(res.Body.Bytes(), &co); err != nil {
		t.Fatal(err)
	}

	res = h.do(t, http.MethodPost, "/api/transfers",
		`{"asset_ids":["`+h.firstAssetID(t)+`"],"to_holder_type":"entity","to_holder_id":"`+co.ID+`"}`)
	if res.Code != http.StatusUnprocessableEntity {
		t.Fatalf("got %d, want 422: %s", res.Code, res.Body)
	}
	body := res.Body.String()
	if !strings.Contains(body, "to_holder_id") {
		t.Errorf("refusal should be tagged to the holder field, got %s", body)
	}
	if strings.Contains(body, "to_status") {
		t.Errorf("refusal must not blame the status nobody changed, got %s", body)
	}
}

// Checking out to an entity may name who is responsible for it.
func TestCheckoutToAnEntityCanNameAnOwner(t *testing.T) {
	h := newHarness(t)
	h.seed(t, 1, 1)

	res := h.do(t, http.MethodPost, "/api/holders", `{"type":"company","name":"XX 集团"}`)
	var co model.HolderEntity
	if err := json.Unmarshal(res.Body.Bytes(), &co); err != nil {
		t.Fatal(err)
	}

	id := h.firstAssetID(t)
	res = h.do(t, http.MethodPost, "/api/transfers",
		`{"asset_ids":["`+id+`"],"to_status":"in_use","to_holder_type":"entity",`+
			`"to_holder_id":"`+co.ID+`","to_owner_id":"`+h.userID+`"}`)
	if res.Code != http.StatusOK && res.Code != http.StatusCreated {
		t.Fatalf("checkout with an owner: %d %s", res.Code, res.Body)
	}

	res = h.do(t, http.MethodGet, "/api/assets/"+id, "")
	var wrapper struct {
		Asset struct {
			Owner *struct {
				ID string `json:"id"`
			} `json:"owner"`
			Holder struct {
				ID string `json:"id"`
			} `json:"holder"`
		} `json:"asset"`
	}
	if err := json.Unmarshal(res.Body.Bytes(), &wrapper); err != nil {
		t.Fatal(err)
	}
	a := wrapper.Asset
	if a.Holder.ID != co.ID {
		t.Errorf("holder = %s, want the company", a.Holder.ID)
	}
	if a.Owner == nil || a.Owner.ID != h.userID {
		t.Errorf("owner = %+v, want the account that was named", a.Owner)
	}
}
