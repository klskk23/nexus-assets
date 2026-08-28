package auth

import (
	"context"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/klskk23/nexus-assets/internal/model"
)

const contextKey = "nexus.user"

// Middleware verifies the bearer token and loads the account.
//
// No permission checks happen here. The demo deliberately has no roles; the
// admission boundary is the email-domain whitelist at sign-in.
func Middleware(issuer *Issuer, users *Store, onFail func(*gin.Context)) gin.HandlerFunc {
	return func(c *gin.Context) {
		raw := strings.TrimPrefix(c.GetHeader("Authorization"), "Bearer ")
		if raw == "" || raw == c.GetHeader("Authorization") {
			onFail(c)
			return
		}
		claims, err := issuer.Verify(raw)
		if err != nil {
			onFail(c)
			return
		}
		u, err := users.Get(c.Request.Context(), claims.Subject)
		if err != nil || u.Status != model.UserActive {
			onFail(c)
			return
		}
		c.Set(contextKey, u)
		c.Next()
	}
}

// CurrentUser reads the authenticated account off the request context.
func CurrentUser(c *gin.Context) (model.User, bool) {
	v, ok := c.Get(contextKey)
	if !ok {
		return model.User{}, false
	}
	u, ok := v.(model.User)
	return u, ok
}

// Bootstrap creates the first account when the database has none.
//
// The system starts empty on purpose: no seed data, no wizard. Without this the
// very first sign-in would be impossible.
func Bootstrap(ctx context.Context, users *Store, email, password string) (bool, error) {
	if email == "" || password == "" {
		return false, nil
	}
	n, err := users.Count(ctx)
	if err != nil || n > 0 {
		return false, err
	}
	_, err = users.Create(ctx, CreateInput{
		Email: email, Name: "管理员", AuthType: model.AuthLocal, Password: password,
	})
	if err != nil {
		return false, err
	}
	return true, nil
}
