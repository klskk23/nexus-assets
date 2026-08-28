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
		SNTemplate string  `json:"sn_template"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		Fail(c, http.StatusBadRequest, CodeValidationFailed, MsgBadRequest, nil)
		return
	}
	out, err := s.schema.CreateCategory(c.Request.Context(), schema.CreateCategoryInput{
		Code: req.Code, Name: req.Name, ParentID: req.ParentID, SNTemplate: req.SNTemplate,
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
		SNTemplate *string `json:"sn_template"`
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

	in := schema.UpdateCategoryInput{Name: req.Name, SNTemplate: req.SNTemplate}
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
	templates, err := s.schema.SNTemplates(ctx)
	if err != nil {
		FailErr(c, err)
		return
	}
	tmpl, from := schema.ResolveSNTemplate(cat.Path, templates)

	if fields == nil {
		fields = []model.BoundField{}
	}
	c.JSON(http.StatusOK, gin.H{
		"category":         cat,
		"sn_template":      tmpl,
		"sn_template_from": from,
		"fields":           schema.ActiveFields(fields),
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
		Archive *bool               `json:"archive"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		Fail(c, http.StatusBadRequest, CodeValidationFailed, MsgBadRequest, nil)
		return
	}
	ctx := c.Request.Context()
	before, _ := s.schema.GetField(ctx, c.Param("id"))

	// Archiving goes through the reference check: a field a template reads may
	// not be taken away, or every asset in that category becomes unsaveable.
	if req.Archive != nil && *req.Archive {
		referrers, err := s.schema.ArchiveField(ctx, c.Param("id"))
		if err != nil {
			if errors.Is(err, schema.ErrFieldReferenced) {
				c.AbortWithStatusJSON(http.StatusConflict, gin.H{
					"error": gin.H{
						"code":      CodeReferenceBlocked,
						"message":   err.Error(),
						"referrers": referrers,
					},
				})
				return
			}
			FailErr(c, err)
			return
		}
		if !s.record(c, audit.ActionArchive, audit.TargetField, c.Param("id"), before, nil) {
			return
		}
	}

	out, err := s.schema.UpdateField(ctx, c.Param("id"), schema.UpdateFieldInput{
		Label: req.Label, Options: req.Options,
	})
	if err != nil {
		Fail(c, http.StatusUnprocessableEntity, CodeValidationFailed, err.Error(), nil)
		return
	}
	if req.Archive == nil || !*req.Archive {
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
		CategoryID   string         `json:"category_id" binding:"required"`
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
		CategoryID: req.CategoryID, Name: req.Name, Vendor: req.Vendor,
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
		Attrs    map[string]any   `json:"attrs"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		Fail(c, http.StatusBadRequest, CodeValidationFailed, MsgBadRequest, nil)
		return
	}
	out, err := s.holders.Create(c.Request.Context(), holder.CreateInput{
		Type: req.Type, Name: req.Name, ParentID: req.ParentID, Attrs: req.Attrs,
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
		DefaultStock *bool `json:"is_default_stock"`
		Archive      *bool `json:"archive"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		Fail(c, http.StatusBadRequest, CodeValidationFailed, MsgBadRequest, nil)
		return
	}
	ctx := c.Request.Context()
	before, _ := s.holders.Get(ctx, c.Param("id"))

	if req.DefaultStock != nil && *req.DefaultStock {
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

// recomputeSN re-derives the serial numbers of a category subtree.
//
// Two phases, and the dry run is the default: changing a rule that governs
// thousands of devices is not something to discover the consequences of after
// the fact.
func (s *Server) recomputeSN(c *gin.Context) {
	dryRun := c.DefaultQuery("dry_run", "true") != "false"

	report, err := s.assets.RecomputeSN(c.Request.Context(), c.Param("id"), dryRun)
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
			"message":  err.Error(),
			"blockers": blockers,
		},
	})
}
