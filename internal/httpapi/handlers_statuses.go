package httpapi

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/klskk23/nexus-assets/internal/i18n"

	"github.com/klskk23/nexus-assets/internal/audit"
	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/schema"
)

// listStatuses is read by every screen that shows a status: the badge colour,
// the pickers, the filter bar and the overview cards all resolve keys through
// this one list rather than each carrying their own copy of the five labels.
func (s *Server) listStatuses(c *gin.Context) {
	items, err := s.schema.ListStatuses(c.Request.Context())
	if err != nil {
		FailErr(c, err)
		return
	}
	respondList(c, items, func(st model.Status, q string) bool {
		return matches(q, st.Label, string(st.Key))
	})
}

func (s *Server) createStatus(c *gin.Context) {
	var req struct {
		Key               string `json:"key" binding:"required"`
		Label             string `json:"label" binding:"required"`
		Color             string `json:"color"`
		CountsAsAvailable *bool  `json:"counts_as_available"`
		Terminal          bool   `json:"terminal"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		FailMsg(c, http.StatusBadRequest, CodeValidationFailed, i18n.KeyBadRequest)
		return
	}
	if req.Color == "" {
		req.Color = "slate"
	}
	// A new status counts towards stock unless it says otherwise: the
	// exception is retirement, not the rule.
	counts := true
	if req.CountsAsAvailable != nil {
		counts = *req.CountsAsAvailable
	}

	out, err := s.schema.CreateStatus(c.Request.Context(), schema.CreateStatusInput{
		Key: req.Key, Label: req.Label, Color: req.Color,
		CountsAsAvailable: counts, Terminal: req.Terminal,
	})
	if err != nil {
		FailErr(c, err)
		return
	}
	if !s.record(c, audit.ActionCreate, audit.TargetStatus, string(out.Key), nil, out) {
		return
	}
	c.JSON(http.StatusCreated, out)
}

func (s *Server) patchStatus(c *gin.Context) {
	var req struct {
		Label             *string `json:"label"`
		Color             *string `json:"color"`
		Sort              *int    `json:"sort"`
		CountsAsAvailable *bool   `json:"counts_as_available"`
		Terminal          *bool   `json:"terminal"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		FailMsg(c, http.StatusBadRequest, CodeValidationFailed, i18n.KeyBadRequest)
		return
	}
	ctx := c.Request.Context()
	before, err := s.schema.GetStatus(ctx, c.Param("key"))
	if err != nil {
		FailErr(c, err)
		return
	}

	out, err := s.schema.UpdateStatus(ctx, c.Param("key"), schema.UpdateStatusInput{
		Label: req.Label, Color: req.Color, Sort: req.Sort,
		CountsAsAvailable: req.CountsAsAvailable, Terminal: req.Terminal,
	})
	if err != nil {
		FailErr(c, err)
		return
	}
	if !s.record(c, audit.ActionUpdate, audit.TargetStatus, string(out.Key), before, out) {
		return
	}
	c.JSON(http.StatusOK, out)
}

// statusUsage answers "what would deleting this cost" before anyone commits to
// it: how many devices are in each status now, and how many events mention it.
// The first refuses the delete, the second only degrades the timeline.
//
// It is a separate endpoint from the list because the list is read by every
// screen that renders a badge, and none of them care what a delete would cost.
func (s *Server) statusUsage(c *gin.Context) {
	usage, err := s.schema.AllStatusUsage(c.Request.Context())
	if err != nil {
		FailErr(c, err)
		return
	}
	if usage == nil {
		usage = map[string]schema.StatusUsageCounts{}
	}
	c.JSON(http.StatusOK, usage)
}

func (s *Server) deleteStatus(c *gin.Context) {
	ctx := c.Request.Context()
	before, err := s.schema.GetStatus(ctx, c.Param("key"))
	if err != nil {
		FailErr(c, err)
		return
	}

	total, err := s.schema.DeleteStatus(ctx, c.Param("key"))
	switch {
	case errors.Is(err, schema.ErrStatusBuiltin),
		errors.Is(err, schema.ErrStatusInUse):
		c.AbortWithStatusJSON(http.StatusConflict, gin.H{
			"error": gin.H{
				"code":    CodeReferenceBlocked,
				"message": userText(c, err),
				"total":   total,
			},
		})
		return
	case err != nil:
		FailErr(c, err)
		return
	}

	if !s.record(c, audit.ActionDelete, audit.TargetStatus, string(before.Key), before, nil) {
		return
	}
	c.Status(http.StatusNoContent)
}
