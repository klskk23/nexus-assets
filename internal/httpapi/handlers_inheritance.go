package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/klskk23/nexus-assets/internal/i18n"
	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/schema"
)

// RawMessage retains explicit null, which ordinary pointer decoding would
// confuse with omission. Preview and save must decode the same draft.
type categoryDraftRequest struct {
	Code              string          `json:"code"`
	Name              *string         `json:"name"`
	ParentID          json.RawMessage `json:"parent_id"`
	DisplayKey        *string         `json:"display_key"`
	PrintPresetIDs    *[]string       `json:"print_preset_ids"`
	InheritedFieldIDs json.RawMessage `json:"inherited_field_ids"`
	ConfirmationToken string          `json:"confirmation_token"`
}

func readCategoryDraft(c *gin.Context) (schema.CategoryDraft, bool) {
	var req categoryDraftRequest
	var draft schema.CategoryDraft
	if err := c.ShouldBindJSON(&req); err != nil {
		FailMsg(c, http.StatusBadRequest, CodeValidationFailed, i18n.KeyBadRequest)
		return draft, false
	}
	draft = schema.CategoryDraft{
		Code: req.Code, Name: req.Name, DisplayKey: req.DisplayKey,
		PrintPresetIDs: req.PrintPresetIDs, ConfirmationToken: req.ConfirmationToken,
	}
	if len(req.ParentID) > 0 {
		var parent *string
		if err := json.Unmarshal(req.ParentID, &parent); err != nil {
			FailField(c, http.StatusBadRequest, "parent_id", i18n.KeyCategoryIDShape)
			return draft, false
		}
		draft.ParentID = &parent
	}
	if len(req.InheritedFieldIDs) > 0 {
		ids, ok := readInheritedIDs(req.InheritedFieldIDs)
		if !ok {
			FailField(c, http.StatusBadRequest, "inherited_field_ids", i18n.KeyInheritanceSelectionShape)
			return draft, false
		}
		draft.InheritedFieldIDs = &ids
	}
	return draft, true
}

func readInheritedIDs(raw json.RawMessage) ([]string, bool) {
	// A null element also needs rejection: []string decoding would silently
	// turn it into an empty string and misreport a shape error as a candidate.
	var values []*string
	if err := json.Unmarshal(raw, &values); err != nil || values == nil {
		return nil, false
	}
	ids := make([]string, 0, len(values))
	for _, value := range values {
		if value == nil {
			return nil, false
		}
		ids = append(ids, *value)
	}
	return ids, true
}

func failCategoryDraft(c *gin.Context, err error) {
	if errors.Is(err, schema.ErrInheritanceSelection) {
		field := "inherited_field_ids"
		if i18n.HasKey(err, i18n.KeyCategoryParentCycle) {
			field = "parent_id"
		}
		message := userText(c, err)
		Fail(c, http.StatusBadRequest, CodeValidationFailed, message, map[string]string{field: message})
		return
	}
	FailErr(c, err)
}

func (s *Server) previewCategory(c *gin.Context) {
	draft, ok := readCategoryDraft(c)
	if !ok {
		return
	}
	preview, err := s.schema.PreviewCategory(c.Request.Context(), c.Param("id"), draft)
	if err != nil {
		failCategoryDraft(c, err)
		return
	}
	c.JSON(http.StatusOK, categoryPreviewResponse(c, preview))
}

func (s *Server) previewUnbindField(c *gin.Context) {
	preview, err := s.schema.PreviewUnbind(c.Request.Context(), c.Param("id"), c.Param("field_id"))
	if err != nil {
		failCategoryDraft(c, err)
		return
	}
	c.JSON(http.StatusOK, categoryPreviewResponse(c, preview))
}

type categoryPreviewIssue struct {
	Code            string `json:"code"`
	Message         string `json:"message"`
	CategoryID      string `json:"category_id,omitempty"`
	FieldID         string `json:"field_id,omitempty"`
	FieldKey        string `json:"field_key,omitempty"`
	AssetID         string `json:"asset_id,omitempty"`
	ConflictAssetID string `json:"conflict_asset_id,omitempty"`
}

type categoryImpactPage struct {
	Page[schema.FieldDelta]
	Added         int `json:"added_count"`
	Removed       int `json:"removed_count"`
	SourceChanged int `json:"source_changed_count"`
	Categories    int `json:"category_count"`
	Assets        int `json:"asset_count"`
}

func categoryPreviewResponse(c *gin.Context, preview schema.CategoryPreview) gin.H {
	impact := categoryImpactPage{
		Page: inheritancePage(c, "impact", preview.Changes), Assets: preview.AssetCount,
	}
	categories := make(map[string]bool)
	for _, change := range preview.Changes {
		categories[change.CategoryID] = true
		switch change.Change {
		case "added":
			impact.Added++
		case "removed":
			impact.Removed++
		case "source_changed":
			impact.SourceChanged++
		}
	}
	impact.Categories = len(categories)
	issues := make([]categoryPreviewIssue, 0, len(preview.Issues))
	for _, issue := range preview.Issues {
		issues = append(issues, categoryPreviewIssue{
			Code: issue.Code, Message: userText(c, issue.Message),
			CategoryID: issue.CategoryID, FieldID: issue.FieldID, FieldKey: issue.FieldKey,
			AssetID: issue.AssetID, ConflictAssetID: issue.ConflictAssetID,
		})
	}
	fields := preview.Fields
	if fields == nil {
		fields = []model.BoundField{}
	}
	return gin.H{
		"category": preview.Category,
		"inheritance": gin.H{
			"parent_id": preview.Category.ParentID, "selected_field_ids": orEmpty(preview.SelectedFieldIDs),
			"candidates": inheritancePage(c, "candidates", preview.Candidates),
		},
		"fields": fields, "impact": impact, "issues": inheritancePage(c, "issues", issues),
		"requires_confirmation": preview.RequiresConfirmation, "confirmation_token": preview.ConfirmationToken,
	}
}

// Pagination only projects a response. The complete domain plan stays intact.
func inheritancePage[T any](c *gin.Context, prefix string, items []T) Page[T] {
	offset, _ := strconv.Atoi(c.Query(prefix + "_offset"))
	limit, _ := strconv.Atoi(c.Query(prefix + "_limit"))
	if limit <= 0 {
		limit = DefaultLimit
	}
	limit = min(limit, MaxLimit)
	offset = max(0, min(offset, len(items)))
	end := offset + min(limit, len(items)-offset)
	return NewPage(items[offset:end], len(items), offset, limit)
}
