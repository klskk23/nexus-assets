package httpapi

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/schema"
)

func TestInheritanceHTTPConfirmationRoundTrip(t *testing.T) {
	h := newHarness(t)
	mac := inheritanceMAC(t, h)
	rec := h.post(t, "/api/categories", fmt.Sprintf(`{"code":"CONF","name":"Confirm","parent_id":%q,"inherited_field_ids":[%q,%q]}`, h.catID, mac, h.snFieldID))
	requireInheritanceStatus(t, rec, 201)
	cat := decode[model.Category](t, rec)
	body := `{"name":"Confirmed","inherited_field_ids":[]}`
	path := "/api/categories/" + cat.ID
	before := inheritanceHTTPState(t, h)
	rec = h.post(t, path+"/preview?impact_limit=1", body)
	requireInheritanceStatus(t, rec, 200)
	p := decode[inheritanceHTTPPreview](t, rec)
	if !p.RequiresConfirmation || p.Token == "" || p.Impact.Total != 2 || len(p.Impact.Items) != 1 {
		t.Fatalf("not confirmable: %+v", p)
	}
	p2 := decode[inheritanceHTTPPreview](t, h.post(t, path+"/preview?impact_offset=1&impact_limit=1", body))
	if p2.Token != p.Token {
		t.Fatal("pagination changed confirmation")
	}
	requireInheritanceStatus(t, h.patch(t, path, body), http.StatusConflict)
	requireInheritanceStatus(t, h.patch(t, path, `{"inherited_field_ids":[],"confirmation_token":"forged"}`), http.StatusConflict)
	if inheritanceHTTPState(t, h) != before {
		t.Fatal("refusal changed state")
	}
	requireInheritanceStatus(t, h.patch(t, path, fmt.Sprintf(`{"name":"Confirmed","inherited_field_ids":[],"confirmation_token":%q}`, p.Token)), 200)
	fields, err := h.schema.EffectiveFields(h.ctx, cat.ID)
	if err != nil || len(fields) != 0 {
		t.Fatalf("withdrawal failed: %+v %v", fields, err)
	}
}

func TestInheritanceHTTPConfirmationStaleDraft(t *testing.T) {
	h := newHarness(t)
	mac := inheritanceMAC(t, h)
	ids := []string{mac}
	cat, err := h.schema.CreateCategory(h.ctx, schema.CreateCategoryInput{Code: "ST", Name: "Stale", ParentID: &h.catID, InheritedFieldIDs: &ids})
	if err != nil {
		t.Fatal(err)
	}
	path := "/api/categories/" + cat.ID
	p := decode[inheritanceHTTPPreview](t, h.post(t, path+"/preview", `{"inherited_field_ids":[]}`))
	if p.Token == "" {
		t.Fatal("no token")
	}
	before := inheritanceHTTPState(t, h)
	rec := h.patch(t, path, fmt.Sprintf(`{"name":"Changed","inherited_field_ids":[],"confirmation_token":%q}`, p.Token))
	requireInheritanceStatus(t, rec, 409)
	if got := decode[struct {
		Error struct {
			Code string `json:"code"`
		} `json:"error"`
	}](t, rec); got.Error.Code != "impact_stale" {
		t.Fatalf("error=%s", rec.Body.String())
	}
	if before != inheritanceHTTPState(t, h) {
		t.Fatal("stale draft wrote state")
	}
}
