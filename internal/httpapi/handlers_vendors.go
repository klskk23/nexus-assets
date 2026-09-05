package httpapi

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/klskk23/nexus-assets/internal/audit"
	"github.com/klskk23/nexus-assets/internal/i18n"
	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/schema"
)

// listVendors keeps the two shapes of 014 decision 92: an envelope when asked
// to search or page, a bare array otherwise. The model form needs the whole set
// -- a paged list would silently truncate the options in a picker.
func (s *Server) listVendors(c *gin.Context) {
	items, err := s.schema.ListVendors(c.Request.Context())
	if err != nil {
		FailErr(c, err)
		return
	}
	respondList(c, items, func(v model.Vendor, q string) bool {
		return matches(q, v.Name)
	})
}

func (s *Server) createVendor(c *gin.Context) {
	var req struct {
		Name string `json:"name" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		FailMsg(c, http.StatusBadRequest, CodeValidationFailed, i18n.KeyBadRequest)
		return
	}
	out, err := s.schema.CreateVendor(c.Request.Context(), req.Name)
	if err != nil {
		FailErr(c, err)
		return
	}
	if !s.record(c, audit.ActionCreate, audit.TargetVendor, out.ID, nil, out) {
		return
	}
	c.JSON(http.StatusCreated, out)
}

// patchVendor renames one. Nothing else follows it: models point at the row and
// every read joins for the name, which is the whole reason this became an
// entity (016, decision 107).
func (s *Server) patchVendor(c *gin.Context) {
	var req struct {
		Name string `json:"name" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		FailMsg(c, http.StatusBadRequest, CodeValidationFailed, i18n.KeyBadRequest)
		return
	}
	ctx := c.Request.Context()
	before, err := s.schema.GetVendor(ctx, c.Param("id"))
	if err != nil {
		FailErr(c, err)
		return
	}
	out, err := s.schema.RenameVendor(ctx, c.Param("id"), req.Name)
	if err != nil {
		FailErr(c, err)
		return
	}
	if !s.record(c, audit.ActionUpdate, audit.TargetVendor, out.ID, before, out) {
		return
	}
	c.JSON(http.StatusOK, out)
}

// deleteVendor refuses while models still come from it, and says how many --
// the same shape the model, status and holder deletes use, so the dialog can
// show the reason rather than discover it.
func (s *Server) deleteVendor(c *gin.Context) {
	ctx := c.Request.Context()
	before, err := s.schema.GetVendor(ctx, c.Param("id"))
	if err != nil {
		FailErr(c, err)
		return
	}
	total, err := s.schema.DeleteVendor(ctx, c.Param("id"))
	if errors.Is(err, schema.ErrVendorInUse) {
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
	if !s.record(c, audit.ActionDelete, audit.TargetVendor, before.ID, before, nil) {
		return
	}
	c.Status(http.StatusNoContent)
}

// bindVendorField hangs a field on a vendor, so every model from that vendor
// has it and every model registered later inherits it too (016, decision 108).
//
// Same permission as the other two binding endpoints: all three are schema
// edits, and the permission set is a closed eighteen.
func (s *Server) bindVendorField(c *gin.Context) {
	req, ok := readBindRequest(c)
	if !ok {
		return
	}
	if err := s.bindOne(c, schema.BindToVendor, req); err != nil {
		FailErr(c, err)
		return
	}
	if !s.record(c, audit.ActionCreate, audit.TargetBinding, c.Param("id"), nil, req) {
		return
	}
	c.Status(http.StatusNoContent)
}

// unbindVendorField detaches one, from every model of that vendor at once.
// Values already stored under it become archived attributes, the same as
// unbinding from a model or a category.
func (s *Server) unbindVendorField(c *gin.Context) {
	if err := s.schema.UnbindVendor(c.Request.Context(), c.Param("id"), c.Param("field_id")); err != nil {
		FailErr(c, err)
		return
	}
	if !s.record(c, audit.ActionDelete, audit.TargetBinding, c.Param("id"), nil, nil) {
		return
	}
	c.Status(http.StatusNoContent)
}

// vendorRequiredImpact counts the devices a required vendor binding would
// eventually land on -- every asset of every model from this vendor.
//
// Decision 70's promise, aimed one level wider than the model-side count:
// nobody ticks "required" on a vendor without being told how many edits they
// are asking of everyone else.
func (s *Server) vendorRequiredImpact(c *gin.Context) {
	n, err := s.schema.VendorRequiredImpact(c.Request.Context(), c.Param("id"))
	if err != nil {
		FailErr(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"total": n})
}

// vendorChangeImpact is the dry-run for moving a model to another vendor: how
// many of its devices hold a value that is about to become read-only history,
// and which fields those are (016, decision 112).
//
// Empty vendor_id means "no vendor at all", which is a real destination rather
// than a missing parameter.
func (s *Server) vendorChangeImpact(c *gin.Context) {
	if _, err := s.schema.GetModel(c.Request.Context(), c.Param("id")); err != nil {
		FailErr(c, err)
		return
	}
	n, fields, err := s.schema.VendorChangeImpact(
		c.Request.Context(), c.Param("id"), c.Query("vendor_id"))
	if err != nil {
		FailErr(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"total": n, "fields": fields})
}
