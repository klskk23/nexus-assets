package httpapi

import (
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/klskk23/nexus-assets/internal/asset"
	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/schema"
)

func TestInheritanceHTTPStaleWithNewIssuesUsesEnglishConflict(t *testing.T) {
	h := newHarness(t)
	ids := []string{inheritanceMAC(t, h)}
	cat, err := h.schema.CreateCategory(h.ctx, schema.CreateCategoryInput{Code: "EXTRA", Name: "Extra", ParentID: &h.catID, InheritedFieldIDs: &ids})
	if err != nil {
		t.Fatal(err)
	}
	path := "/api/categories/" + cat.ID
	draft := `{"inherited_field_ids":[]}`
	p := decode[inheritanceHTTPPreview](t, h.post(t, path+"/preview", draft))
	if p.Token == "" {
		t.Fatal("no confirmation token")
	}
	before := inheritanceHTTPState(t, h)
	rec := h.doLang(t, "en", http.MethodPatch, path, draft)
	requireInheritanceStatus(t, rec, 409)
	if !strings.Contains(rec.Body.String(), `"code":"confirmation_required"`) || !strings.Contains(rec.Body.String(), "Preview and confirm the impact") {
		t.Fatalf("English confirmation error=%s", rec.Body.String())
	}
	if before != inheritanceHTTPState(t, h) {
		t.Fatal("missing confirmation wrote state")
	}
	key := "mac"
	if _, err := h.schema.UpdateCategory(h.ctx, cat.ID, schema.UpdateCategoryInput{DisplayKey: &key}); err != nil {
		t.Fatal(err)
	}
	before = inheritanceHTTPState(t, h)
	rec = h.doLang(t, "en", http.MethodPatch, path, fmt.Sprintf(`{"inherited_field_ids":[],"confirmation_token":%q}`, p.Token))
	requireInheritanceStatus(t, rec, 409)
	if !strings.Contains(rec.Body.String(), `"code":"impact_stale"`) || !strings.Contains(rec.Body.String(), "Refresh the impact and confirm again") {
		t.Fatalf("English stale error=%s", rec.Body.String())
	}
	if before != inheritanceHTTPState(t, h) {
		t.Fatal("stale confirmation wrote state")
	}
	// Without an old token this remains a draft validation error, not a demand
	// to confirm an invalid operation.
	rec = h.doLang(t, "en", http.MethodPatch, path, draft)
	requireInheritanceStatus(t, rec, 422)
	if strings.Contains(rec.Body.String(), "confirmation_required") || strings.Contains(rec.Body.String(), "impact_stale") {
		t.Fatalf("business validation lost priority: %s", rec.Body.String())
	}
}

func TestInheritanceHTTPConflictProjectsFullAssetUUIDs(t *testing.T) {
	h := newHarness(t)
	field, err := h.schema.CreateField(h.ctx, schema.CreateFieldInput{Key: "claim", Label: "Claim", Type: model.FieldText, IsUnique: true, CategoryIDs: []string{h.catID}})
	if err != nil {
		t.Fatal(err)
	}
	ids := []string{field.ID}
	child, err := h.schema.CreateCategory(h.ctx, schema.CreateCategoryInput{Code: "CLAIM", Name: "Claim child", ParentID: &h.catID, InheritedFieldIDs: &ids})
	if err != nil {
		t.Fatal(err)
	}
	save := func(category string, attrs map[string]any) model.Asset {
		t.Helper()
		a, err := h.assets.Save(h.ctx, asset.SaveInput{CategoryID: category, Status: model.StatusInStock, OwnerID: h.userID, ActorID: h.userID, Holder: model.Holder{Type: model.HolderTypeEntity, ID: h.locID}, Attrs: attrs})
		if err != nil {
			t.Fatal(err)
		}
		return a
	}
	withdrawn := save(child.ID, map[string]any{"claim": "SHARED"})
	none := []string{}
	preview, err := h.schema.PreviewCategory(h.ctx, child.ID, schema.CategoryDraft{InheritedFieldIDs: &none})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := h.schema.UpdateCategory(h.ctx, child.ID, schema.UpdateCategoryInput{InheritedFieldIDs: &none, ConfirmationToken: preview.ConfirmationToken}); err != nil {
		t.Fatal(err)
	}
	owner := save(h.catID, map[string]any{"mac": "001A2B3C4D5E", "claim": "SHARED"})
	before := inheritanceHTTPState(t, h)
	rec := h.doLang(t, "en", http.MethodPost, "/api/categories/"+child.ID+"/preview", fmt.Sprintf(`{"inherited_field_ids":[%q]}`, field.ID))
	requireInheritanceStatus(t, rec, 200)
	result := decode[struct {
		Token  string `json:"confirmation_token"`
		Issues Page[struct {
			Code            string `json:"code"`
			Message         string `json:"message"`
			AssetID         string `json:"asset_id"`
			ConflictAssetID string `json:"conflict_asset_id"`
			FieldID         string `json:"field_id"`
			FieldKey        string `json:"field_key"`
		}] `json:"issues"`
	}](t, rec)
	if result.Token != "" || result.Issues.Total != 1 || len(result.Issues.Items) != 1 {
		t.Fatalf("conflict preview=%s", rec.Body.String())
	}
	issue := result.Issues.Items[0]
	if issue.Code != "unique_conflict" || issue.AssetID != withdrawn.ID || issue.ConflictAssetID != owner.ID || issue.FieldID != field.ID || issue.FieldKey != "claim" {
		t.Fatalf("UUID projection=%+v", issue)
	}
	if !strings.Contains(issue.Message, "already uses this value") || !strings.Contains(issue.Message, owner.ID) {
		t.Fatalf("English conflict message=%q", issue.Message)
	}
	if before != inheritanceHTTPState(t, h) {
		t.Fatal("conflict preview wrote state")
	}
}
