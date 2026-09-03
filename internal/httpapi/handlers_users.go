package httpapi

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/klskk23/nexus-assets/internal/i18n"

	"github.com/klskk23/nexus-assets/internal/audit"
	"github.com/klskk23/nexus-assets/internal/auth"
	"github.com/klskk23/nexus-assets/internal/model"
)

func (s *Server) listUsers(c *gin.Context) {
	items, err := s.users.List(c.Request.Context())
	if err != nil {
		FailErr(c, err)
		return
	}
	// The role and the status are filtered here rather than searched: they are
	// dropdowns on the page, and a dropdown that matched "启用" as a substring
	// of a name would be a different feature wearing the same clothes.
	if role := c.Query("role_id"); role != "" {
		items = keep(items, func(u model.User) bool { return u.RoleID == role })
	}
	if status := c.Query("status"); status != "" {
		items = keep(items, func(u model.User) bool { return string(u.Status) == status })
	}
	respondList(c, items, func(u model.User, q string) bool {
		return matches(q, u.Email, u.Name)
	})
}

func (s *Server) createUser(c *gin.Context) {
	var req struct {
		Email    string `json:"email" binding:"required"`
		Name     string `json:"name"`
		Password string `json:"password" binding:"required"`
		// Chosen when the account is made. No default: an account whose
		// permissions nobody decided is the kind of thing that turns out to
		// have been an administrator.
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
	out, err := s.users.Create(c.Request.Context(), auth.CreateInput{
		Email: req.Email, Name: req.Name, AuthType: model.AuthLocal,
		Password: req.Password, RoleID: req.RoleID,
	})
	if err != nil {
		Fail(c, http.StatusUnprocessableEntity, CodeValidationFailed, userText(c, err), nil)
		return
	}
	if !s.record(c, audit.ActionCreate, audit.TargetUser, out.ID, nil, out) {
		return
	}
	c.JSON(http.StatusCreated, out)
}

func (s *Server) patchUser(c *gin.Context) {
	var req struct {
		Disable *bool `json:"disable"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		FailMsg(c, http.StatusBadRequest, CodeValidationFailed, i18n.KeyBadRequest)
		return
	}
	ctx := c.Request.Context()
	before, _ := s.users.Get(ctx, c.Param("id"))

	if req.Disable != nil && *req.Disable {
		if err := s.users.Disable(ctx, c.Param("id")); err != nil {
			FailErr(c, err)
			return
		}
	}
	out, err := s.users.Get(ctx, c.Param("id"))
	if err != nil {
		FailErr(c, err)
		return
	}
	if !s.record(c, audit.ActionArchive, audit.TargetUser, out.ID, before, out) {
		return
	}
	c.JSON(http.StatusOK, out)
}
