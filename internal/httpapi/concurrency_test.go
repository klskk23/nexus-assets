package httpapi

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

// US5 acceptance scenario 4: two people open the same device and both save.
//
// The second writer must be told rather than silently overwriting the first.
// A last-write-wins here would produce a transfer timeline with a jump nobody
// can explain.
func TestConcurrentEditIsDetectedNotSilentlyOverwritten(t *testing.T) {
	h := newHarness(t)
	h.seed(t, 0, 1)

	first := decode[assetListResponse](t, h.get(t, "/api/assets")).Items[0]
	// Both people read the same version.
	version := first.Version

	write := func(firmware string, v int) *httptest.ResponseRecorder {
		return h.patch(t, "/api/assets/"+first.ID, `{
			"category_id":"`+first.CategoryID+`",
			"owner_id":"`+h.userID+`",
			"holder_type":"entity",
			"holder_id":"`+h.locID+`",
			"attrs":{"mac":"`+first.Attrs["mac"].(string)+`"},
			"version":`+itoa(v)+`
		}`)
	}

	if rec := write("2.1.3", version); rec.Code != http.StatusOK {
		t.Fatalf("the first writer should succeed, got %d: %s", rec.Code, rec.Body.String())
	}

	rec := write("9.9.9", version)
	if rec.Code != http.StatusConflict {
		t.Fatalf("the second writer should get 409, got %d: %s", rec.Code, rec.Body.String())
	}
	env := decode[Envelope](t, rec)
	if env.Error.Code != CodeVersionConflict {
		t.Errorf("code = %q, want %q", env.Error.Code, CodeVersionConflict)
	}
	if env.Error.Message == "" {
		t.Error("the message must tell the person to reload")
	}

	// Re-reading gives the new version, and the write then goes through.
	after := decode[assetListResponse](t, h.get(t, "/api/assets")).Items[0]
	if after.Version != version+1 {
		t.Fatalf("version = %d, want %d", after.Version, version+1)
	}
	if rec := write("9.9.9", after.Version); rec.Code != http.StatusOK {
		t.Errorf("retrying with the fresh version should succeed, got %d: %s", rec.Code, rec.Body.String())
	}
}

// A missing version is refused outright: without one there is nothing to
// detect a conflict against.
func TestPatchWithoutAVersionIsRefused(t *testing.T) {
	h := newHarness(t)
	h.seed(t, 0, 1)
	first := decode[assetListResponse](t, h.get(t, "/api/assets")).Items[0]

	rec := h.patch(t, "/api/assets/"+first.ID, `{
		"category_id":"`+first.CategoryID+`",
		"owner_id":"`+h.userID+`",
		"holder_type":"entity",
		"holder_id":"`+h.locID+`",
		"attrs":{}
	}`)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("want 400, got %d: %s", rec.Code, rec.Body.String())
	}
	if decode[Envelope](t, rec).Error.Fields["version"] == "" {
		t.Error("the error should point at the missing version")
	}
}

func itoa(v int) string {
	if v == 0 {
		return "0"
	}
	var b []byte
	for v > 0 {
		b = append([]byte{byte('0' + v%10)}, b...)
		v /= 10
	}
	return string(b)
}
