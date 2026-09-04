package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"
	"slices"

	"github.com/gin-gonic/gin"

	"github.com/klskk23/nexus-assets/internal/i18n"

	"github.com/klskk23/nexus-assets/internal/audit"
	"github.com/klskk23/nexus-assets/internal/auth"
	"github.com/klskk23/nexus-assets/internal/authz"
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
	respondList(c, items, func(cat model.Category, q string) bool {
		return matches(q, cat.Name, cat.Code)
	})
}

func (s *Server) createCategory(c *gin.Context) {
	var req struct {
		Code       string  `json:"code" binding:"required"`
		Name       string  `json:"name" binding:"required"`
		ParentID   *string `json:"parent_id"`
		DisplayKey string  `json:"display_key"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		FailMsg(c, http.StatusBadRequest, CodeValidationFailed, i18n.KeyBadRequest)
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
		// Opaque here: they name presets in the print service, whose contents
		// are that service's business.
		PrintPresetIDs *[]string `json:"print_preset_ids"`
		// RawMessage, not **string: unmarshalling JSON null into a double
		// pointer clears the outer one, so "move to the root" would be
		// indistinguishable from "leave the parent alone" and the guard on
		// moving a populated category would never run.
		ParentID json.RawMessage `json:"parent_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		FailMsg(c, http.StatusBadRequest, CodeValidationFailed, i18n.KeyBadRequest)
		return
	}

	in := schema.UpdateCategoryInput{
		Name: req.Name, DisplayKey: req.DisplayKey, PrintPresetIDs: req.PrintPresetIDs,
	}
	if len(req.ParentID) > 0 {
		var parent *string
		if err := json.Unmarshal(req.ParentID, &parent); err != nil {
			FailField(c, http.StatusBadRequest, "parent_id", i18n.KeyCategoryIDShape)
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

// fieldRow is a field definition plus where it is bound.
//
// The binding is what a field means now -- a key is only unique inside one
// chain -- so the list cannot leave it out and stay readable.
type fieldRow struct {
	model.FieldDefinition
	CategoryIDs []string `json:"category_ids"`
	// ModelIDs is the other kind of binding (015, decision 96): a field hangs
	// on categories or on models, never both, so exactly one of these two is
	// ever non-empty. BindingMode says which, including "unbound" for a field
	// that is on nothing yet and may still become either.
	ModelIDs    []string `json:"model_ids"`
	BindingMode string   `json:"binding_mode"`
}

func (s *Server) listFields(c *gin.Context) {
	offset, limit := Paging(c)

	page, err := s.schema.ListFieldPage(c.Request.Context(), schema.FieldFilter{
		CategoryID: c.Query("category_id"),
		Q:          c.Query("q"),
		Type:       model.FieldType(c.Query("type")),
		Offset:     offset,
		Limit:      limit,
	})
	if err != nil {
		FailErr(c, err)
		return
	}
	bound, err := s.schema.BoundCategories(c.Request.Context())
	if err != nil {
		FailErr(c, err)
		return
	}
	onModels, err := s.schema.ModelsOfField(c.Request.Context())
	if err != nil {
		FailErr(c, err)
		return
	}

	rows := make([]fieldRow, 0, len(page.Items))
	for _, f := range page.Items {
		ids := bound[f.ID]
		if ids == nil {
			ids = []string{}
		}
		models := onModels[f.ID]
		if models == nil {
			models = []string{}
		}
		mode := "unbound"
		switch {
		case len(models) > 0:
			mode = "model"
		case len(ids) > 0:
			mode = "category"
		}
		rows = append(rows, fieldRow{
			FieldDefinition: f, CategoryIDs: ids, ModelIDs: models, BindingMode: mode,
		})
	}
	c.JSON(http.StatusOK, gin.H{
		"items": rows, "total": page.Total, "offset": page.Offset, "limit": page.Limit,
	})
}

func (s *Server) createField(c *gin.Context) {
	var req struct {
		Key      string             `json:"key" binding:"required"`
		Label    string             `json:"label" binding:"required"`
		Type     model.FieldType    `json:"type" binding:"required"`
		Options  model.FieldOptions `json:"options"`
		IsUnique bool               `json:"is_unique"`
		// The categories to bind it to as it is created, and whether those
		// bindings are required. A field bound nowhere is on no form, so
		// creating one without this was always the first half of a two-step
		// job.
		CategoryIDs []string `json:"category_ids"`
		// Or models, which is the other mode. Sending both is refused: a field
		// binds one way or the other (015, decision 96).
		ModelIDs []string `json:"model_ids"`
		Required bool     `json:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		FailMsg(c, http.StatusBadRequest, CodeValidationFailed, i18n.KeyBadRequest)
		return
	}
	out, err := s.schema.CreateField(c.Request.Context(), schema.CreateFieldInput{
		Key: req.Key, Label: req.Label, Type: req.Type, Options: req.Options,
		IsUnique: req.IsUnique, CategoryIDs: req.CategoryIDs, ModelIDs: req.ModelIDs,
		Required: req.Required,
	})
	if err != nil {
		// A refused binding is a conflict about a pair, not a bad expression,
		// and it carries its own sentence; flattening every failure to
		// "template invalid" told the reader the wrong thing.
		if errors.Is(err, schema.ErrKeyConflict) || errors.Is(err, schema.ErrDependenciesUnmet) ||
			errors.Is(err, schema.ErrNotFound) {
			FailErr(c, err)
			return
		}
		Fail(c, http.StatusUnprocessableEntity, CodeTemplateInvalid, userText(c, err), nil)
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
		// Required can be changed after the fact (018); is_unique deliberately
		// cannot, and is not read here even if it is sent. Turning uniqueness
		// on would have to prove the stored values do not collide and backfill
		// asset_unique_values for every asset holding one -- required only
		// ever describes the next edit, so flipping it costs nothing.
		Required *bool `json:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		FailMsg(c, http.StatusBadRequest, CodeValidationFailed, i18n.KeyBadRequest)
		return
	}
	ctx := c.Request.Context()
	before, _ := s.schema.GetField(ctx, c.Param("id"))

	out, err := s.schema.UpdateField(ctx, c.Param("id"), schema.UpdateFieldInput{
		Label: req.Label, Options: req.Options, Required: req.Required,
	})
	if err != nil {
		Fail(c, http.StatusUnprocessableEntity, CodeValidationFailed, userText(c, err), nil)
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
		FieldID string `json:"field_id" binding:"required"`
		Sort    int    `json:"sort"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		FailMsg(c, http.StatusBadRequest, CodeValidationFailed, i18n.KeyBadRequest)
		return
	}
	if err := s.schema.Bind(c.Request.Context(), c.Param("id"), req.FieldID, req.Sort); err != nil {
		FailErr(c, err)
		return
	}
	if !s.record(c, audit.ActionCreate, audit.TargetBinding, c.Param("id"), nil, req) {
		return
	}
	c.Status(http.StatusNoContent)
}

// bindModelField hangs a field on a model rather than on a category (015).
//
// Same permission as binding to a category: both are schema edits, and the
// permission set is a closed eighteen -- a nineteenth switch for the same act
// under a different target would be a distinction nobody administering this
// could act on.
func (s *Server) bindModelField(c *gin.Context) {
	var req struct {
		FieldID string `json:"field_id" binding:"required"`
		Sort    int    `json:"sort"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		FailMsg(c, http.StatusBadRequest, CodeValidationFailed, i18n.KeyBadRequest)
		return
	}
	if err := s.schema.BindModel(c.Request.Context(), c.Param("id"), req.FieldID, req.Sort); err != nil {
		FailErr(c, err)
		return
	}
	if !s.record(c, audit.ActionCreate, audit.TargetBinding, c.Param("id"), nil, req) {
		return
	}
	c.Status(http.StatusNoContent)
}

// unbindModelField detaches one. Values already stored under the field become
// archived attributes, the same as unbinding from a category.
func (s *Server) unbindModelField(c *gin.Context) {
	if err := s.schema.UnbindModel(c.Request.Context(), c.Param("id"), c.Param("field_id")); err != nil {
		FailErr(c, err)
		return
	}
	if !s.record(c, audit.ActionDelete, audit.TargetBinding, c.Param("id"), nil, nil) {
		return
	}
	c.Status(http.StatusNoContent)
}

// modelRequiredImpact says how many existing devices a required binding would
// eventually land on, so the person ticking the box knows what they are asking
// of whoever edits those devices next (decision 70's promise, model-side).
func (s *Server) modelRequiredImpact(c *gin.Context) {
	n, err := s.schema.ModelRequiredImpact(c.Request.Context(), c.Param("id"))
	if err != nil {
		FailErr(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"total": n})
}

func (s *Server) listModels(c *gin.Context) {
	items, err := s.schema.ListModels(c.Request.Context())
	if err != nil {
		FailErr(c, err)
		return
	}
	if want := c.Query("category_id"); want != "" {
		items = keep(items, func(m model.ProductModel) bool {
			return slices.Contains(m.CategoryIDs, want)
		})
	}
	respondList(c, items, func(m model.ProductModel, q string) bool {
		return matches(q, m.Name, m.Vendor)
	})
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
		FailMsg(c, http.StatusBadRequest, CodeValidationFailed, i18n.KeyBadRequest)
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

func (s *Server) patchModel(c *gin.Context) {
	var req struct {
		Name         *string         `json:"name"`
		Vendor       *string         `json:"vendor"`
		ImageURL     *string         `json:"image_url"`
		CategoryIDs  *[]string       `json:"category_ids"`
		AttrDefaults *map[string]any `json:"attr_defaults"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		FailMsg(c, http.StatusBadRequest, CodeValidationFailed, i18n.KeyBadRequest)
		return
	}
	ctx := c.Request.Context()
	before, err := s.schema.GetModel(ctx, c.Param("id"))
	if err != nil {
		FailErr(c, err)
		return
	}

	out, err := s.schema.UpdateModel(ctx, c.Param("id"), schema.UpdateModelInput{
		Name: req.Name, Vendor: req.Vendor, ImageURL: req.ImageURL,
		CategoryIDs: req.CategoryIDs, AttrDefaults: req.AttrDefaults,
	})
	if err != nil {
		FailErr(c, err)
		return
	}
	if !s.record(c, audit.ActionUpdate, audit.TargetModel, out.ID, before, out) {
		return
	}
	c.JSON(http.StatusOK, out)
}

// modelUsage answers "what would deleting this cost" before anyone commits.
func (s *Server) modelUsage(c *gin.Context) {
	ctx := c.Request.Context()
	if _, err := s.schema.GetModel(ctx, c.Param("id")); err != nil {
		FailErr(c, err)
		return
	}
	n, err := s.schema.ModelUsage(ctx, c.Param("id"))
	if err != nil {
		FailErr(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"assets": n})
}

func (s *Server) deleteModel(c *gin.Context) {
	ctx := c.Request.Context()
	before, err := s.schema.GetModel(ctx, c.Param("id"))
	if err != nil {
		FailErr(c, err)
		return
	}

	total, err := s.schema.DeleteModel(ctx, c.Param("id"))
	if errors.Is(err, schema.ErrModelInUse) {
		c.AbortWithStatusJSON(http.StatusConflict, gin.H{
			"error": gin.H{
				"code":    CodeReferenceBlocked,
				"message": userText(c, err),
				"total":   total,
			},
		})
		return
	}
	if err != nil {
		FailErr(c, err)
		return
	}
	if !s.record(c, audit.ActionDelete, audit.TargetModel, before.ID, before, nil) {
		return
	}
	c.Status(http.StatusNoContent)
}

func (s *Server) listHolders(c *gin.Context) {
	items, err := s.holders.List(c.Request.Context())
	if err != nil {
		FailErr(c, err)
		return
	}
	if want := c.Query("type"); want != "" {
		items = keep(items, func(h model.HolderEntity) bool { return string(h.Type) == want })
	}
	// Only "show me the stock points" is offered; "show me the ones that are
	// not" is a question nobody asks of a list that is mostly them.
	if c.Query("is_default_stock") == "true" {
		items = keep(items, func(h model.HolderEntity) bool { return h.IsDefaultStock })
	}
	respondList(c, items, func(h model.HolderEntity, q string) bool {
		return matches(q, h.Name, h.Note)
	})
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
		FailMsg(c, http.StatusBadRequest, CodeValidationFailed, i18n.KeyBadRequest)
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
		Name         *string `json:"name"`
		Note         *string `json:"note"`
		// RawMessage, not **string: unmarshalling JSON null into a double
		// pointer clears the outer one, so "detach from the parent" would be
		// indistinguishable from "leave the parent alone".
		ParentID json.RawMessage `json:"parent_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		FailMsg(c, http.StatusBadRequest, CodeValidationFailed, i18n.KeyBadRequest)
		return
	}
	ctx := c.Request.Context()
	before, _ := s.holders.Get(ctx, c.Param("id"))

	// One endpoint, two permissions. Renaming a warehouse and deciding where
	// every unspecified check-in returns to are different acts, and the second
	// one is felt for months by people who never touched it.
	if req.Name != nil || req.Note != nil || len(req.ParentID) > 0 {
		if !auth.Permissions(c).Can(authz.HolderUpdate) {
			forbid(c, authz.HolderUpdate)
			return
		}
		in := holder.UpdateInput{Name: req.Name, Note: req.Note}
		if len(req.ParentID) > 0 {
			var parent *string
			if err := json.Unmarshal(req.ParentID, &parent); err != nil {
				FailField(c, http.StatusBadRequest, "parent_id", i18n.KeyParentIDShape)
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
		if !auth.Permissions(c).Can(authz.HolderDefaultStock) {
			forbid(c, authz.HolderDefaultStock)
			return
		}
		// Saying false used to be accepted and then quietly ignored, so a
		// request that did nothing came back 200. The marker moves; it does not
		// switch off.
		if !*req.DefaultStock {
			Fail(c, http.StatusUnprocessableEntity, CodeValidationFailed, i18n.M(i18n.KeyHolderDefaultStock).In(LangOf(c)),
				map[string]string{"is_default_stock": i18n.M(i18n.KeyHolderDefaultStock).In(LangOf(c))})
			return
		}
		if err := s.holders.SetDefaultStock(ctx, c.Param("id")); err != nil {
			FailErr(c, err)
			return
		}
	}
	out, err := s.holders.Get(ctx, c.Param("id"))
	if err != nil {
		FailErr(c, err)
		return
	}
	if !s.record(c, audit.ActionUpdate, audit.TargetHolder, out.ID, before, out) {
		return
	}
	c.JSON(http.StatusOK, out)
}

// holderUsage answers "what would deleting this cost" before anyone commits to
// it. Assets and children refuse; history only degrades the timeline.
func (s *Server) holderUsage(c *gin.Context) {
	ctx := c.Request.Context()
	// Existence first: the counts of a holder that is not there are all zero,
	// which reads as "safe to delete" rather than as "no such thing".
	if _, err := s.holders.Get(ctx, c.Param("id")); err != nil {
		FailErr(c, err)
		return
	}
	usage, err := s.holders.Usage(ctx, c.Param("id"))
	if err != nil {
		FailErr(c, err)
		return
	}
	c.JSON(http.StatusOK, usage)
}

func (s *Server) deleteHolder(c *gin.Context) {
	ctx := c.Request.Context()
	before, err := s.holders.Get(ctx, c.Param("id"))
	if err != nil {
		FailErr(c, err)
		return
	}

	usage, err := s.holders.Delete(ctx, c.Param("id"))
	if err != nil {
		s.failHolderDelete(c, err, usage)
		return
	}
	if !s.record(c, audit.ActionDelete, audit.TargetHolder, before.ID, before, nil) {
		return
	}
	c.Status(http.StatusNoContent)
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

// recomputeField re-derives every asset a field's expression can reach.
//
// The category endpoint asks "renumber this subtree"; this one asks "make the
// stored values agree with the rule I just changed", which is the question the
// field editor is in a position to ask.
func (s *Server) recomputeField(c *gin.Context) {
	dryRun := c.DefaultQuery("dry_run", "true") != "false"

	report, err := s.assets.RecomputeField(c.Request.Context(), c.Param("id"), dryRun)
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
	refs, err := s.schema.ReferrersOf(c.Request.Context(), f.ID, f.Key)
	if err != nil {
		FailErr(c, err)
		return
	}
	if refs == nil {
		refs = []schema.Referrer{}
	}
	c.JSON(http.StatusOK, refs)
}

// failHolderDelete attaches what is in the way to a refusal, so the page can
// show it rather than a bare conflict.
//
// Two shapes because the operator does different things about them: blocking
// assets are moved or re-pointed one at a time, while children are a count you
// deal with in the tree.
func (s *Server) failHolderDelete(c *gin.Context, err error, usage holder.Usage) {
	switch {
	case errors.Is(err, holder.ErrReferenced):
		blockers, total, listErr := s.holders.Blockers(c.Request.Context(), c.Param("id"))
		if listErr != nil {
			blockers, total = nil, usage.Assets
		}
		c.AbortWithStatusJSON(http.StatusConflict, gin.H{
			"error": gin.H{
				"code":     CodeReferenceBlocked,
				"message":  userText(c, err),
				"blockers": blockers,
				"total":    total,
			},
		})
	case errors.Is(err, holder.ErrHasChildren):
		c.AbortWithStatusJSON(http.StatusConflict, gin.H{
			"error": gin.H{
				"code":    CodeReferenceBlocked,
				"message": userText(c, err),
				"total":   usage.Children,
			},
		})
	default:
		FailErr(c, err)
	}
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
				"message":   userText(c, err),
				"referrers": referrers,
			},
		})
		return
	case errors.Is(err, schema.ErrFieldInUse):
		c.AbortWithStatusJSON(http.StatusConflict, gin.H{
			"error": gin.H{
				"code":     CodeReferenceBlocked,
				"message":  userText(c, err),
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
				"message":  userText(c, err),
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
