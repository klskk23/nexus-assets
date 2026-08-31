package httpapi

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/klskk23/nexus-assets/internal/i18n"

	"github.com/klskk23/nexus-assets/internal/auth"
	"github.com/klskk23/nexus-assets/internal/model"
)

type loginRequest struct {
	Email    string `json:"email" binding:"required"`
	Password string `json:"password" binding:"required"`
}

type loginResponse struct {
	Token string     `json:"token"`
	User  model.User `json:"user"`
}

func (s *Server) login(c *gin.Context) {
	var req loginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		FailMsg(c, http.StatusBadRequest, CodeValidationFailed, i18n.KeyBadRequest)
		return
	}
	u, err := s.users.ByEmail(c.Request.Context(), req.Email)
	if err != nil || u.AuthType != model.AuthLocal || !auth.CheckPassword(u.PasswordHash, req.Password) {
		// One message for both causes so the endpoint cannot be used to probe
		// which addresses exist.
		FailMsg(c, http.StatusUnauthorized, CodeUnauthenticated, i18n.KeyLoginFailed)
		return
	}
	if u.Status != model.UserActive {
		FailMsg(c, http.StatusForbidden, CodeUnauthenticated, i18n.KeyAccountDisabled)
		return
	}
	tok, err := s.issuer.Issue(u.ID, u.Email, u.Name, u.TokenVersion)
	if err != nil {
		FailErr(c, err)
		return
	}
	c.JSON(http.StatusOK, loginResponse{Token: tok, User: u})
}

func (s *Server) me(c *gin.Context) {
	u, ok := auth.CurrentUser(c)
	if !ok {
		FailMsg(c, http.StatusUnauthorized, CodeUnauthenticated, i18n.KeyUnauthenticated)
		return
	}
	c.JSON(http.StatusOK, u)
}
