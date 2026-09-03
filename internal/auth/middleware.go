package auth

import (
	"context"
	"crypto/subtle"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/klskk23/nexus-assets/internal/authz"
	"github.com/klskk23/nexus-assets/internal/model"
)

const (
	contextKey      = "nexus.user"
	byKeyContextKey = "nexus.by_api_key"
	permsContextKey = "nexus.permissions"
)

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

// credential is what the Authorization header turned out to be.
type credential struct {
	userID string
	// tokenVersion is carried only by a session token. A key has no version of
	// its own: it is revoked by deleting it, which resolving already answers.
	tokenVersion int
	versioned    bool
	// configured marks the key from the configuration file, which acts as an
	// administrator whatever role its account carries.
	configured bool
	byKey      bool
}

// resolve turns a bearer credential into the account it stands for.
//
// Three kinds arrive the same way and can be told apart from the token itself,
// so none has to be tried against the others: the key from the configuration
// file, an API key made in the interface, and a session token.
func resolve(c *gin.Context, raw string, issuer *Issuer, users *Store, keys *Keys,
	configKey ConfigKey) (credential, bool) {

	// Compared in constant time: a bearer token is a secret, and the time
	// taken to reject one should not say how much of it was right.
	if configKey.Secret != "" && subtle.ConstantTimeCompare([]byte(raw), []byte(configKey.Secret)) == 1 {
		u, err := users.ByEmail(c.Request.Context(), configKey.Email)
		if err != nil {
			return credential{}, false
		}
		return credential{userID: u.ID, configured: true, byKey: true}, true
	}

	if strings.HasPrefix(raw, KeyPrefix) {
		if keys == nil {
			return credential{}, false
		}
		id, err := keys.Resolve(c.Request.Context(), raw)
		if err != nil {
			return credential{}, false
		}
		return credential{userID: id, byKey: true}, true
	}

	claims, err := issuer.Verify(raw)
	if err != nil {
		return credential{}, false
	}
	return credential{userID: claims.Subject, tokenVersion: claims.TokenVersion, versioned: true}, true
}

// Middleware verifies the bearer credential, loads the account, and hangs what
// it may do on the request.
//
// Three things are checked in order and each of them can end the request: the
// credential resolves to an account, that account is still enabled, and the
// token was minted at the version the account carries now. The last is what
// makes a password reset immediate rather than eventual.
//
// The permissions are read per request rather than carried in the token, so
// demoting somebody takes effect on their next click instead of on their next
// sign-in.
func Middleware(issuer *Issuer, users *Store, keys *Keys, roles *authz.Roles,
	configKey ConfigKey, onFail func(*gin.Context)) gin.HandlerFunc {
	return func(c *gin.Context) {
		raw := strings.TrimPrefix(c.GetHeader("Authorization"), "Bearer ")
		if raw == "" || raw == c.GetHeader("Authorization") {
			onFail(c)
			return
		}

		cred, ok := resolve(c, raw, issuer, users, keys, configKey)
		if !ok {
			onFail(c)
			return
		}
		if cred.byKey {
			c.Set(byKeyContextKey, true)
		}

		u, err := users.Get(c.Request.Context(), cred.userID)
		if err != nil || u.Status != model.UserActive {
			onFail(c)
			return
		}
		// The version the token was minted at, checked here (decision 94).
		// Resetting somebody's password bumps it, so every token issued before
		// that stops being accepted now rather than fifteen minutes from now.
		if cred.versioned && cred.tokenVersion != u.TokenVersion {
			onFail(c)
			return
		}
		c.Set(contextKey, u)

		// An API key made in the interface carries its owner's permissions as
		// they stand right now: demote the owner and the key follows within the
		// same request. There is deliberately no second permission model for
		// keys (decision 74).
		switch {
		case cred.configured, roles == nil:
			c.Set(permsContextKey, authz.NewSet(true, nil))
		default:
			set, err := roles.SetOf(c.Request.Context(), u.RoleID)
			if err != nil {
				onFail(c)
				return
			}
			c.Set(permsContextKey, set)
		}
		c.Next()
	}
}

// AuthenticatedByKey reports whether this request arrived with an API key
// rather than a browser session.
func AuthenticatedByKey(c *gin.Context) bool {
	v, ok := c.Get(byKeyContextKey)
	return ok && v == true
}

// Permissions reads what this request may do.
//
// Absent means nothing is allowed rather than everything: a route that somehow
// bypassed the middleware should fail closed.
func Permissions(c *gin.Context) authz.Set {
	v, ok := c.Get(permsContextKey)
	if !ok {
		return authz.NewSet(false, nil)
	}
	set, ok := v.(authz.Set)
	if !ok {
		return authz.NewSet(false, nil)
	}
	return set
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
		RoleID: authz.AdminRoleID,
	})
	if err != nil {
		return false, err
	}
	return true, nil
}
