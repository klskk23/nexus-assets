package httpapi

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/klskk23/nexus-assets/internal/audit"
	"github.com/klskk23/nexus-assets/internal/i18n"
	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/schema"
)

// listGroups keeps both shapes of 014 decision 92, like every other list.
func (s *Server) listGroups(c *gin.Context) {
	items, err := s.schema.ListGroups(c.Request.Context())
	if err != nil {
		FailErr(c, err)
		return
	}
	respondList(c, items, func(g model.FieldGroup, q string) bool {
		return matches(q, g.Name)
	})
}

func (s *Server) createGroup(c *gin.Context) {
	var req struct {
		Name     string   `json:"name" binding:"required"`
		FieldIDs []string `json:"field_ids"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		FailMsg(c, http.StatusBadRequest, CodeValidationFailed, i18n.KeyBadRequest)
		return
	}
	out, err := s.schema.CreateGroup(c.Request.Context(), req.Name, req.FieldIDs)
	if err != nil {
		FailErr(c, err)
		return
	}
	if !s.record(c, audit.ActionCreate, audit.TargetGroup, out.ID, nil, out) {
		return
	}
	c.JSON(http.StatusCreated, out)
}

// patchGroup renames a group, replaces its members, or both.
//
// Replacing the members changes nothing that was already bound: a bound group
// left no trace to revisit. That is decision 105's accepted cost, and the
// confirmation in the interface says it out loud.
func (s *Server) patchGroup(c *gin.Context) {
	var req struct {
		Name     *string   `json:"name"`
		FieldIDs *[]string `json:"field_ids"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		FailMsg(c, http.StatusBadRequest, CodeValidationFailed, i18n.KeyBadRequest)
		return
	}
	ctx := c.Request.Context()
	before, err := s.schema.GetGroup(ctx, c.Param("id"))
	if err != nil {
		FailErr(c, err)
		return
	}
	out, err := s.schema.UpdateGroup(ctx, c.Param("id"), req.Name, req.FieldIDs)
	if err != nil {
		FailErr(c, err)
		return
	}
	if !s.record(c, audit.ActionUpdate, audit.TargetGroup, out.ID, before, out) {
		return
	}
	c.JSON(http.StatusOK, out)
}

// deleteGroup removes the group and leaves every binding it produced in place.
// There is no "unbind the group": the expansion left nothing to reverse.
func (s *Server) deleteGroup(c *gin.Context) {
	ctx := c.Request.Context()
	before, err := s.schema.GetGroup(ctx, c.Param("id"))
	if err != nil {
		FailErr(c, err)
		return
	}
	if err := s.schema.DeleteGroup(ctx, c.Param("id")); err != nil {
		FailErr(c, err)
		return
	}
	if !s.record(c, audit.ActionDelete, audit.TargetGroup, before.ID, before, nil) {
		return
	}
	c.Status(http.StatusNoContent)
}

// bindRequest is what the three binding endpoints accept: one field, or one
// group, never both and never neither.
//
// Binding a group is not a fourth endpoint. It is the same act on the same
// target, and giving it its own route would mean the exclusion rules, the key
// checks and the permissions each had a second place to be got right.
type bindRequest struct {
	FieldID string `json:"field_id"`
	GroupID string `json:"group_id"`
	Sort    int    `json:"sort"`
}

// readBindRequest parses and validates the either/or.
func readBindRequest(c *gin.Context) (bindRequest, bool) {
	var req bindRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		FailMsg(c, http.StatusBadRequest, CodeValidationFailed, i18n.KeyBadRequest)
		return req, false
	}
	if (req.FieldID == "") == (req.GroupID == "") {
		FailMsg(c, http.StatusBadRequest, CodeValidationFailed, i18n.KeyBindNeedsOneTarget)
		return req, false
	}
	return req, true
}

// bindOne runs whichever of the two the request asked for.
//
// The group path is all-or-nothing inside one transaction, so a refusal leaves
// the target exactly as it was -- a half-bound group would leave whoever bound
// it to work out which half (decision 106).
func (s *Server) bindOne(c *gin.Context, target schema.BindTarget, req bindRequest) error {
	ctx, id := c.Request.Context(), c.Param("id")
	if req.GroupID != "" {
		return s.schema.BindGroup(ctx, target, id, req.GroupID)
	}
	switch target {
	case schema.BindToCategory:
		return s.schema.Bind(ctx, id, req.FieldID, req.Sort)
	case schema.BindToModel:
		return s.schema.BindModel(ctx, id, req.FieldID, req.Sort)
	default:
		return s.schema.BindVendor(ctx, id, req.FieldID, req.Sort)
	}
}
