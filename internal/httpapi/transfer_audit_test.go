package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/klskk23/nexus-assets/internal/authz"
)

// roleHolding makes a role with exactly these permissions and returns a token
// for somebody wearing it. The point of the audit split is that the two halves
// are independent, and independence is only demonstrable by holding one
// without the other.
func (h *harness) roleHolding(t *testing.T, name string, perms ...authz.Permission) string {
	t.Helper()
	r, err := h.roles.Create(context.Background(), authz.CreateInput{
		Name: name, Permissions: perms,
	})
	if err != nil {
		t.Fatalf("create role %s: %v", name, err)
	}
	return h.asRole(t, r.ID)
}

// The two audits are separate reads with separate permissions, and each refuses
// the other's holder. Server-side: the interface hides a tab it cannot show,
// but hiding is not a control -- somebody can always type the address.
func TestAuditPermissionsAreIndependent(t *testing.T) {
	h := newHarness(t)
	h.seed(t, 0, 2)

	ops := h.roleHolding(t, "只看操作审计", authz.AuditRead)
	mov := h.roleHolding(t, "只看流转审计", authz.TransferAudit)

	if rec := h.doAs(t, ops, http.MethodGet, "/api/audit", ""); rec.Code != http.StatusOK {
		t.Errorf("operations audit refused its own permission: %d", rec.Code)
	}
	if rec := h.doAs(t, ops, http.MethodGet, "/api/transfers", ""); rec.Code != http.StatusForbidden {
		t.Errorf("operations permission opened the movement log: %d", rec.Code)
	}

	if rec := h.doAs(t, mov, http.MethodGet, "/api/transfers", ""); rec.Code != http.StatusOK {
		t.Errorf("movement log refused its own permission: %d", rec.Code)
	}
	if rec := h.doAs(t, mov, http.MethodGet, "/api/audit", ""); rec.Code != http.StatusForbidden {
		t.Errorf("movement permission opened the operations log: %d", rec.Code)
	}
}

// Every transfer that leaves the server carries the asset's readable number.
//
// It is resolved rather than stored, so it is easy for one endpoint to grow the
// field and the others to keep answering with a uuid. This walks the endpoints
// that return transfers instead of trusting that they all go through the same
// decorator -- they do today, and that is exactly the kind of thing a later
// change breaks quietly.
func TestEveryTransferCarriesItsAssetNumber(t *testing.T) {
	h := newHarness(t)
	h.seed(t, 0, 2)
	id := h.firstAssetID(t)
	tok := h.asRole(t, authz.AdminRoleID)

	number := func(body []byte, where string) {
		t.Helper()
		var items []struct {
			AssetDisplayName string `json:"asset_display_name"`
		}
		if err := json.Unmarshal(body, &items); err != nil {
			// The envelope shapes wrap theirs.
			var env struct {
				Items []struct {
					AssetDisplayName string `json:"asset_display_name"`
				} `json:"items"`
				Transfers []struct {
					AssetDisplayName string `json:"asset_display_name"`
				} `json:"transfers"`
			}
			if err := json.Unmarshal(body, &env); err != nil {
				t.Fatalf("%s: parse %v", where, err)
			}
			items = append(env.Items, env.Transfers...)
		}
		if len(items) == 0 {
			t.Fatalf("%s returned no transfers to check", where)
		}
		for i, it := range items {
			if it.AssetDisplayName == "" {
				t.Errorf("%s item %d has no readable asset number", where, i)
			}
		}
	}

	rec := h.doAs(t, tok, http.MethodGet, "/api/assets/"+id+"/transfers", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("asset timeline: %d", rec.Code)
	}
	number(rec.Body.Bytes(), "GET /assets/:id/transfers")

	rec = h.doAs(t, tok, http.MethodGet, "/api/transfers", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("movement log: %d", rec.Code)
	}
	number(rec.Body.Bytes(), "GET /transfers")

	rec = h.doAs(t, tok, http.MethodGet, "/api/overview", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("overview: %d", rec.Code)
	}
	var ov struct {
		RecentTransfers []struct {
			AssetDisplayName string `json:"asset_display_name"`
		} `json:"recent_transfers"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &ov); err != nil {
		t.Fatalf("overview parse: %v", err)
	}
	if len(ov.RecentTransfers) == 0 {
		t.Fatal("overview returned no recent transfers to check")
	}
	for i, it := range ov.RecentTransfers {
		if it.AssetDisplayName == "" {
			t.Errorf("overview recent transfer %d has no readable asset number", i)
		}
	}
}

// A vendor is a grouping of models, so managing models is what it takes to
// manage one. Binding a field to a vendor is not: every model under it inherits
// that field, which is a change to the shape of the data.
func TestVendorCrudFollowsModelManageButBindingsDoNot(t *testing.T) {
	h := newHarness(t)
	h.seed(t, 0, 1)

	models := h.roleHolding(t, "管型号", authz.ModelManage)
	schema := h.roleHolding(t, "管结构", authz.SchemaManage)

	rec := h.doAs(t, models, http.MethodPost, "/api/vendors", `{"name":"Acme"}`)
	if rec.Code != http.StatusCreated {
		t.Fatalf("model.manage should create a vendor: %d %s", rec.Code, rec.Body.String())
	}
	var created struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &created); err != nil {
		t.Fatalf("parse vendor: %v", err)
	}

	if rec := h.doAs(t, schema, http.MethodPost, "/api/vendors", `{"name":"Other"}`); rec.Code != http.StatusForbidden {
		t.Errorf("schema.manage should no longer create vendors: %d", rec.Code)
	}

	// The half that stays: binding reaches every model under the vendor.
	body := `{"field_id":"nope"}`
	if rec := h.doAs(t, models, http.MethodPost, "/api/vendors/"+created.ID+"/bindings", body); rec.Code != http.StatusForbidden {
		t.Errorf("model.manage should not bind fields to a vendor: %d", rec.Code)
	}
	if rec := h.doAs(t, schema, http.MethodPost, "/api/vendors/"+created.ID+"/bindings", body); rec.Code == http.StatusForbidden {
		t.Error("schema.manage should still be the permission that binds")
	}
}
