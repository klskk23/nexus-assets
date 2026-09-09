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

// A reassignment's entire content is the two owners.
//
// The ids were all the response carried, and the movement log has no user list
// of its own on two of the three screens that render one -- so the event that
// changes who is responsible arrived as a pair of uuids and rendered as an
// unchanged holder pointing at itself. Asserted on the read path, not on the
// write: the write returns what it just built, and the names are put on by the
// same batched lookup every read goes through.
func TestReassignmentCarriesBothOwnersByName(t *testing.T) {
	h := newHarness(t)
	h.seed(t, 0, 1)
	id := h.firstAssetID(t)
	clerk := makeClerk(t, h, "clerk@example.com")

	// Somebody is responsible first, then somebody else is.
	if rec := h.post(t, "/api/transfers",
		`{"asset_ids":["`+id+`"],"to_owner_id":"`+h.userID+`"}`); rec.Code != http.StatusCreated {
		t.Fatalf("first reassign returned %d: %s", rec.Code, rec.Body.String())
	}
	rec := h.post(t, "/api/transfers", `{"asset_ids":["`+id+`"],"to_owner_id":"`+clerk+`"}`)
	if rec.Code != http.StatusCreated {
		t.Fatalf("second reassign returned %d: %s", rec.Code, rec.Body.String())
	}
	if k := decode[transfer.Result](t, rec).Transfers[0].Kind; k != model.KindReassign {
		t.Fatalf("expected a reassignment, got %q", k)
	}

	events := decode[[]model.Transfer](t, h.get(t, "/api/assets/"+id+"/transfers"))
	if len(events) == 0 {
		t.Fatal("the asset should have a history")
	}
	// A device's own history reads oldest first -- it is a timeline, not a feed.
	newest := events[len(events)-1]
	if newest.Kind != model.KindReassign {
		t.Fatalf("expected the newest event to be the reassignment, got %q", newest.Kind)
	}
	if newest.FromOwner == nil || newest.FromOwner.Name == "" {
		t.Error("the owner it moved away from should arrive named, not as a uuid")
	}
	if newest.ToOwner == nil || newest.ToOwner.Name == "" {
		t.Error("the owner it moved to should arrive named, not as a uuid")
	}
	// The ids stay: they are what the record holds, and an account deleted
	// later leaves the id behind with no name to print.
	if newest.ToOwnerID != clerk {
		t.Errorf("to_owner_id = %q, want %q", newest.ToOwnerID, clerk)
	}
}

// Twenty devices shipped together are one action, and the overview shows that
// action once -- so the row has to say how many came with it or the other
// nineteen are mentioned nowhere. Counted over the whole batch on the server:
// the movement log pages through the same rows, and a count taken from the
// rows in hand would label the same shipment differently on the two screens.
func TestBatchAndCorrectionArriveNamed(t *testing.T) {
	h := newHarness(t)
	h.seed(t, 0, 2)
	ids := h.assetIDs(t)
	if len(ids) < 2 {
		t.Fatalf("need two assets, got %d", len(ids))
	}

	rec := h.post(t, "/api/transfers", `{
		"asset_ids": ["`+ids[0]+`","`+ids[1]+`"],
		"to_status": "in_use",
		"to_holder_type": "user",
		"to_holder_id": "`+h.userID+`",
		"note": "两台一起借出"
	}`)
	if rec.Code != http.StatusCreated {
		t.Fatalf("batch returned %d: %s", rec.Code, rec.Body.String())
	}
	moved := decode[transfer.Result](t, rec).Transfers
	if len(moved) != 2 {
		t.Fatalf("expected two events, got %d", len(moved))
	}
	for _, m := range moved {
		if m.BatchSize != 2 {
			t.Errorf("batch_size = %d, want 2 -- the row cannot say how many moved together", m.BatchSize)
		}
	}

	// Correcting the newest event is part of the record, so the reader has to
	// be able to see that it happened and who did it.
	if rec := h.patch(t, "/api/transfers/"+moved[0].ID, `{"note":"其实是给市场部的"}`); rec.Code != http.StatusOK {
		t.Fatalf("correction returned %d: %s", rec.Code, rec.Body.String())
	}
	events := decode[[]model.Transfer](t, h.get(t, "/api/assets/"+moved[0].AssetID+"/transfers"))
	newest := events[len(events)-1]
	if newest.EditedAt == nil {
		t.Fatal("the corrected event should carry when it was corrected")
	}
	if newest.Editor == nil || newest.Editor.Name == "" {
		t.Error("the corrected event should name who corrected it, not just carry an id")
	}
	if newest.Note != "其实是给市场部的" {
		t.Errorf("note = %q, want the corrected one", newest.Note)
	}
}
