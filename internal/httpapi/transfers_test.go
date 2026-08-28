package httpapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/transfer"
)

func (h *harness) post(t *testing.T, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	return h.do(t, http.MethodPost, path, body)
}

func decode[T any](t *testing.T, rec *httptest.ResponseRecorder) T {
	t.Helper()
	var out T
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("decode %s: %v", rec.Body.String(), err)
	}
	return out
}

func TestTransferEndpointChecksOutAndReturns(t *testing.T) {
	h := newHarness(t)
	h.seed(t, 0, 1)
	id := h.firstAssetID(t)

	rec := h.post(t, "/api/transfers", `{
		"asset_ids": ["`+id+`"],
		"to_status": "in_use",
		"to_holder_type": "user",
		"to_holder_id": "`+h.userID+`",
		"note": "借出测试"
	}`)
	if rec.Code != http.StatusCreated {
		t.Fatalf("checkout returned %d: %s", rec.Code, rec.Body.String())
	}
	res := decode[transfer.Result](t, rec)
	if len(res.Transfers) != 1 || res.Transfers[0].Kind != model.KindCheckout {
		t.Fatalf("expected one checkout, got %+v", res.Transfers)
	}
	if res.Transfers[0].ToHolder.Name == "" {
		t.Error("the response should carry display names so the timeline needs no extra lookup")
	}

	// Returning without naming a destination needs the default stock point.
	rec = h.post(t, "/api/transfers", `{"asset_ids":["`+id+`"],"to_status":"in_stock","check_in":true}`)
	if rec.Code != http.StatusCreated {
		t.Fatalf("check-in returned %d: %s", rec.Code, rec.Body.String())
	}
	if decode[transfer.Result](t, rec).Transfers[0].Kind != model.KindCheckin {
		t.Error("expected a checkin event")
	}
}

func TestTransferEndpointRefusesAnIllegalTransition(t *testing.T) {
	h := newHarness(t)
	h.seed(t, 0, 1)
	id := h.firstAssetID(t)

	if rec := h.post(t, "/api/transfers",
		`{"asset_ids":["`+id+`"],"to_status":"retired"}`); rec.Code != http.StatusCreated {
		t.Fatalf("retire: %d %s", rec.Code, rec.Body.String())
	}
	rec := h.post(t, "/api/transfers", `{"asset_ids":["`+id+`"],"to_status":"in_stock","check_in":true}`)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("moving out of retired should be refused, got %d: %s", rec.Code, rec.Body.String())
	}
	env := decode[Envelope](t, rec)
	if env.Error.Code != CodeIllegalTransition {
		t.Errorf("code = %q, want %q", env.Error.Code, CodeIllegalTransition)
	}
}

func TestTransferEndpointRejectsEditingANonTailEvent(t *testing.T) {
	h := newHarness(t)
	h.seed(t, 0, 1)
	id := h.firstAssetID(t)

	first := decode[transfer.Result](t, h.post(t, "/api/transfers",
		`{"asset_ids":["`+id+`"],"to_status":"in_use","to_holder_type":"user","to_holder_id":"`+h.userID+`"}`))
	if rec := h.post(t, "/api/transfers",
		`{"asset_ids":["`+id+`"],"to_status":"in_stock","check_in":true}`); rec.Code != http.StatusCreated {
		t.Fatalf("checkin: %s", rec.Body.String())
	}

	rec := h.patch(t, "/api/transfers/"+first.Transfers[0].ID, `{"note":"迟到的修改"}`)
	if rec.Code != http.StatusConflict {
		t.Fatalf("want 409, got %d: %s", rec.Code, rec.Body.String())
	}
	if decode[Envelope](t, rec).Error.Code != CodeNotTailEvent {
		t.Errorf("code = %q, want %q", decode[Envelope](t, rec).Error.Code, CodeNotTailEvent)
	}
}

func TestAssetTimelineEndpoint(t *testing.T) {
	h := newHarness(t)
	h.seed(t, 0, 1)
	id := h.firstAssetID(t)
	if rec := h.post(t, "/api/transfers",
		`{"asset_ids":["`+id+`"],"to_status":"in_use","to_holder_type":"user","to_holder_id":"`+h.userID+`"}`); rec.Code != http.StatusCreated {
		t.Fatal(rec.Body.String())
	}

	rec := h.get(t, "/api/assets/"+id+"/transfers")
	if rec.Code != http.StatusOK {
		t.Fatalf("timeline returned %d", rec.Code)
	}
	items := decode[[]model.Transfer](t, rec)
	if len(items) != 2 || items[0].Kind != model.KindCreate {
		t.Fatalf("timeline should start at creation, got %+v", items)
	}
	if items[1].Actor == nil {
		t.Error("each event should name who did it")
	}
}

// Disabling an account that is still responsible for devices must be refused:
// every asset needs an owner at all times.
func TestDisablingAUserWhoStillOwnsAssetsIsRefused(t *testing.T) {
	h := newHarness(t)
	h.seed(t, 0, 3)

	rec := h.patch(t, "/api/users/"+h.userID, `{"disable":true}`)
	if rec.Code != http.StatusConflict {
		t.Fatalf("want 409, got %d: %s", rec.Code, rec.Body.String())
	}
	env := decode[Envelope](t, rec)
	if env.Error.Code != CodeReferenceBlocked {
		t.Errorf("code = %q, want %q", env.Error.Code, CodeReferenceBlocked)
	}
	if !contains(env.Error.Message, "3") {
		t.Errorf("the message should say how many assets are in the way, got %q", env.Error.Message)
	}
}

func contains(h, n string) bool {
	for i := 0; i+len(n) <= len(h); i++ {
		if h[i:i+len(n)] == n {
			return true
		}
	}
	return false
}
