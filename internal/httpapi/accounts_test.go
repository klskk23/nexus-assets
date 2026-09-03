package httpapi

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/klskk23/nexus-assets/internal/auth"
)

// makeClerk adds an ordinary local account and returns its id.
func makeClerk(t *testing.T, h *harness, email string) string {
	t.Helper()
	rec := h.do(t, http.MethodPost, "/api/users",
		`{"email":"`+email+`","name":"仓管","password":"correct-horse","role_id":"role-user"}`)
	if rec.Code != http.StatusCreated {
		t.Fatal(rec.Body.String())
	}
	var out struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatal(err)
	}
	return out.ID
}

// Disabling was one-way: PATCH read {"disable": false} and ignored it, so an
// account stopped by a misclick could only be revived in the database.
func TestDisablingAnAccountIsUndoable(t *testing.T) {
	h := newHarness(t)
	id := makeClerk(t, h, "clerk@example.com")

	if rec := h.do(t, http.MethodPatch, "/api/users/"+id, `{"disable":true}`); rec.Code != http.StatusOK {
		t.Fatal(rec.Body.String())
	}
	if got := h.get(t, "/api/users?status=disabled&limit=50").Body.String(); !strings.Contains(got, "clerk@example.com") {
		t.Fatalf("the account should be disabled: %s", got)
	}

	rec := h.do(t, http.MethodPatch, "/api/users/"+id, `{"disable":false}`)
	if rec.Code != http.StatusOK {
		t.Fatal(rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), `"status":"active"`) {
		t.Errorf("enabling should put the account back into service: %s", rec.Body.String())
	}
}

// The name is editable, the email is not: the email is what an OIDC sign-in
// matches on and what the trail says.
func TestRenamingAnAccount(t *testing.T) {
	h := newHarness(t)
	id := makeClerk(t, h, "clerk@example.com")

	rec := h.do(t, http.MethodPatch, "/api/users/"+id, `{"name":"新名字"}`)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), "新名字") {
		t.Fatalf("rename: %d %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "clerk@example.com") {
		t.Errorf("the email should be untouched: %s", rec.Body.String())
	}

	// An empty name would leave a row that reads as nobody.
	if rec := h.do(t, http.MethodPatch, "/api/users/"+id, `{"name":"  "}`); rec.Code != http.StatusUnprocessableEntity {
		t.Errorf("an empty name should be refused, got %d %s", rec.Code, rec.Body.String())
	}
}

// A reset that only changes a hash is not a reset: the token in somebody's
// hands keeps working. Decision 94 wires token_version through, so it stops
// working on the next request rather than in fifteen minutes.
func TestResettingAPasswordEndsTheSessionsItHad(t *testing.T) {
	h := newHarness(t)
	id := makeClerk(t, h, "clerk@example.com")

	// A token as that account, minted at the version it has now.
	issuer := auth.NewIssuer([]byte("test"), time.Hour)
	before, err := issuer.Issue(id, "clerk@example.com", "仓管", 0)
	if err != nil {
		t.Fatal(err)
	}
	if rec := h.getWithKey(t, "/api/categories", before); rec.Code != http.StatusOK {
		t.Fatalf("the token should work before the reset: %d %s", rec.Code, rec.Body.String())
	}

	rec := h.do(t, http.MethodPost, "/api/users/"+id+"/password", `{"password":"another-horse"}`)
	if rec.Code != http.StatusOK {
		t.Fatal(rec.Body.String())
	}

	if rec := h.getWithKey(t, "/api/categories", before); rec.Code != http.StatusUnauthorized {
		t.Errorf("the token from before the reset must stop working, got %d", rec.Code)
	}
	// And the new password is the one that signs in.
	in := h.post(t, "/api/auth/login", `{"email":"clerk@example.com","password":"another-horse"}`)
	if in.Code != http.StatusOK {
		t.Errorf("the new password should sign in: %d %s", in.Code, in.Body.String())
	}
}

// An OIDC account has no password to reset; setting one would open a second
// way in that the provider cannot close.
func TestResettingAPasswordOnlyAppliesToLocalAccounts(t *testing.T) {
	h := newHarness(t)
	u, err := h.users.Create(h.ctx, auth.CreateInput{
		Email: "sso@example.com", Name: "外部同事", AuthType: "oidc",
		OIDCSubject: "sub-1", RoleID: "role-user",
	})
	if err != nil {
		t.Fatal(err)
	}

	rec := h.do(t, http.MethodPost, "/api/users/"+u.ID+"/password", `{"password":"another-horse"}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("an SSO account has no password: %d %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "单点登录") {
		t.Errorf("the refusal should say why: %s", rec.Body.String())
	}
}

// A short password is refused before anything is written.
func TestResettingAPasswordRefusesAShortOne(t *testing.T) {
	h := newHarness(t)
	id := makeClerk(t, h, "clerk@example.com")

	rec := h.do(t, http.MethodPost, "/api/users/"+id+"/password", `{"password":"short"}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected a refusal, got %d %s", rec.Code, rec.Body.String())
	}
	// The old password still works, which is what "refused before anything is
	// written" means in practice.
	in := h.post(t, "/api/auth/login", `{"email":"clerk@example.com","password":"correct-horse"}`)
	if in.Code != http.StatusOK {
		t.Errorf("the old password should still sign in: %d %s", in.Code, in.Body.String())
	}
}
