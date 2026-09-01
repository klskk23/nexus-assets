package httpapi

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// cookieFrom pulls one cookie out of a response, which is where the refresh
// token lives -- script cannot read it, and neither can a test that only looks
// at the body.
func cookieFrom(rec *httptest.ResponseRecorder, name string) string {
	for _, c := range rec.Result().Cookies() {
		if c.Name == name {
			return c.Value
		}
	}
	return ""
}

// postWithCookie sends a request carrying one cookie, the way a browser would.
func (h *harness) postWithCookie(t *testing.T, path, cookie string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, path, nil)
	if cookie != "" {
		req.AddCookie(&http.Cookie{Name: refreshCookie, Value: cookie})
	}
	rec := httptest.NewRecorder()
	h.router.ServeHTTP(rec, req)
	return rec
}

// getWithKey sends a request authenticated by an API key rather than a session.
func (h *harness) getWithKey(t *testing.T, path, key string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, path, nil)
	req.Header.Set("Authorization", "Bearer "+key)
	rec := httptest.NewRecorder()
	h.router.ServeHTTP(rec, req)
	return rec
}

// Signing in hands out two things: a short access token in the body and a
// long refresh token in an HttpOnly cookie. Only the second one can be taken
// away, which is the whole reason it exists.
func TestLoginIssuesARefreshCookie(t *testing.T) {
	h := newHarness(t)

	rec := h.post(t, "/api/auth/login", `{"email":"admin@example.com","password":"correct-horse"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("login = %d %s", rec.Code, rec.Body.String())
	}
	var cookie *http.Cookie
	for _, ck := range rec.Result().Cookies() {
		if ck.Name == refreshCookie {
			cookie = ck
		}
	}
	if cookie == nil {
		t.Fatal("no refresh cookie was set")
	}
	if !cookie.HttpOnly {
		t.Error("the refresh cookie must be HttpOnly, or a script can read the one thing worth stealing")
	}
	if cookie.Path != refreshPath {
		t.Errorf("cookie path = %q, want %q", cookie.Path, refreshPath)
	}
	if decode[loginResponse](t, rec).Token == "" {
		t.Error("the body should still carry the access token")
	}
}

func TestRefreshRotatesAndKeepsWorking(t *testing.T) {
	h := newHarness(t)

	login := h.post(t, "/api/auth/login", `{"email":"admin@example.com","password":"correct-horse"}`)
	first := cookieFrom(login, refreshCookie)

	rec := h.postWithCookie(t, "/api/auth/refresh", first)
	if rec.Code != http.StatusOK {
		t.Fatalf("refresh = %d %s", rec.Code, rec.Body.String())
	}
	second := cookieFrom(rec, refreshCookie)
	if second == "" || second == first {
		t.Fatal("refreshing must hand back a different token")
	}
	if decode[loginResponse](t, rec).Token == "" {
		t.Error("refreshing should mint a new access token")
	}

	// The new one keeps working, which is the point: nobody gets signed out.
	if again := h.postWithCookie(t, "/api/auth/refresh", second); again.Code != http.StatusOK {
		t.Fatalf("second refresh = %d %s", again.Code, again.Body.String())
	}
}

// Two holders of one chain means one of them copied it, and there is no way to
// tell which. Everything descended from that sign-in goes.
func TestReplayingARotatedTokenEndsTheWholeFamily(t *testing.T) {
	h := newHarness(t)

	login := h.post(t, "/api/auth/login", `{"email":"admin@example.com","password":"correct-horse"}`)
	first := cookieFrom(login, refreshCookie)
	rotated := h.postWithCookie(t, "/api/auth/refresh", first)
	second := cookieFrom(rotated, refreshCookie)

	// The thief presents the token the browser already used.
	if replay := h.postWithCookie(t, "/api/auth/refresh", first); replay.Code != http.StatusUnauthorized {
		t.Fatalf("a replayed token = %d, want 401", replay.Code)
	}
	// And the honest holder is signed out too, because the chain is burned.
	if honest := h.postWithCookie(t, "/api/auth/refresh", second); honest.Code != http.StatusUnauthorized {
		t.Fatalf("the rest of the family should be revoked, got %d", honest.Code)
	}
}

func TestLogoutEndsTheSession(t *testing.T) {
	h := newHarness(t)

	login := h.post(t, "/api/auth/login", `{"email":"admin@example.com","password":"correct-horse"}`)
	cookie := cookieFrom(login, refreshCookie)

	if out := h.postWithCookie(t, "/api/auth/logout", cookie); out.Code != http.StatusNoContent {
		t.Fatalf("logout = %d", out.Code)
	}
	if after := h.postWithCookie(t, "/api/auth/refresh", cookie); after.Code != http.StatusUnauthorized {
		t.Errorf("a revoked session must not refresh, got %d", after.Code)
	}
}

// An API key acts as the account that made it -- this product has no roles,
// and a second permission model would be a second answer to "who may do this".
func TestAPIKeyCallsTheAPIAsItsOwner(t *testing.T) {
	h := newHarness(t)

	rec := h.post(t, "/api/api-keys", `{"name":"盘点脚本","days":30}`)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create key = %d %s", rec.Code, rec.Body.String())
	}
	created := decode[struct {
		Key struct {
			ID     string `json:"id"`
			Prefix string `json:"prefix"`
		} `json:"key"`
		Secret string `json:"secret"`
	}](t, rec)
	if created.Secret == "" || !strings.HasPrefix(created.Secret, created.Key.Prefix) {
		t.Fatalf("the secret should be shown once and carry its prefix: %+v", created)
	}

	me := h.getWithKey(t, "/api/me", created.Secret)
	if me.Code != http.StatusOK {
		t.Fatalf("a key should authenticate, got %d %s", me.Code, me.Body.String())
	}
	if decode[map[string]any](t, me)["id"] != h.userID {
		t.Error("the key should act as the account that made it")
	}

	// Listing never shows the secret again: only its hash was kept.
	list := decode[[]map[string]any](t, h.get(t, "/api/api-keys"))
	if len(list) != 1 {
		t.Fatalf("keys = %d, want 1", len(list))
	}
	if _, leaked := list[0]["secret"]; leaked {
		t.Error("the list must not carry the secret")
	}

	if rev := h.do(t, http.MethodDelete, "/api/api-keys/"+created.Key.ID, ""); rev.Code != http.StatusNoContent {
		t.Fatalf("revoke = %d %s", rev.Code, rev.Body.String())
	}
	if after := h.getWithKey(t, "/api/me", created.Secret); after.Code != http.StatusUnauthorized {
		t.Errorf("a revoked key must stop working, got %d", after.Code)
	}
}

func TestExpiredAPIKeyIsRefused(t *testing.T) {
	h := newHarness(t)

	// Zero days means no expiry, so an expired key is made by hand.
	rec := h.post(t, "/api/api-keys", `{"name":"过期的","days":1}`)
	secret := decode[struct {
		Key    struct{ ID string } `json:"key"`
		Secret string              `json:"secret"`
	}](t, rec)
	if _, err := h.db.WriteDBForTest().ExecContext(h.ctx,
		`UPDATE api_keys SET expires_at = '2020-01-01T00:00:00Z' WHERE id = ?`,
		secret.Key.ID); err != nil {
		t.Fatal(err)
	}

	if after := h.getWithKey(t, "/api/me", secret.Secret); after.Code != http.StatusUnauthorized {
		t.Errorf("an expired key must be refused, got %d", after.Code)
	}
}

// The preference belongs to the person: set on one machine, in force on the next.
func TestPreferencesLiveOnTheAccount(t *testing.T) {
	h := newHarness(t)

	rec := h.patch(t, "/api/me", `{"lang":"en","theme":"dark"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("patch me = %d %s", rec.Code, rec.Body.String())
	}
	me := decode[map[string]any](t, h.get(t, "/api/me"))
	if me["lang"] != "en" || me["theme"] != "dark" {
		t.Errorf("preferences did not stick: %+v", me)
	}

	// Empty is a choice of its own: follow the system again.
	if back := h.patch(t, "/api/me", `{"theme":""}`); back.Code != http.StatusOK {
		t.Fatalf("clearing = %d %s", back.Code, back.Body.String())
	}
	me = decode[map[string]any](t, h.get(t, "/api/me"))
	if me["theme"] != "" || me["lang"] != "en" {
		t.Errorf("clearing one preference must not disturb the other: %+v", me)
	}

	if bad := h.patch(t, "/api/me", `{"lang":"klingon"}`); bad.Code != http.StatusUnprocessableEntity {
		t.Errorf("an unknown language = %d, want 422", bad.Code)
	}
}

// The documentation page is embedded, because this runs on a network that may
// not reach a CDN.
func TestDocsAreServedFromTheBinary(t *testing.T) {
	h := newHarness(t)

	for _, path := range []string{"/api/docs", "/api/docs/swagger-ui.css", "/api/openapi.yaml"} {
		rec := h.get(t, path)
		if rec.Code != http.StatusOK {
			t.Errorf("%s = %d", path, rec.Code)
		}
		if rec.Body.Len() == 0 {
			t.Errorf("%s came back empty", path)
		}
	}
	// A path that climbs out of the embedded directory finds nothing.
	if rec := h.get(t, "/api/docs/../../go.mod"); rec.Code == http.StatusOK {
		t.Error("directory traversal should not be served")
	}
}
