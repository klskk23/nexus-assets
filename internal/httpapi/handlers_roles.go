package httpapi

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/klskk23/nexus-assets/internal/audit"
	"github.com/klskk23/nexus-assets/internal/auth"
	"github.com/klskk23/nexus-assets/internal/authz"
	"github.com/klskk23/nexus-assets/internal/i18n"
)

// listRoles answers with every role and how many accounts each holds.
//
// Readable by anyone signed in, like the rest of the configuration: the
// account page shows which role a colleague is on, and hiding that would make
// "why can he do that" unanswerable without an administrator.
func (s *Server) listRoles(c *gin.Context) {
	out, err := s.roles.List(c.Request.Context())
	if err != nil {
		FailErr(c, err)
		return
	}
	if q := strings.TrimSpace(c.Query("q")); q != "" {
		out = keep(out, func(r authz.Role) bool { return matches(q, r.Name) })
	}
	// The one list that always answers with an envelope: it carries the
	// catalogue of switches beside the rows, and the page needs both whether
	// or not it asked for a page.
	offset, limit := Paging(c)
	total := len(out)
	if offset > total {
		offset = total
	}
	end := offset + limit
	if end > total {
		end = total
	}
	c.JSON(http.StatusOK, gin.H{
		"items": out[offset:end], "total": total, "offset": offset, "limit": limit,
		"permissions": authz.All,
	})
}

func (s *Server) createRole(c *gin.Context) {
	var req struct {
		Name        string             `json:"name" binding:"required"`
		Permissions []authz.Permission `json:"permissions"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		FailMsg(c, http.StatusBadRequest, CodeValidationFailed, i18n.KeyBadRequest)
		return
	}
	out, err := s.roles.Create(c.Request.Context(),
		authz.CreateInput{Name: req.Name, Permissions: req.Permissions})
	if err != nil {
		FailErr(c, err)
		return
	}
	if !s.record(c, audit.ActionCreate, audit.TargetRole, out.ID, nil, out) {
		return
	}
	c.JSON(http.StatusCreated, out)
}

func (s *Server) patchRole(c *gin.Context) {
	var req struct {
		Name        *string             `json:"name"`
		Permissions *[]authz.Permission `json:"permissions"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		FailMsg(c, http.StatusBadRequest, CodeValidationFailed, i18n.KeyBadRequest)
		return
	}
	ctx := c.Request.Context()
	before, _ := s.roles.Get(ctx, c.Param("id"))

	out, err := s.roles.Update(ctx, c.Param("id"),
		authz.UpdateInput{Name: req.Name, Permissions: req.Permissions})
	if err != nil {
		FailErr(c, err)
		return
	}
	if !s.record(c, audit.ActionUpdate, audit.TargetRole, out.ID, before, out) {
		return
	}
	c.JSON(http.StatusOK, out)
}

func (s *Server) deleteRole(c *gin.Context) {
	ctx := c.Request.Context()
	before, err := s.roles.Get(ctx, c.Param("id"))
	if err != nil {
		FailErr(c, err)
		return
	}
	if err := s.roles.Delete(ctx, c.Param("id")); err != nil {
		FailErr(c, err)
		return
	}
	if !s.record(c, audit.ActionDelete, audit.TargetRole, before.ID, before, nil) {
		return
	}
	c.Status(http.StatusNoContent)
}

// setUserRole binds an account to a role.
//
// Its own endpoint rather than a field on PATCH /users, because the guards are
// about this change alone: the last administrator cannot be demoted, and
// nobody changes their own role.
func (s *Server) setUserRole(c *gin.Context) {
	var req struct {
		RoleID string `json:"role_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		FailMsg(c, http.StatusBadRequest, CodeValidationFailed, i18n.KeyBadRequest)
		return
	}
	if _, err := s.roles.Get(c.Request.Context(), req.RoleID); err != nil {
		FailErr(c, err)
		return
	}

	actor, _ := auth.CurrentUser(c)
	ctx := c.Request.Context()
	before, _ := s.users.Get(ctx, c.Param("id"))

	out, err := s.users.SetRole(ctx, c.Param("id"), req.RoleID, actor.ID)
	if err != nil {
		FailErr(c, err)
		return
	}
	if !s.record(c, audit.ActionUpdate, audit.TargetUser, out.ID, before, out) {
		return
	}
	c.JSON(http.StatusOK, out)
}
