package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/klskk23/nexus-assets/internal/audit"
	"github.com/klskk23/nexus-assets/internal/holder"
	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/schema"
)

func (s *Server) listCategories(c *gin.Context) {
	items, err := s.schema.ListCategories(c.Request.Context())
	if err != nil {
		FailErr(c, err)
		return
	}
	if items == nil {
		items = []model.Category{}
	}
	c.JSON(http.StatusOK, items)
}

func (s *Server) createCategory(c *gin.Context) {
	var req struct {
		Code       string  `json:"code" binding:"required"`
		Name       string  `json:"name" binding:"required"`
		ParentID   *string `json:"parent_id"`
		DisplayKey string  `json:"display_key"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		Fail(c, http.StatusBadRequest, CodeValidationFailed, MsgBadRequest, nil)
		return
	}
	out, err := s.schema.CreateCategory(c.Request.Context(), schema.CreateCategoryInput{
		Code: req.Code, Name: req.Name, ParentID: req.ParentID, DisplayKey: req.DisplayKey,
	})
	if err != nil {
		FailErr(c, err)
		return
	}
	if !s.record(c, audit.ActionCreate, audit.TargetCategory, out.ID, nil, out) {
		return
	}
	c.JSON(http.StatusCreated, out)
}

func (s *Server) patchCategory(c *gin.Context) {
	var req struct {
		Name       *string `json:"name"`
		DisplayKey *string `json:"display_key"`
		// RawMessage, not **string: unmarshalling JSON null into a double
		// pointer clears the outer one, so "move to the root" would be
		// indistinguishable from "leave the parent alone" and the guard on
		// moving a populated category would never run.
		ParentID json.RawMessage `json:"parent_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		Fail(c, http.StatusBadRequest, CodeValidationFailed, MsgBadRequest, nil)
		return
	}

	in := schema.UpdateCategoryInput{Name: req.Name, DisplayKey: req.DisplayKey}
	if len(req.ParentID) > 0 {
		var parent *string
		if err := json.Unmarshal(req.ParentID, &parent); err != nil {
			Fail(c, http.StatusBadRequest, CodeValidationFailed, MsgBadRequest,
				map[string]string{"parent_id": "上级类别必须是 id 或 null"})
			return
		}
		in.ParentID = &parent
	}

	before, _ := s.schema.GetCategory(c.Request.Context(), c.Param("id"))

	out, err := s.schema.UpdateCategory(c.Request.Context(), c.Param("id"), in)
	if err != nil {
		FailErr(c, err)
		return
	}
	if !s.record(c, audit.ActionUpdate, audit.TargetCategory, out.ID, before, out) {
		return
	}
	c.JSON(http.StatusOK, out)
}

// categorySchema is the single source the dynamic form, the filter bar and the
// CSV template all read. Adding a field never requires a frontend change.
func (s *Server) categorySchema(c *gin.Context) {
	ctx := c.Request.Context()
	id := c.Param("id")

	cat, err := s.schema.GetCategory(ctx, id)
	if err != nil {
		FailErr(c, err)
		return
	}
	fields, err := s.schema.EffectiveFields(ctx, id)
	if err != nil {
		FailErr(c, err)
		return
	}
	if fields == nil {
		fields = []model.BoundField{}
	}
	c.JSON(http.StatusOK, gin.H{
		"category": cat,
		"fields":   schema.ActiveFields(fields),
	})
}

func (s *Server) listFields(c *gin.Context) {
	items, err := s.schema.ListFields(c.Request.Context())
	if err != nil {
		FailErr(c, err)
		return
	}
	if items == nil {
		items = []model.FieldDefinition{}
	}
	c.JSON(http.StatusOK, items)
}

func (s *Server) createField(c *gin.Context) {
	var req struct {
		Key      string             `json:"key" binding:"required"`
		Label    string             `json:"label" binding:"required"`
		Type     model.FieldType    `json:"type" binding:"required"`
		Options  model.FieldOptions `json:"options"`
		IsUnique bool               `json:"is_unique"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		Fail(c, http.StatusBadRequest, CodeValidationFailed, MsgBadRequest, nil)
		return
	}
	out, err := s.schema.CreateField(c.Request.Context(), schema.CreateFieldInput{
		Key: req.Key, Label: req.Label, Type: req.Type, Options: req.Options, IsUnique: req.IsUnique,
	})
	if err != nil {
		Fail(c, http.StatusUnprocessableEntity, CodeTemplateInvalid, err.Error(), nil)
		return
	}
	if !s.record(c, audit.ActionCreate, audit.TargetField, out.ID, nil, out) {
		return
	}
	c.JSON(http.StatusCreated, out)
}

func (s *Server) patchField(c *gin.Context) {
	var req struct {
		Label   *string             `json:"label"`
		Options *model.FieldOptions `json:"options"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		Fail(c, http.StatusBadRequest, CodeValidationFailed, MsgBadRequest, nil)
		return
	}
	ctx := c.Request.Context()
	before, _ := s.schema.GetField(ctx, c.Param("id"))

	out, err := s.schema.UpdateField(ctx, c.Param("id"), schema.UpdateFieldInput{
		Label: req.Label, Options: req.Options,
	})
	if err != nil {
		Fail(c, http.StatusUnprocessableEntity, CodeValidationFailed, err.Error(), nil)
		return
	}
	{
		if !s.record(c, audit.ActionUpdate, audit.TargetField, out.ID, before, out) {
			return
		}
	}
	c.JSON(http.StatusOK, out)
}

func (s *Server) bindField(c *gin.Context) {
	var req struct {
		FieldID  string `json:"field_id" binding:"required"`
		Required bool   `json:"required"`
		Sort     int    `json:"sort"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		Fail(c, http.StatusBadRequest, CodeValidationFailed, MsgBadRequest, nil)
		return
	}
	if err := s.schema.Bind(c.Request.Context(), c.Param("id"), req.FieldID, req.Required, req.Sort); err != nil {
		FailErr(c, err)
		return
	}
	if !s.record(c, audit.ActionCreate, audit.TargetBinding, c.Param("id"), nil, req) {
		return
	}
	c.Status(http.StatusNoContent)
}

func (s *Server) listModels(c *gin.Context) {
	items, err := s.schema.ListModels(c.Request.Context())
	if err != nil {
		FailErr(c, err)
		return
	}
	if items == nil {
		items = []model.ProductModel{}
	}
	c.JSON(http.StatusOK, items)
}

func (s *Server) createModel(c *gin.Context) {
	var req struct {
		CategoryIDs  []string       `json:"category_ids"`
		Name         string         `json:"name" binding:"required"`
		Vendor       string         `json:"vendor"`
		ImageURL     string         `json:"image_url"`
		AttrDefaults map[string]any `json:"attr_defaults"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		Fail(c, http.StatusBadRequest, CodeValidationFailed, MsgBadRequest, nil)
		return
	}
	out, err := s.schema.CreateModel(c.Request.Context(), schema.CreateModelInput{
		CategoryIDs: req.CategoryIDs, Name: req.Name, Vendor: req.Vendor,
		ImageURL: req.ImageURL, AttrDefaults: req.AttrDefaults,
	})
	if err != nil {
		FailErr(c, err)
		return
	}
	if !s.record(c, audit.ActionCreate, audit.TargetModel, out.ID, nil, out) {
		return
	}
	c.JSON(http.StatusCreated, out)
}

func (s *Server) listHolders(c *gin.Context) {
	items, err := s.holders.List(c.Request.Context())
	if err != nil {
		FailErr(c, err)
		return
	}
	if items == nil {
		items = []model.HolderEntity{}
	}
	c.JSON(http.StatusOK, items)
}

func (s *Server) createHolder(c *gin.Context) {
	var req struct {
		Type     model.EntityType `json:"type" binding:"required"`
		Name     string           `json:"name" binding:"required"`
		ParentID *string          `json:"parent_id"`
		Note     string           `json:"note"`
		Attrs    map[string]any   `json:"attrs"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		Fail(c, http.StatusBadRequest, CodeValidationFailed, MsgBadRequest, nil)
		return
	}
	out, err := s.holders.Create(c.Request.Context(), holder.CreateInput{
		Type: req.Type, Name: req.Name, ParentID: req.ParentID,
		Note: req.Note, Attrs: req.Attrs,
	})
	if err != nil {
		FailErr(c, err)
		return
	}
	if !s.record(c, audit.ActionCreate, audit.TargetHolder, out.ID, nil, out) {
		return
	}
	c.JSON(http.StatusCreated, out)
}

func (s *Server) patchHolder(c *gin.Context) {
	var req struct {
		DefaultStock *bool   `json:"is_default_stock"`
		Archive      *bool   `json:"archive"`
		Name         *string `json:"name"`
		Note         *string `json:"note"`
		// RawMessage, not **string: unmarshalling JSON null into a double
		// pointer clears the outer one, so "detach from the parent" would be
		// indistinguishable from "leave the parent alone".
		ParentID json.RawMessage `json:"parent_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		Fail(c, http.StatusBadRequest, CodeValidationFailed, MsgBadRequest, nil)
		return
	}
	ctx := c.Request.Context()
	before, _ := s.holders.Get(ctx, c.Param("id"))

	if req.Name != nil || req.Note != nil || len(req.ParentID) > 0 {
		in := holder.UpdateInput{Name: req.Name, Note: req.Note}
		if len(req.ParentID) > 0 {
			var parent *string
			if err := json.Unmarshal(req.ParentID, &parent); err != nil {
				Fail(c, http.StatusBadRequest, CodeValidationFailed, MsgBadRequest,
					map[string]string{"parent_id": "上级必须是 id 或 null"})
				return
			}
			in.ParentID = &parent
		}
		if _, err := s.holders.Update(ctx, c.Param("id"), in); err != nil {
			FailErr(c, err)
			return
		}
	}

	if req.DefaultStock != nil {
		// Saying false used to be accepted and then quietly ignored, so a
		// request that did nothing came back 200. The marker moves; it does not
		// switch off.
		if !*req.DefaultStock {
			Fail(c, http.StatusUnprocessableEntity, CodeValidationFailed, MsgDefaultStockRequired,
				map[string]string{"is_default_stock": MsgDefaultStockRequired})
			return
		}
		if err := s.holders.SetDefaultStock(ctx, c.Param("id")); err != nil {
			FailErr(c, err)
			return
		}
	}
	if req.Archive != nil && *req.Archive {
		if err := s.holders.Archive(ctx, c.Param("id")); err != nil {
			s.failHolder(c, err)
			return
		}
	}
	out, err := s.holders.Get(ctx, c.Param("id"))
	if err != nil {
		FailErr(c, err)
		return
	}
	action := audit.ActionUpdate
	if req.Archive != nil && *req.Archive {
		action = audit.ActionArchive
	}
	if !s.record(c, action, audit.TargetHolder, out.ID, before, out) {
		return
	}
	c.JSON(http.StatusOK, out)
}

// recompute re-evaluates the expression keys of a category subtree.
//
// Two phases, and the dry run is the default: editing a template that governs
// thousands of devices is not something to discover the consequences of after
// the fact.
func (s *Server) recompute(c *gin.Context) {
	dryRun := c.DefaultQuery("dry_run", "true") != "false"

	report, err := s.assets.Recompute(c.Request.Context(), c.Param("id"), dryRun)
	if err != nil {
		FailErr(c, err)
		return
	}
	c.JSON(http.StatusOK, report)
}

// listFieldReferrers reports what reads a field, so the UI can warn before the
// user tries to archive it.
func (s *Server) listFieldReferrers(c *gin.Context) {
	f, err := s.schema.GetField(c.Request.Context(), c.Param("id"))
	if err != nil {
		FailErr(c, err)
		return
	}
	refs, err := s.schema.ReferrersOf(c.Request.Context(), f.Key)
	if err != nil {
		FailErr(c, err)
		return
	}
	if refs == nil {
		refs = []schema.Referrer{}
	}
	c.JSON(http.StatusOK, refs)
}

// failHolder attaches the blocking assets to a refusal so the page can show
// exactly what is in the way rather than a bare conflict.
func (s *Server) failHolder(c *gin.Context, err error) {
	if !errors.Is(err, holder.ErrReferenced) {
		FailErr(c, err)
		return
	}
	blockers, _, listErr := s.holders.Blockers(c.Request.Context(), c.Param("id"))
	if listErr != nil {
		blockers = nil
	}
	c.AbortWithStatusJSON(http.StatusConflict, gin.H{
		"error": gin.H{
			"code":     CodeReferenceBlocked,
			"message":  userText(err, holder.ErrReferenced),
			"blockers": blockers,
		},
	})
}

// deleteField removes an information item.
//
// Two kinds of refusal, and they carry different payloads because the user has
// to do different things about them: a configuration reference is fixed by
// editing that configuration, while stored data is fixed by unbinding instead.
func (s *Server) deleteField(c *gin.Context) {
	ctx := c.Request.Context()
	before, err := s.schema.GetField(ctx, c.Param("id"))
	if err != nil {
		FailErr(c, err)
		return
	}

	referrers, blockers, total, err := s.schema.DeleteField(ctx, c.Param("id"))
	switch {
	case errors.Is(err, schema.ErrFieldReferenced):
		c.AbortWithStatusJSON(http.StatusConflict, gin.H{
			"error": gin.H{
				"code":      CodeReferenceBlocked,
				"message":   userText(err, schema.ErrFieldReferenced),
				"referrers": referrers,
			},
		})
		return
	case errors.Is(err, schema.ErrFieldInUse):
		c.AbortWithStatusJSON(http.StatusConflict, gin.H{
			"error": gin.H{
				"code":     CodeReferenceBlocked,
				"message":  userText(err, schema.ErrFieldInUse),
				"blockers": blockers,
				"total":    total,
			},
		})
		return
	case err != nil:
		FailErr(c, err)
		return
	}

	if !s.record(c, audit.ActionDelete, audit.TargetField, before.ID, before, nil) {
		return
	}
	c.Status(http.StatusNoContent)
}

// unbindField detaches an information item from one category.
//
// The guard behind this has existed since the expression-key work and never
// had a caller. It matters now: with archiving gone, unbinding is the only way
// to retire a field that assets already carry values for.
func (s *Server) unbindField(c *gin.Context) {
	ctx := c.Request.Context()
	if err := s.schema.Unbind(ctx, c.Param("id"), c.Param("field_id")); err != nil {
		FailErr(c, err)
		return
	}
	if !s.record(c, audit.ActionUpdate, audit.TargetBinding, c.Param("id"),
		gin.H{"field_id": c.Param("field_id")}, nil) {
		return
	}
	c.Status(http.StatusNoContent)
}

// deleteCategory removes a category once nothing depends on it.
//
// The three refusals share a code but carry the blocking records, because
// "cannot delete" without them is a dead end: the user has no way to find the
// four assets or the one model that is holding it.
func (s *Server) deleteCategory(c *gin.Context) {
	ctx := c.Request.Context()
	before, err := s.schema.GetCategory(ctx, c.Param("id"))
	if err != nil {
		FailErr(c, err)
		return
	}

	blockers, total, err := s.schema.DeleteCategory(ctx, c.Param("id"))
	switch {
	case errors.Is(err, schema.ErrCategoryHasChildren),
		errors.Is(err, schema.ErrCategoryHasAssets):
		c.AbortWithStatusJSON(http.StatusConflict, gin.H{
			"error": gin.H{
				"code":     CodeReferenceBlocked,
				"message":  userText(err, unwrapSentinel(err)),
				"blockers": blockers,
				"total":    total,
			},
		})
		return
	case err != nil:
		FailErr(c, err)
		return
	}

	if !s.record(c, audit.ActionDelete, audit.TargetCategory, before.ID, before, nil) {
		return
	}
	c.Status(http.StatusNoContent)
}

// unwrapSentinel picks the sentinel a refusal was built from, so its English
// identifier can be stripped without the caller having to guess which one.
func unwrapSentinel(err error) error {
	for _, s := range []error{
		schema.ErrCategoryHasChildren,
		schema.ErrCategoryHasAssets,
		schema.ErrStatusBuiltin,
		schema.ErrStatusInUse,
	} {
		if errors.Is(err, s) {
			return s
		}
	}
	return err
}
