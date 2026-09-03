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

// patchUser changes what an administrator may change about an account.
//
// Three-state, the way every other patch in this system is: a field left out
// means "leave it alone", a field given means "make it so". Disabling is the
// only one with a guard behind it -- it can be refused for owning devices or
// for being the last administrator -- so it is applied first and its refusal
// stops the rest.
func (s *Server) patchUser(c *gin.Context) {
	var req struct {
		Disable *bool   `json:"disable"`
		Name    *string `json:"name"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		FailMsg(c, http.StatusBadRequest, CodeValidationFailed, i18n.KeyBadRequest)
		return
	}
	ctx := c.Request.Context()
	id := c.Param("id")
	before, _ := s.users.Get(ctx, id)

	if req.Disable != nil {
		var err error
		if *req.Disable {
			err = s.users.Disable(ctx, id)
		} else {
			// The pair that was missing: {"disable": false} used to be read
			// and ignored, which left a misclick undoable from the interface.
			err = s.users.Enable(ctx, id)
		}
		if err != nil {
			FailErr(c, err)
			return
		}
	}
	if req.Name != nil {
		if err := s.users.Rename(ctx, id, *req.Name); err != nil {
			FailErr(c, err)
			return
		}
	}

	out, err := s.users.Get(ctx, id)
	if err != nil {
		FailErr(c, err)
		return
	}
	action := audit.ActionUpdate
	if req.Disable != nil && *req.Disable {
		action = audit.ActionArchive
	}
	if !s.record(c, action, audit.TargetUser, out.ID, before, out) {
		return
	}
	c.JSON(http.StatusOK, out)
}

// resetPassword sets a new password and ends every session that account had.
//
// Both halves matter. The stored hash stops the old password working; the
// token version and the refresh-token revocation stop the credentials already
// issued. Without the second half a reset leaves the access token in somebody's
// hands valid for its remaining minutes and the refresh token valid
// indefinitely -- and an administrator reaches for this exactly when that is
// the wrong thing to leave open (decision 94).
func (s *Server) resetPassword(c *gin.Context) {
	var req struct {
		Password string `json:"password" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		FailMsg(c, http.StatusBadRequest, CodeValidationFailed, i18n.KeyBadRequest)
		return
	}
	ctx := c.Request.Context()
	id := c.Param("id")
	before, _ := s.users.Get(ctx, id)

	if err := s.users.ResetPassword(ctx, id, req.Password); err != nil {
		FailErr(c, err)
		return
	}
	if s.sessions != nil {
		if err := s.sessions.RevokeUser(ctx, id); err != nil {
			FailErr(c, err)
			return
		}
	}

	out, err := s.users.Get(ctx, id)
	if err != nil {
		FailErr(c, err)
		return
	}
	// The new password is not in the entry, and neither is the old one: an
	// audit trail records that a reset happened and who did it.
	if !s.record(c, audit.ActionUpdate, audit.TargetUser, out.ID, before, out) {
		return
	}
	c.JSON(http.StatusOK, out)
}
