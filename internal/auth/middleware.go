package auth

import (
	"context"
	"crypto/subtle"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/klskk23/nexus-assets/internal/model"
)

const (
	contextKey      = "nexus.user"
	byKeyContextKey = "nexus.by_api_key"
)

// Middleware verifies the bearer credential and loads the account.
//
// Two kinds of credential arrive the same way. A session JWT is minutes long
// and carries its own claims; an API key is a stored secret that acts as the
// account which made it. Which one it is can be told from the token itself, so
// neither has to be tried against the other.
//
// No permission checks happen here. The demo deliberately has no roles; the
// admission boundary is the email-domain whitelist at sign-in.
// ConfigKey is a credential that lives in the configuration file rather than
// in the database.
//
// It exists for the caller that must keep working without anyone to renew it --
// a backup script, a monitoring probe. That also makes it the one credential
// nobody can take away from the interface, which is why it is a single value
// set once by whoever runs the server, and why it acts as a named account
// rather than as some anonymous superuser.
type ConfigKey struct {
	Secret string
	Email  string
}

func Middleware(issuer *Issuer, users *Store, keys *Keys, configKey ConfigKey,
	onFail func(*gin.Context)) gin.HandlerFunc {
	return func(c *gin.Context) {
		raw := strings.TrimPrefix(c.GetHeader("Authorization"), "Bearer ")
		if raw == "" || raw == c.GetHeader("Authorization") {
			onFail(c)
			return
		}

		var userID string
		if configKey.Secret != "" && subtle.ConstantTimeCompare([]byte(raw), []byte(configKey.Secret)) == 1 {
			// Compared in constant time: a bearer token is a secret, and the
			// time taken to reject one should not say how much of it was right.
			u, err := users.ByEmail(c.Request.Context(), configKey.Email)
			if err != nil {
				onFail(c)
				return
			}
			userID = u.ID
			c.Set(byKeyContextKey, true)
		} else if strings.HasPrefix(raw, KeyPrefix) {
			if keys == nil {
				onFail(c)
				return
			}
			id, err := keys.Resolve(c.Request.Context(), raw)
			if err != nil {
				onFail(c)
				return
			}
			userID = id
			c.Set(byKeyContextKey, true)
		} else {
			claims, err := issuer.Verify(raw)
			if err != nil {
				onFail(c)
				return
			}
			userID = claims.Subject
		}

		u, err := users.Get(c.Request.Context(), userID)
		if err != nil || u.Status != model.UserActive {
			onFail(c)
			return
		}
		c.Set(contextKey, u)
		c.Next()
	}
}

// AuthenticatedByKey reports whether this request arrived with an API key
// rather than a browser session.
func AuthenticatedByKey(c *gin.Context) bool {
	v, ok := c.Get(byKeyContextKey)
	return ok && v == true
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
