package httpapi

import (
	"context"
	"log"
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

	ctx := c.Request.Context()
	claims, err := s.oidc.Exchange(ctx, c.Query("code"))
	if err != nil {
		// Two audiences, one failure. The reader gets the sentence -- which
		// domain was refused, or that the exchange itself did not complete --
		// and the log gets the cause, because a misconfigured client secret is
		// invisible from the browser and used to be invisible here too.
		log.Printf("oidc: sign-in refused: %v", err)
		c.Redirect(http.StatusFound, "/login?error="+url.QueryEscape(userText(c, err)))
		return
	}

	// Two doors. The allow list says who may arrive uninvited; an account an
	// administrator already created is the invitation, and it names one exact
	// address -- which is how a contractor on gmail.com gets in without
	// admitting every Gmail account in the world.
	//
	// A disabled account is not an invitation: it falls through to the allow
	// list, and if that refuses too the reader is told about the domain. The
	// status check below covers the case where the domain does admit them.
	if err := s.oidc.Admit(claims, s.invited(ctx, claims.Email)); err != nil {
		log.Printf("oidc: sign-in refused for %s: %v", claims.Email, err)
		c.Redirect(http.StatusFound, "/login?error="+url.QueryEscape(userText(c, err)))
		return
	}

	u, err := auth.UpsertUser(ctx, s.users, claims)
	if err != nil {
		log.Printf("oidc: cannot record the account for %s: %v", claims.Email, err)
		FailErr(c, err)
		return
	}
	if u.Status != model.UserActive {
		c.Redirect(http.StatusFound, "/login?error="+url.QueryEscape(i18n.M(i18n.KeyAccountDisabled).In(LangOf(c))))
		return
	}

	tok, ok := s.startSession(c, u)
	if !ok {
		return
	}
	c.Redirect(http.StatusFound, "/login#token="+url.QueryEscape(tok))
}

// invited reports whether this address already has an enabled account, which
// is what the second admission door asks.
//
// Disabled deliberately does not count. Somebody whose account was switched
// off has had their way in taken away, and an invitation that outlived it
// would hand it back -- so they fall through to the allow list, and if that
// refuses too, the refusal names the domain.
func (s *Server) invited(ctx context.Context, email string) bool {
	u, err := s.users.ByEmail(ctx, email)
	return err == nil && u.Status == model.UserActive
}
