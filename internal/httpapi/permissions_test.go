package httpapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"slices"
	"strings"
	"testing"

	"github.com/klskk23/nexus-assets/internal/auth"
	"github.com/klskk23/nexus-assets/internal/authz"
	"github.com/klskk23/nexus-assets/internal/model"
)

// TestOrdinaryUserCanWorkButNotConfigure walks the preset role through what it
// is for. The list is the point: every ✓ is a thing somebody does daily, every
// ✗ is a thing that changes the system's own definitions.
func TestOrdinaryUserCanWorkButNotConfigure(t *testing.T) {
	h := newHarness(t)
	h.seed(t, 0, 1)
	id := h.firstAssetID(t)
	tok := h.asRole(t, authz.UserRoleID)

	// Reads are open to anyone signed in: the ledger's value is that everybody
	// can look things up (decision 78).
	for _, path := range []string{
		"/api/assets", "/api/assets/" + id, "/api/categories", "/api/fields",
		"/api/models", "/api/statuses", "/api/holders", "/api/users", "/api/roles",
		"/api/overview",
	} {
		if rec := h.doAs(t, tok, http.MethodGet, path, ""); rec.Code != http.StatusOK {
			t.Errorf("GET %s should be open to everyone, got %d", path, rec.Code)
		}
	}

	// The audit log is the one read that is not: it is about people.
	if rec := h.doAs(t, tok, http.MethodGet, "/api/audit", ""); rec.Code != http.StatusForbidden {
		t.Errorf("the audit log needs a permission, got %d", rec.Code)
	}

	// Recording a device, and adding the customer it is going to.
	body := `{"category_id":"` + h.catID + `","owner_id":"` + h.userID +
		`","holder_type":"entity","holder_id":"` + h.locID +
		`","attrs":{"mac":"001A2B3C9401"}}`
	if rec := h.doAs(t, tok, http.MethodPost, "/api/assets", body); rec.Code != http.StatusCreated {
		t.Errorf("an ordinary user records devices: %d %s", rec.Code, rec.Body.String())
	}
	if rec := h.doAs(t, tok, http.MethodPost, "/api/holders",
		`{"type":"company","name":"新客户"}`); rec.Code != http.StatusCreated {
		t.Errorf("an ordinary user adds customers: %d %s", rec.Code, rec.Body.String())
	}

	// And what the role is there to stop.
	refused := []struct {
		what, method, path, body string
	}{
		{"delete a device", http.MethodDelete, "/api/assets/" + id + "?confirm=x", ""},
		{"edit history", http.MethodPatch, "/api/transfers/none", `{"note":"改"}`},
		{"add a field", http.MethodPost, "/api/fields", `{"key":"k","label":"L","type":"text"}`},
		{"add a model", http.MethodPost, "/api/models", `{"name":"M"}`},
		{"add a status", http.MethodPost, "/api/statuses", `{"key":"s","label":"S","color":"blue"}`},
		{"rename a holder", http.MethodPatch, "/api/holders/" + h.locID, `{"name":"改名"}`},
		{"delete a holder", http.MethodDelete, "/api/holders/" + h.locID, ""},
		{"move the stock point", http.MethodPatch, "/api/holders/" + h.locID, `{"is_default_stock":true}`},
		{"add an account", http.MethodPost, "/api/users", `{"email":"x@example.com","password":"p","role_id":"role-user"}`},
		{"make a role", http.MethodPost, "/api/roles", `{"name":"R"}`},
	}
	for _, r := range refused {
		rec := h.doAs(t, tok, r.method, r.path, r.body)
		if rec.Code != http.StatusForbidden {
			t.Errorf("%s should be refused, got %d: %s", r.what, rec.Code, rec.Body.String())
		}
		// The refusal names the switch as the interface names it, so the reader
		// knows what to ask for rather than reading "schema.manage".
		if strings.Contains(rec.Body.String(), "perm.") {
			t.Errorf("%s: the refusal shows a raw key: %s", r.what, rec.Body.String())
		}
	}
}

// TestPermissionsTravelWithMe covers what the interface reads to decide which
// buttons work.
func TestPermissionsTravelWithMe(t *testing.T) {
	h := newHarness(t)

	var admin struct {
		Permissions []string `json:"permissions"`
		IsAdmin     bool     `json:"is_admin"`
	}
	if err := json.Unmarshal(h.get(t, "/api/me").Body.Bytes(), &admin); err != nil {
		t.Fatal(err)
	}
	if !admin.IsAdmin || len(admin.Permissions) != len(authz.All) {
		t.Errorf("an administrator holds everything, got %d of %d (admin=%v)",
			len(admin.Permissions), len(authz.All), admin.IsAdmin)
	}

	var ordinary struct {
		Permissions []string `json:"permissions"`
		IsAdmin     bool     `json:"is_admin"`
	}
	rec := h.doAs(t, h.asRole(t, authz.UserRoleID), http.MethodGet, "/api/me", "")
	if err := json.Unmarshal(rec.Body.Bytes(), &ordinary); err != nil {
		t.Fatal(err)
	}
	if ordinary.IsAdmin {
		t.Error("the preset role is not an administrator")
	}
	for _, want := range []string{"asset.create", "transfer.create", "print", "export"} {
		if !slices.Contains(ordinary.Permissions, want) {
			t.Errorf("the preset role should carry %s, got %v", want, ordinary.Permissions)
		}
	}
	for _, unwanted := range []string{"asset.delete", "schema.manage", "role.manage"} {
		if slices.Contains(ordinary.Permissions, unwanted) {
			t.Errorf("the preset role must not carry %s", unwanted)
		}
	}
}

// TestNobodyCanBeLeftInCharge covers the guards that make this safe to switch
// on: there is no sequence of allowed clicks that ends with nobody able to
// change permissions.
//
// Each case gets its own harness, because these guards are about how many
// administrators exist and a case that quietly left a second one behind would
// let the next case pass without ever reaching its guard.
func TestNobodyCanBeLeftInCharge(t *testing.T) {
	t.Run("the last administrator cannot be disabled", func(t *testing.T) {
		h := newHarness(t)
		rec := h.patch(t, "/api/users/"+h.userID, `{"disable":true}`)
		if rec.Code != http.StatusConflict {
			t.Fatalf("expected a refusal, got %d: %s", rec.Code, rec.Body.String())
		}
		// The message, not just the status: "still owns devices" is also a 409,
		// and a test that accepted either would pass without reaching this
		// guard at all.
		if !strings.Contains(rec.Body.String(), "至少") {
			t.Errorf("refused for the wrong reason: %s", rec.Body.String())
		}
	})

	t.Run("the last administrator cannot be demoted", func(t *testing.T) {
		h := newHarness(t)

		// Somebody who can assign roles without being an administrator --
		// otherwise the only account able to demote the last administrator is
		// that administrator, and the self-demote guard answers first.
		rec := h.post(t, "/api/roles", `{"name":"人事","permissions":["role.manage"]}`)
		if rec.Code != http.StatusCreated {
			t.Fatalf("create role: %s", rec.Body.String())
		}
		var role struct {
			ID string `json:"id"`
		}
		if err := json.Unmarshal(rec.Body.Bytes(), &role); err != nil {
			t.Fatal(err)
		}
		hr := h.asRole(t, role.ID)

		rec = h.doAs(t, hr, http.MethodPatch, "/api/users/"+h.userID+"/role",
			`{"role_id":"`+authz.UserRoleID+`"}`)
		if rec.Code != http.StatusConflict {
			t.Fatalf("expected a refusal, got %d: %s", rec.Code, rec.Body.String())
		}
		if !strings.Contains(rec.Body.String(), "至少") {
			t.Errorf("refused for the wrong reason: %s", rec.Body.String())
		}
	})

	t.Run("nobody changes their own role", func(t *testing.T) {
		h := newHarness(t)
		// A second administrator, so this is refused for being one's own
		// change rather than for being the last one.
		h.asRole(t, authz.AdminRoleID)

		rec := h.patch(t, "/api/users/"+h.userID+"/role", `{"role_id":"`+authz.UserRoleID+`"}`)
		if rec.Code != http.StatusConflict {
			t.Fatalf("expected a refusal, got %d: %s", rec.Code, rec.Body.String())
		}
		if !strings.Contains(rec.Body.String(), "自己") {
			t.Errorf("refused for the wrong reason: %s", rec.Body.String())
		}
	})

	t.Run("the administrator role has no switches to clear", func(t *testing.T) {
		h := newHarness(t)
		if rec := h.patch(t, "/api/roles/"+authz.AdminRoleID, `{"permissions":[]}`); rec.Code != http.StatusUnprocessableEntity {
			t.Errorf("its permissions are not editable, got %d: %s", rec.Code, rec.Body.String())
		}
		// Its name is.
		if rec := h.patch(t, "/api/roles/"+authz.AdminRoleID, `{"name":"系统管理员"}`); rec.Code != http.StatusOK {
			t.Errorf("renaming it should work, got %d: %s", rec.Code, rec.Body.String())
		}
	})

	t.Run("a role with accounts on it will not delete", func(t *testing.T) {
		h := newHarness(t)
		rec := h.do(t, http.MethodDelete, "/api/roles/"+authz.AdminRoleID, "")
		if rec.Code != http.StatusConflict {
			t.Fatalf("expected a refusal, got %d: %s", rec.Code, rec.Body.String())
		}
		// An empty one deletes cleanly, which is what makes the guard a guard
		// rather than a blanket refusal.
		if rec := h.do(t, http.MethodDelete, "/api/roles/"+authz.UserRoleID, ""); rec.Code != http.StatusNoContent {
			t.Errorf("a role nobody is on should delete, got %d: %s", rec.Code, rec.Body.String())
		}
	})
}

// TestOIDCFirstSignInIsAnAdministrator covers how the very first person gets
// in: whoever sets the deployment up signs in with Google and needs to be able
// to configure it. Everyone after them is an ordinary user.
func TestOIDCFirstSignInIsAnAdministrator(t *testing.T) {
	h := newHarness(t)

	first, err := auth.UpsertUser(h.ctx, h.users, auth.IDTokenClaims{
		Email: "founder@example.com", Name: "创始人", Subject: "sub-1",
	})
	if err != nil {
		t.Fatalf("upsert: %v", err)
	}
	if first.RoleID != authz.AdminRoleID {
		t.Errorf("the first OIDC sign-in should be an administrator, got %q", first.RoleID)
	}

	second, err := auth.UpsertUser(h.ctx, h.users, auth.IDTokenClaims{
		Email: "colleague@example.com", Name: "同事", Subject: "sub-2",
	})
	if err != nil {
		t.Fatalf("upsert: %v", err)
	}
	if second.RoleID != authz.UserRoleID {
		t.Errorf("everybody after the first is an ordinary user, got %q", second.RoleID)
	}

	// Signing in again is not a new account and does not re-promote anybody.
	again, err := auth.UpsertUser(h.ctx, h.users, auth.IDTokenClaims{
		Email: "colleague@example.com", Name: "同事", Subject: "sub-2",
	})
	if err != nil {
		t.Fatal(err)
	}
	if again.RoleID != authz.UserRoleID {
		t.Errorf("a second sign-in must not change the role, got %q", again.RoleID)
	}
}

// TestConfigKeyIsAlwaysAnAdministrator pins decision 84: the key in the
// configuration file is for the thing that has to keep working -- a backup
// script, a monitoring probe -- and cannot be revoked from the interface, so
// one click in there must not be able to break it.
func TestConfigKeyIsAlwaysAnAdministrator(t *testing.T) {
	h := newHarnessWithConfigKey(t, "config-file-key-not-for-any-deployment", "admin@example.com")

	// The account it names is an ordinary user; the key is not.
	if _, err := h.users.SetRole(h.ctx, h.userID, authz.UserRoleID, "someone-else"); err != nil {
		// Refused while it is the only administrator, which is the point of
		// the other test. Make a second one first.
		if _, err := h.users.Create(h.ctx, auth.CreateInput{
			Email: "second@example.com", Name: "第二管理员",
			AuthType: model.AuthLocal, Password: "correct-horse", RoleID: authz.AdminRoleID,
		}); err != nil {
			t.Fatal(err)
		}
		if _, err := h.users.SetRole(h.ctx, h.userID, authz.UserRoleID, "someone-else"); err != nil {
			t.Fatalf("demote: %v", err)
		}
	}

	req := httptest.NewRequest(http.MethodPost, "/api/roles", strings.NewReader(`{"name":"临时角色"}`))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer config-file-key-not-for-any-deployment")
	rec := httptest.NewRecorder()
	h.router.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("the configuration key stays an administrator, got %d: %s", rec.Code, rec.Body.String())
	}

	// While the account itself, over a session, is now refused the same thing.
	if rec := h.do(t, http.MethodPost, "/api/roles", `{"name":"另一个"}`); rec.Code != http.StatusForbidden {
		t.Errorf("the demoted account should be refused, got %d", rec.Code)
	}
}

// TestOIDCAdoptsAnExistingAccount covers what happens when a local account and
// a Google identity share an address -- which is the normal case, not an edge
// one: the deployment is bootstrapped with somebody's email and then that
// person signs in with Google.
func TestOIDCAdoptsAnExistingAccount(t *testing.T) {
	h := newHarness(t)

	local, err := h.users.Create(h.ctx, auth.CreateInput{
		Email: "zhang@example.com", Name: "张三", AuthType: model.AuthLocal,
		Password: "correct-horse", RoleID: authz.UserRoleID,
	})
	if err != nil {
		t.Fatal(err)
	}

	got, err := auth.UpsertUser(h.ctx, h.users, auth.IDTokenClaims{
		Email: "zhang@example.com", Name: "Zhang San", Subject: "google-sub-1",
	})
	if err != nil {
		t.Fatal(err)
	}
	if got.ID != local.ID {
		t.Fatal("one person is one account: the address is unique, so it is adopted, not duplicated")
	}
	// Signing in with Google does not promote anybody.
	if got.RoleID != authz.UserRoleID {
		t.Errorf("the adopted account keeps its role, got %q", got.RoleID)
	}
	// And the password still works: whoever set this up did not ask to give it
	// up, and losing it would mean losing the way in the day Google is down.
	if got.AuthType != model.AuthLocal {
		t.Errorf("the account keeps its own sign-in method, got %q", got.AuthType)
	}
	// What it gains is the link, so the account belongs to the identity rather
	// than to a string a Workspace can hand to somebody else.
	if got.OIDCSubject != "google-sub-1" {
		t.Errorf("the Google subject should be recorded, got %q", got.OIDCSubject)
	}

	// The hole this closes: the adopted account is still auth_type "local", so
	// counting the type left it uncounted -- and the next colleague to sign in
	// was still "the first through OIDC" and became an administrator.
	next, err := auth.UpsertUser(h.ctx, h.users, auth.IDTokenClaims{
		Email: "li@example.com", Name: "李四", Subject: "google-sub-2",
	})
	if err != nil {
		t.Fatal(err)
	}
	if next.RoleID != authz.UserRoleID {
		t.Errorf("somebody signing in after the first is an ordinary user, got %q", next.RoleID)
	}
}
