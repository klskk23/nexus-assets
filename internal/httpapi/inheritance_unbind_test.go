package httpapi

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/klskk23/nexus-assets/internal/authz"
	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/schema"
)

func TestInheritanceHTTPUnbindConfirmation(t *testing.T) {
	h := newHarness(t)
	f, err := h.schema.CreateField(h.ctx, schema.CreateFieldInput{Key: "remove_me", Label: "Remove", Type: model.FieldText, CategoryIDs: []string{h.catID}})
	if err != nil {
		t.Fatal(err)
	}
	path := "/api/categories/" + h.catID + "/bindings/" + f.ID
	reader := h.asRole(t, authz.UserRoleID)
	before := inheritanceHTTPState(t, h)
	rec := h.doAs(t, reader, http.MethodPost, path+"/unbind-preview", `{}`)
	requireInheritanceStatus(t, rec, 200)
	p := decode[inheritanceHTTPPreview](t, rec)
	if !p.RequiresConfirmation || p.Token == "" || p.Impact.Removed != 1 {
		t.Fatalf("preview=%+v", p)
	}
	requireInheritanceStatus(t, h.doAs(t, reader, http.MethodDelete, path, fmt.Sprintf(`{"confirmation_token":%q}`, p.Token)), 403)
	for _, body := range []string{"", `{}`, `{"confirmation_token":"forged"}`} {
		rec := h.do(t, http.MethodDelete, path, body)
		requireInheritanceStatus(t, rec, 409)
	}
	requireInheritanceStatus(t, h.do(t, http.MethodDelete, path, `{broken`), 400)
	if inheritanceHTTPState(t, h) != before {
		t.Fatal("preview or rejected unbind wrote data")
	}
	requireInheritanceStatus(t, h.do(t, http.MethodDelete, path, fmt.Sprintf(`{"confirmation_token":%q}`, p.Token)), 204)
	fields, err := h.schema.EffectiveFields(h.ctx, h.catID)
	if err != nil {
		t.Fatal(err)
	}
	for _, field := range fields {
		if field.ID == f.ID {
			t.Fatal("confirmed binding survived")
		}
	}
	// Already absent is a safe idempotent request, not a new withdrawal.
	requireInheritanceStatus(t, h.do(t, http.MethodDelete, path, ""), 204)
}
