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
	tok, ok := s.startSession(c, u)
	if !ok {
		return
	}
	c.JSON(http.StatusOK, loginResponse{Token: tok, User: u})
}

// patchMe changes the signed-in account's own preferences.
//
// Language and theme live on the account rather than in the browser: they are
// a property of the person, and someone who sets the interface to English on
// one machine means it everywhere. An empty value means "follow the system",
// which is what both settings did before there was anywhere to store them.
func (s *Server) patchMe(c *gin.Context) {
	u, ok := auth.CurrentUser(c)
	if !ok {
		FailMsg(c, http.StatusUnauthorized, CodeUnauthenticated, i18n.KeyUnauthenticated)
		return
	}
	var req struct {
		Lang  *string `json:"lang"`
		Theme *string `json:"theme"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		FailMsg(c, http.StatusBadRequest, CodeValidationFailed, i18n.KeyBadRequest)
		return
	}
	if req.Lang != nil && !validPreference(*req.Lang, "zh", "en") {
		FailField(c, http.StatusUnprocessableEntity, "lang", i18n.KeyPreferenceUnknown, *req.Lang)
		return
	}
	if req.Theme != nil && !validPreference(*req.Theme, "light", "dark") {
		FailField(c, http.StatusUnprocessableEntity, "theme", i18n.KeyPreferenceUnknown, *req.Theme)
		return
	}

	out, err := s.users.UpdatePreferences(c.Request.Context(), u.ID, req.Lang, req.Theme)
	if err != nil {
		FailErr(c, err)
		return
	}
	c.JSON(http.StatusOK, out)
}

// validPreference accepts the listed values and the empty one, which means
// "whatever the system says".
func validPreference(v string, allowed ...string) bool {
	if v == "" {
		return true
	}
	for _, a := range allowed {
		if v == a {
			return true
		}
	}
	return false
}

func (s *Server) me(c *gin.Context) {
	u, ok := auth.CurrentUser(c)
	if !ok {
		FailMsg(c, http.StatusUnauthorized, CodeUnauthenticated, i18n.KeyUnauthenticated)
		return
	}
	// The permissions travel with the account so the interface can disable what
	// it must. It is a convenience, not a boundary: every endpoint checks for
	// itself, the same way the holder tree's rules exist on both sides but only
	// the server's copy decides.
	set := auth.Permissions(c)
	c.JSON(http.StatusOK, gin.H{
		"id": u.ID, "email": u.Email, "name": u.Name, "auth_type": u.AuthType,
		"status": u.Status, "lang": u.Lang, "theme": u.Theme, "role_id": u.RoleID,
		"created_at": u.CreatedAt, "updated_at": u.UpdatedAt,
		"permissions": set.List(), "is_admin": set.Admin(),
	})
}
