package httpapi

import (
	"encoding/json"
	"net/http"
	"strconv"
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

func TestHolderDeleteAndUsage(t *testing.T) {
	h := newHarness(t)

	res := h.do(t, http.MethodPost, "/api/holders", `{"type":"company","name":"旧客户"}`)
	var co model.HolderEntity
	if err := json.Unmarshal(res.Body.Bytes(), &co); err != nil {
		t.Fatal(err)
	}

	res = h.do(t, http.MethodGet, "/api/holders/"+co.ID+"/usage", "")
	if res.Code != http.StatusOK {
		t.Fatalf("usage: %d %s", res.Code, res.Body)
	}
	var usage struct {
		Assets, Children, History int
	}
	if err := json.Unmarshal(res.Body.Bytes(), &usage); err != nil {
		t.Fatal(err)
	}
	if usage != (struct{ Assets, Children, History int }{0, 0, 0}) {
		t.Errorf("an unused holder should cost nothing, got %+v", usage)
	}

	if res := h.do(t, http.MethodDelete, "/api/holders/"+co.ID, ""); res.Code != http.StatusNoContent {
		t.Fatalf("delete: %d %s", res.Code, res.Body)
	}
	if res := h.do(t, http.MethodGet, "/api/holders/"+co.ID+"/usage", ""); res.Code != http.StatusNotFound {
		t.Errorf("the holder should be gone, got %d", res.Code)
	}
}

func TestDeletingAParentIsRefusedAndNamesTheCount(t *testing.T) {
	h := newHarness(t)

	res := h.do(t, http.MethodPost, "/api/holders", `{"type":"company","name":"XX 集团"}`)
	var co model.HolderEntity
	if err := json.Unmarshal(res.Body.Bytes(), &co); err != nil {
		t.Fatal(err)
	}
	if res := h.do(t, http.MethodPost, "/api/holders",
		`{"type":"department","name":"运维部","parent_id":"`+co.ID+`"}`); res.Code != http.StatusCreated {
		t.Fatalf("create department: %d %s", res.Code, res.Body)
	}

	res = h.do(t, http.MethodDelete, "/api/holders/"+co.ID, "")
	if res.Code != http.StatusConflict {
		t.Fatalf("got %d, want 409: %s", res.Code, res.Body)
	}
	if !strings.Contains(res.Body.String(), "下级") {
		t.Errorf("the refusal should say what is in the way, got %s", res.Body)
	}
}

// Check-in has to name somewhere specific to return to, so the default stock
// point is still required to be a location -- unrelated to the status
// constraint 007 removed. It used to arrive as a 500, which told the operator
// the server broke rather than that their choice needs one edit.
func TestOnlyALocationCanBeTheDefaultStockPoint(t *testing.T) {
	h := newHarness(t)

	res := h.do(t, http.MethodPost, "/api/holders", `{"type":"company","name":"XX 集团"}`)
	var co model.HolderEntity
	if err := json.Unmarshal(res.Body.Bytes(), &co); err != nil {
		t.Fatal(err)
	}

	res = h.do(t, http.MethodPatch, "/api/holders/"+co.ID, `{"is_default_stock":true}`)
	if res.Code != http.StatusUnprocessableEntity {
		t.Fatalf("got %d, want 422: %s", res.Code, res.Body)
	}
	body := res.Body.String()
	if strings.Contains(body, "内部错误") {
		t.Errorf("this is the operator's to fix in one edit, got %s", body)
	}
	if !strings.Contains(body, "is_default_stock") {
		t.Errorf("the refusal should name the field, got %s", body)
	}
}

// A device's home is where check-in returns it, and a batch from two
// warehouses goes back to two warehouses. The global default stock point is
// only the fallback for devices that never named one.
func TestCheckinReturnsDevicesToTheirOwnHome(t *testing.T) {
	h := newHarness(t)
	h.seed(t, 1, 1)

	res := h.do(t, http.MethodPost, "/api/holders", `{"type":"location","name":"北京仓库"}`)
	var other model.HolderEntity
	if err := json.Unmarshal(res.Body.Bytes(), &other); err != nil {
		t.Fatal(err)
	}
	id := h.firstAssetID(t)

	// Recording set the home to where it was recorded; move it to Beijing.
	res = h.do(t, http.MethodGet, "/api/assets/"+id, "")
	var wrapper struct {
		Asset model.Asset `json:"asset"`
	}
	if err := json.Unmarshal(res.Body.Bytes(), &wrapper); err != nil {
		t.Fatal(err)
	}
	if wrapper.Asset.HomeHolder == nil || wrapper.Asset.HomeHolder.ID != h.locID {
		t.Fatalf("a new device should be at home where it was recorded, got %+v", wrapper.Asset.HomeHolder)
	}

	body := `{"category_id":"` + wrapper.Asset.CategoryID + `","owner_id":"` + h.userID +
		`","holder_type":"entity","holder_id":"` + h.locID +
		`","home_holder_type":"entity","home_holder_id":"` + other.ID +
		`","version":` + strconv.Itoa(wrapper.Asset.Version) + `,"attrs":` + attrsJSON(t, wrapper.Asset) + `}`
	if res := h.do(t, http.MethodPatch, "/api/assets/"+id, body); res.Code != http.StatusOK {
		t.Fatalf("move the home: %d %s", res.Code, res.Body)
	}

	// Out and back.
	if res := h.do(t, http.MethodPost, "/api/transfers",
		`{"asset_ids":["`+id+`"],"to_status":"in_use","to_holder_type":"user","to_holder_id":"`+
			h.userID+`"}`); res.Code != http.StatusOK && res.Code != http.StatusCreated {
		t.Fatalf("check out: %d %s", res.Code, res.Body)
	}
	res = h.do(t, http.MethodPost, "/api/transfers",
		`{"asset_ids":["`+id+`"],"to_status":"in_stock","check_in":true}`)
	if res.Code != http.StatusOK && res.Code != http.StatusCreated {
		t.Fatalf("check in: %d %s", res.Code, res.Body)
	}
	if !strings.Contains(res.Body.String(), other.ID) {
		t.Errorf("it should have gone home to Beijing, got %s", res.Body)
	}
}

func attrsJSON(t *testing.T, a model.Asset) string {
	t.Helper()
	b, err := json.Marshal(a.Attrs)
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}
