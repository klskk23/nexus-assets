package httpapi

import (
	"errors"
	"log"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/klskk23/nexus-assets/internal/auth"
	"github.com/klskk23/nexus-assets/internal/i18n"
	"github.com/klskk23/nexus-assets/internal/model"
)

// refreshCookie carries the long-lived half of a sign-in.
//
// HttpOnly, so script on the page cannot read it -- which is the point: the
// access token in localStorage is minutes long, and the thing worth stealing
// is not reachable from there. Path-scoped to the two endpoints that use it,
// so it is not sent with every asset request.
const refreshCookie = "nexus_refresh"
const refreshPath = "/api/auth"

// setRefreshCookie writes the cookie, or clears it when the token is empty.
func setRefreshCookie(c *gin.Context, token string, ttl time.Duration) {
	age := int(ttl.Seconds())
	if token == "" {
		age = -1
	}
	c.SetSameSite(http.SameSiteLaxMode)
	// Secure follows the request: behind TLS in production, plain http on a
	// developer's machine, where a Secure cookie would simply never arrive.
	c.SetCookie(refreshCookie, token, age, refreshPath, "", isTLS(c), true)
}

// isTLS reports whether the browser reached us over https, reverse proxy
// included -- the app itself listens on plain http behind nginx.
func isTLS(c *gin.Context) bool {
	return c.Request.TLS != nil || c.GetHeader("X-Forwarded-Proto") == "https"
}

// startSession issues both halves and plants the cookie.
func (s *Server) startSession(c *gin.Context, u model.User) (string, bool) {
	access, err := s.issuer.Issue(u.ID, u.Email, u.Name, u.TokenVersion)
	if err != nil {
		FailErr(c, err)
		return "", false
	}
	refresh, _, err := s.sessions.Issue(c.Request.Context(), u.ID)
	if err != nil {
		FailErr(c, err)
		return "", false
	}
	setRefreshCookie(c, refresh, s.cfg.RefreshTTL)
	return access, true
}

// refresh trades the cookie for a new access token, and a new cookie.
//
// Rotation on every use is what makes a stolen refresh token detectable: the
// thief and the owner cannot both keep using the chain, and the second one to
// arrive takes the whole family down with it.
func (s *Server) refresh(c *gin.Context) {
	token, err := c.Cookie(refreshCookie)
	if err != nil || token == "" {
		FailMsg(c, http.StatusUnauthorized, CodeUnauthenticated, i18n.KeySessionExpired)
		return
	}

	next, sess, err := s.sessions.Rotate(c.Request.Context(), token)
	if err != nil {
		if !errors.Is(err, auth.ErrRefreshRejected) {
			log.Printf("refresh: %v", err)
		}
		setRefreshCookie(c, "", 0)
		FailMsg(c, http.StatusUnauthorized, CodeUnauthenticated, i18n.KeySessionExpired)
		return
	}

	u, err := s.users.Get(c.Request.Context(), sess.UserID)
	if err != nil || u.Status != model.UserActive {
		// The account went away or was disabled while the session lived on.
		// Ending every session it has is the point of keeping them at all.
		if revokeErr := s.sessions.RevokeUser(c.Request.Context(), sess.UserID); revokeErr != nil {
			log.Printf("refresh: revoking sessions for %s: %v", sess.UserID, revokeErr)
		}
		setRefreshCookie(c, "", 0)
		FailMsg(c, http.StatusUnauthorized, CodeUnauthenticated, i18n.KeyAccountDisabled)
		return
	}

	access, err := s.issuer.Issue(u.ID, u.Email, u.Name, u.TokenVersion)
	if err != nil {
		FailErr(c, err)
		return
	}
	setRefreshCookie(c, next, s.cfg.RefreshTTL)
	c.JSON(http.StatusOK, loginResponse{Token: access, User: u})
}

// logout ends this device's session. Other devices keep theirs, which is what
// signing out of one browser should mean.
func (s *Server) logout(c *gin.Context) {
	if token, err := c.Cookie(refreshCookie); err == nil && token != "" {
		if err := s.sessions.Revoke(c.Request.Context(), token); err != nil {
			log.Printf("logout: %v", err)
		}
	}
	setRefreshCookie(c, "", 0)
	c.Status(http.StatusNoContent)
}
