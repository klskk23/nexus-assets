package httpapi

import (
	"net/http"
	"strings"
	"testing"

	"github.com/klskk23/nexus-assets/internal/authz"
)

// newField creates a field bound to nothing and returns its id.
func newField(t *testing.T, h *harness, key string) string {
	t.Helper()
	f := decode[map[string]any](t, h.post(t, "/api/fields",
		`{"key":"`+key+`","label":"`+key+`","type":"text"}`))
	id, _ := f["id"].(string)
	if id == "" {
		t.Fatalf("create field %s: %v", key, f)
	}
	return id
}

// newGroup creates a group over the given fields and returns its id.
func newGroup(t *testing.T, h *harness, name string, fieldIDs ...string) string {
	t.Helper()
	g := decode[map[string]any](t, h.post(t, "/api/field-groups",
		`{"name":"`+name+`","field_ids":["`+strings.Join(fieldIDs, `","`)+`"]}`))
	id, _ := g["id"].(string)
	if id == "" {
		t.Fatalf("create group %s: %v", name, g)
	}
	return id
}

// A group is a shortcut: binding it writes the rows its members would have
// written one at a time, and nothing downstream learns a group was involved.
func TestBindingAGroupIsBindingItsMembers(t *testing.T) {
	h := newHarness(t)
	firmware := newField(t, h, "firmware")
	tunnels := newField(t, h, "tunnels")
	group := newGroup(t, h, "网络参数", firmware, tunnels)

	if rec := h.post(t, "/api/categories/"+h.catID+"/bindings",
		`{"group_id":"`+group+`"}`); rec.Code != http.StatusNoContent {
		t.Fatalf("bind group: %d %s", rec.Code, rec.Body.String())
	}

	sch := decode[map[string]any](t, h.get(t, "/api/categories/"+h.catID+"/schema"))
	keys := map[string]bool{}
	for _, raw := range sch["fields"].([]any) {
		keys[raw.(map[string]any)["key"].(string)] = true
	}
	if !keys["firmware"] || !keys["tunnels"] {
		t.Errorf("both members should be in the category's field set, got %v", keys)
	}

	// Deleting the group leaves every one of them exactly where it is: the
	// expansion left no trace, so there is nothing to reverse.
	if rec := h.do(t, http.MethodDelete, "/api/field-groups/"+group, ""); rec.Code != http.StatusNoContent {
		t.Fatalf("delete group: %d %s", rec.Code, rec.Body.String())
	}
	sch = decode[map[string]any](t, h.get(t, "/api/categories/"+h.catID+"/schema"))
	after := map[string]bool{}
	for _, raw := range sch["fields"].([]any) {
		after[raw.(map[string]any)["key"].(string)] = true
	}
	if !after["firmware"] || !after["tunnels"] {
		t.Errorf("deleting the group must not unbind anything, got %v", after)
	}
}

// One refused member refuses the whole group, and not one row is written.
// A group that landed half-way would leave whoever bound it to work out which
// half (decision 106).
func TestARefusedMemberRefusesTheWholeGroup(t *testing.T) {
	h := newHarness(t)
	dell := newVendor(t, h, "Dell")
	m := decode[map[string]any](t, h.post(t, "/api/models",
		`{"name":"Latitude 5420","vendor_id":"`+dell+`","category_ids":["`+h.catID+`"]}`))
	modelID, _ := m["id"].(string)

	// firmware is already on the category, so it cannot go on a device.
	firmware := newField(t, h, "firmware")
	if rec := h.post(t, "/api/categories/"+h.catID+"/bindings",
		`{"field_id":"`+firmware+`"}`); rec.Code != http.StatusNoContent {
		t.Fatalf("bind firmware: %d %s", rec.Code, rec.Body.String())
	}
	tunnels := newField(t, h, "tunnels")
	group := newGroup(t, h, "网络参数", firmware, tunnels)

	rec := h.post(t, "/api/models/"+modelID+"/bindings", `{"group_id":"`+group+`"}`)
	if rec.Code != http.StatusConflict {
		t.Fatalf("want 409 for the whole group, got %d %s", rec.Code, rec.Body.String())
	}
	if body := rec.Body.String(); !strings.Contains(body, "firmware") {
		t.Errorf("the refusal should name the member that is stuck: %s", body)
	}

	// And tunnels, which was legal on its own, was not written either.
	fields := decode[map[string]any](t, h.get(t, "/api/fields?q=tunnels"))
	items, _ := fields["items"].([]any)
	row, _ := items[0].(map[string]any)
	if mode := row["binding_mode"]; mode != "unbound" {
		t.Errorf("nothing may be written when the group is refused, got %v", row)
	}
}

// The same field reached through two groups produces one binding, not two.
func TestOneFieldInTwoGroupsBindsOnce(t *testing.T) {
	h := newHarness(t)
	firmware := newField(t, h, "firmware")
	one := newGroup(t, h, "网络参数", firmware)
	two := newGroup(t, h, "维保参数", firmware)

	for _, g := range []string{one, two} {
		if rec := h.post(t, "/api/categories/"+h.catID+"/bindings",
			`{"group_id":"`+g+`"}`); rec.Code != http.StatusNoContent {
			t.Fatalf("bind group %s: %d %s", g, rec.Code, rec.Body.String())
		}
	}

	sch := decode[map[string]any](t, h.get(t, "/api/categories/"+h.catID+"/schema"))
	n := 0
	for _, raw := range sch["fields"].([]any) {
		if raw.(map[string]any)["key"] == "firmware" {
			n++
		}
	}
	if n != 1 {
		t.Errorf("one field is one column however many groups reached it, got %d", n)
	}

	// The field row says which groups it is in -- that is the group filter's
	// question, and it is not the same question as where it is bound.
	fields := decode[map[string]any](t, h.get(t, "/api/fields?q=firmware"))
	items, _ := fields["items"].([]any)
	row, _ := items[0].(map[string]any)
	if groups, _ := row["group_ids"].([]any); len(groups) != 2 {
		t.Errorf("group_ids should list both groups, got %v", row["group_ids"])
	}
}

// field_id or group_id, never both and never neither.
func TestBindingNeedsExactlyOneTarget(t *testing.T) {
	h := newHarness(t)
	firmware := newField(t, h, "firmware")
	group := newGroup(t, h, "网络参数", firmware)

	for _, body := range []string{
		`{}`,
		`{"field_id":"` + firmware + `","group_id":"` + group + `"}`,
	} {
		if rec := h.post(t, "/api/categories/"+h.catID+"/bindings", body); rec.Code != http.StatusBadRequest {
			t.Errorf("%s should be a 400, got %d %s", body, rec.Code, rec.Body.String())
		}
	}
}

// Editing the members does not reach what the group was already bound to.
// That is decision 105's accepted cost, and it is worth a test so nobody
// "fixes" it into a structure by accident.
func TestEditingAGroupDoesNotReachWhatItAlreadyBound(t *testing.T) {
	h := newHarness(t)
	firmware := newField(t, h, "firmware")
	group := newGroup(t, h, "网络参数", firmware)
	h.post(t, "/api/categories/"+h.catID+"/bindings", `{"group_id":"`+group+`"}`)

	tunnels := newField(t, h, "tunnels")
	if rec := h.patch(t, "/api/field-groups/"+group,
		`{"field_ids":["`+firmware+`","`+tunnels+`"]}`); rec.Code != http.StatusOK {
		t.Fatalf("patch group: %d %s", rec.Code, rec.Body.String())
	}

	sch := h.get(t, "/api/categories/"+h.catID+"/schema").Body.String()
	if strings.Contains(sch, `"key":"tunnels"`) {
		t.Errorf("a field added to a bound group does not follow it: %s", sch)
	}
}

// The group endpoints are schema.manage like everything else this round.
func TestGroupEndpointsNeedSchemaManage(t *testing.T) {
	h := newHarness(t)
	firmware := newField(t, h, "firmware")
	group := newGroup(t, h, "网络参数", firmware)
	tok := h.asRole(t, authz.UserRoleID)

	for _, call := range []struct{ method, path, body string }{
		{http.MethodPost, "/api/field-groups", `{"name":"另一个"}`},
		{http.MethodPatch, "/api/field-groups/" + group, `{"name":"改名"}`},
		{http.MethodDelete, "/api/field-groups/" + group, ""},
	} {
		if rec := h.doAs(t, tok, call.method, call.path, call.body); rec.Code != http.StatusForbidden {
			t.Errorf("%s %s = %d, want 403", call.method, call.path, rec.Code)
		}
	}
}
