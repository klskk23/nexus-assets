package httpapi

import (
	"net/http"
	"net/url"

	"github.com/gin-gonic/gin"

	"github.com/klskk23/nexus-assets/internal/i18n"

	"github.com/klskk23/nexus-assets/internal/auth"
	"github.com/klskk23/nexus-assets/internal/model"
)

const stateCookie = "nexus_oidc_state"

// oidcStart sends the browser to Google.
//
// The state is kept in a short-lived HttpOnly cookie rather than server memory,
// so a restart mid-sign-in does not strand anyone and nothing has to be swept.
func (s *Server) oidcStart(c *gin.Context) {
	if s.oidc == nil {
		FailMsg(c, http.StatusNotFound, CodeNotFound, i18n.KeyOIDCDisabled)
		return
	}
	state, err := auth.NewState()
	if err != nil {
		FailErr(c, err)
		return
	}
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie(stateCookie, state, 600, "/", "", c.Request.TLS != nil, true)
	c.Redirect(http.StatusFound, s.oidc.AuthCodeURL(state))
}

// oidcCallback finishes the flow and hands the session token to the frontend.
func (s *Server) oidcCallback(c *gin.Context) {
	if s.oidc == nil {
		FailMsg(c, http.StatusNotFound, CodeNotFound, i18n.KeyOIDCDisabled)
		return
	}

	want, err := c.Cookie(stateCookie)
	if err != nil || want == "" || c.Query("state") != want {
		FailMsg(c, http.StatusBadRequest, CodeValidationFailed, i18n.KeyOIDCStateMismatch)
		return
	}
	c.SetCookie(stateCookie, "", -1, "/", "", c.Request.TLS != nil, true)

	claims, err := s.oidc.Exchange(c.Request.Context(), c.Query("code"))
	if err != nil {
		// The message says which domain was refused, so the person can see
		// they signed in with the wrong account rather than guessing.
		c.Redirect(http.StatusFound, "/login?error="+url.QueryEscape(err.Error()))
		return
	}

	u, err := auth.UpsertUser(c.Request.Context(), s.users, claims)
	if err != nil {
		FailErr(c, err)
		return
	}
	if u.Status != model.UserActive {
		c.Redirect(http.StatusFound, "/login?error="+url.QueryEscape(i18n.M(i18n.KeyAccountDisabled).In(LangOf(c))))
		return
	}

	tok, err := s.issuer.Issue(u.ID, u.Email, u.Name, u.TokenVersion)
	if err != nil {
		FailErr(c, err)
		return
	}
	c.Redirect(http.StatusFound, "/login#token="+url.QueryEscape(tok))
}
