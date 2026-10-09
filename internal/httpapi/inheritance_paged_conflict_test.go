package httpapi

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/schema"
)

// Pagination must not turn a hidden restoration conflict into an acceptable
// draft, even when the returned impact is harmless and the issue page is empty.
func TestInheritanceHTTPPagedOutUniqueConflictBlocksWholeSave(t *testing.T) {
	h := newHarness(t)
	safe, err := h.schema.CreateField(h.ctx, schema.CreateFieldInput{
		Key: "paged_safe", Label: "Safe", Type: model.FieldText, CategoryIDs: []string{h.catID},
	})
	if err != nil {
		t.Fatal(err)
	}
	claim, err := h.schema.CreateField(h.ctx, schema.CreateFieldInput{
		Key: "paged_claim", Label: "Claim", Type: model.FieldText, IsUnique: true, CategoryIDs: []string{h.catID},
	})
	if err != nil {
		t.Fatal(err)
	}
	// Explicit binding order puts the harmless addition on the first impact page.
	if err := h.schema.Bind(h.ctx, h.catID, safe.ID, 30); err != nil {
		t.Fatal(err)
	}
	if err := h.schema.Bind(h.ctx, h.catID, claim.ID, 40); err != nil {
		t.Fatal(err)
	}
	selected := []string{claim.ID}
	child := countCategory(t, h, "PAGED", &h.catID, &selected)
	withdrawn := saveCountAsset(t, h, child.ID, nil, map[string]any{claim.Key: "SHARED"})
	empty := []string{}
	withdrawal, err := h.schema.PreviewCategory(h.ctx, child.ID, schema.CategoryDraft{InheritedFieldIDs: &empty})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := h.schema.UpdateCategory(h.ctx, child.ID, schema.UpdateCategoryInput{
		InheritedFieldIDs: &empty, ConfirmationToken: withdrawal.ConfirmationToken,
	}); err != nil {
		t.Fatal(err)
	}
	owner := saveCountAsset(t, h, h.catID, nil, map[string]any{
		"mac": "001A2B3C4D5E", claim.Key: "SHARED",
	})
	before := inheritanceHTTPState(t, h)
	path := "/api/categories/" + child.ID
	draft := fmt.Sprintf(`{"name":"Must not persist","inherited_field_ids":[%q,%q]}`, safe.ID, claim.ID)

	// Establish that the excluded page really contains a unique-value conflict,
	// not a different validation failure or an empty dataset.
	rec := h.post(t, path+"/preview?impact_offset=1&impact_limit=1&issues_limit=1", draft)
	requireInheritanceStatus(t, rec, http.StatusOK)
	fullIssue := decode[struct {
		Impact Page[schema.FieldDelta] `json:"impact"`
		Issues Page[struct {
			Code            string `json:"code"`
			FieldID         string `json:"field_id"`
			AssetID         string `json:"asset_id"`
			ConflictAssetID string `json:"conflict_asset_id"`
		}] `json:"issues"`
	}](t, rec)
	if fullIssue.Impact.Total != 2 || len(fullIssue.Impact.Items) != 1 || fullIssue.Impact.Items[0].FieldID != claim.ID || fullIssue.Issues.Total != 1 || len(fullIssue.Issues.Items) != 1 {
		t.Fatalf("conflict page=%s", rec.Body.String())
	}
	issue := fullIssue.Issues.Items[0]
	if issue.Code != "unique_conflict" || issue.FieldID != claim.ID || issue.AssetID != withdrawn.ID || issue.ConflictAssetID != owner.ID {
		t.Fatalf("wrong hidden conflict: %+v", issue)
	}

	pagination := "?impact_limit=1&issues_offset=1&issues_limit=1"
	rec = h.post(t, path+"/preview"+pagination, draft)
	requireInheritanceStatus(t, rec, http.StatusOK)
	paged := decode[inheritanceHTTPPreview](t, rec)
	if paged.Impact.Total != 2 || paged.Impact.Limit != 1 || len(paged.Impact.Items) != 1 || paged.Impact.Items[0].FieldID != safe.ID {
		t.Fatalf("first impact page must exclude conflicting field: %+v", paged.Impact)
	}
	if paged.Issues.Total != 1 || paged.Issues.Offset != 1 || paged.Issues.Limit != 1 || len(paged.Issues.Items) != 0 || paged.Token != "" {
		t.Fatalf("page hid or authorized the complete conflict: %+v", paged)
	}
	if inheritanceHTTPState(t, h) != before {
		t.Fatal("paged preview changed persistent state")
	}

	// Pagination parameters are presentation only, including if a caller sends
	// them to the save route. The transaction must replan the complete draft.
	for _, tc := range []struct {
		lang, summary, fieldMessage string
	}{
		{"en", "Could not save. Check the highlighted fields.", fmt.Sprintf("Asset %s already uses this value.", owner.ID)},
		{"zh", "保存失败，请检查标注的字段", fmt.Sprintf("该值已被资产 %s 占用", owner.ID)},
	} {
		for _, query := range []string{"", pagination} {
			rec = h.doLang(t, tc.lang, http.MethodPatch, path+query, draft)
			if inheritanceHTTPState(t, h) != before {
				t.Fatal("page-excluded conflict partially saved metadata, selections, assets, indexes or audit")
			}
			requireInheritanceStatus(t, rec, http.StatusUnprocessableEntity)
			got := decode[Envelope](t, rec).Error
			if got.Code != "validation_failed" || got.Message != tc.summary || len(got.Fields) != 1 || got.Fields["paged_claim"] != tc.fieldMessage {
				t.Fatalf("%s conflict save error=%+v, want field message %q", tc.lang, got, tc.fieldMessage)
			}
		}
	}
}
