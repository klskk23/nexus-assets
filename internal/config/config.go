// Package config loads runtime configuration from the environment.
package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

// Config holds every runtime setting. All values come from the environment;
// nothing is read from disk so that a single binary plus a database file is
// the whole deployment artifact.
type Config struct {
	DBPath     string
	Addr       string
	JWTSecret  []byte
	JWTTTL     time.Duration
	RefreshTTL time.Duration
	// PrinterURL is the label printer this deployment prints through. Empty
	// means there is none, and nothing about printing appears in the interface
	// -- which is what an installation without a printer should look like.
	PrinterURL     string
	AllowedDomains []string

	OIDCClientID     string
	OIDCClientSecret string
	OIDCRedirectURL  string
	OIDCIssuer       string
	OIDCRequireHD    bool

	AdminEmail    string
	AdminPassword string
	// AdminAPIKey is a key that lives in the configuration rather than in the
	// database: it never expires and cannot be revoked from the interface,
	// which is what makes it useful for the thing that has to keep working --
	// a backup script, a monitoring probe -- and what makes it dangerous.
	AdminAPIKey string
}

// OIDCEnabled reports whether enough OIDC settings are present to offer the
// Google sign-in flow. Local accounts always work.
func (c *Config) OIDCEnabled() bool {
	return c.OIDCClientID != "" && c.OIDCClientSecret != "" && c.OIDCRedirectURL != ""
}

// AllowsDomain reports whether the given domain is on the admission whitelist.
func (c *Config) AllowsDomain(domain string) bool {
	domain = strings.ToLower(strings.TrimSpace(domain))
	for _, d := range c.AllowedDomains {
		if d == domain {
			return true
		}
	}
	return false
}

// minAdminKeyLength is what a never-expiring key has to be worth. 32 random
// characters is roughly what `openssl rand -base64 24` gives.
const minAdminKeyLength = 32

// Load reads configuration from the environment, after folding in a .env file
// when one is present.
//
// It deliberately fails when NEXUS_JWT_SECRET is absent instead of generating a
// random key: a generated key would change on every restart, silently logging
// every user out and costing an hour to diagnose.
func Load() (*Config, error) {
	if err := LoadEnvFile(os.Getenv(EnvFileVar)); err != nil {
		return nil, err
	}

	c := &Config{
		DBPath:           envOr("NEXUS_DB_PATH", "./nexus.db"),
		Addr:             envOr("NEXUS_ADDR", ":8080"),
		OIDCClientID:     os.Getenv("NEXUS_OIDC_CLIENT_ID"),
		OIDCClientSecret: os.Getenv("NEXUS_OIDC_CLIENT_SECRET"),
		OIDCRedirectURL:  os.Getenv("NEXUS_OIDC_REDIRECT_URL"),
		OIDCIssuer:       envOr("NEXUS_OIDC_ISSUER", "https://accounts.google.com"),
		AdminEmail:       os.Getenv("NEXUS_ADMIN_EMAIL"),
		AdminPassword:    os.Getenv("NEXUS_ADMIN_PASSWORD"),
	}

	secret := os.Getenv("NEXUS_JWT_SECRET")
	if secret == "" {
		return nil, fmt.Errorf("NEXUS_JWT_SECRET is required; refusing to start with a generated key")
	}
	c.JWTSecret = []byte(secret)

	// Short, because it is now refreshable. The long-lived half is the
	// session cookie, which -- unlike this one -- can be taken away.
	ttl := envOr("NEXUS_JWT_TTL", "15m")
	d, err := time.ParseDuration(ttl)
	if err != nil {
		return nil, fmt.Errorf("NEXUS_JWT_TTL %q: %w", ttl, err)
	}
	c.JWTTTL = d

	refresh := envOr("NEXUS_REFRESH_TTL", "720h")
	rd, err := time.ParseDuration(refresh)
	if err != nil {
		return nil, fmt.Errorf("NEXUS_REFRESH_TTL %q: %w", refresh, err)
	}
	if rd <= d {
		return nil, fmt.Errorf("NEXUS_REFRESH_TTL (%s) must outlast NEXUS_JWT_TTL (%s), "+
			"or signing in would end before it could be refreshed", refresh, ttl)
	}
	c.RefreshTTL = rd

	c.PrinterURL = strings.TrimSuffix(os.Getenv("ZENITH_PRINTER_SERVICE_URL"), "/")

	if key := strings.TrimSpace(os.Getenv("NEXUS_ADMIN_API_KEY")); key != "" {
		// It acts as an account, so it needs one to act as. Starting without
		// this would leave a key that authenticates as nobody.
		if c.AdminEmail == "" {
			return nil, fmt.Errorf("NEXUS_ADMIN_API_KEY needs NEXUS_ADMIN_EMAIL: " +
				"the key acts as that account, and there is no other way to say whose it is")
		}
		// Short enough to guess is worse than absent: this one cannot be
		// revoked without an edit and a restart.
		if len(key) < minAdminKeyLength {
			return nil, fmt.Errorf("NEXUS_ADMIN_API_KEY must be at least %d characters; "+
				"it never expires, so a guessable one is a permanent way in", minAdminKeyLength)
		}
		c.AdminAPIKey = key
	}

	domains := os.Getenv("NEXUS_ALLOWED_EMAIL_DOMAINS")
	if domains == "" {
		return nil, fmt.Errorf("NEXUS_ALLOWED_EMAIL_DOMAINS is required")
	}
	for _, d := range strings.Split(domains, ",") {
		if d = strings.ToLower(strings.TrimSpace(d)); d != "" {
			c.AllowedDomains = append(c.AllowedDomains, d)
		}
	}
	if len(c.AllowedDomains) == 0 {
		return nil, fmt.Errorf("NEXUS_ALLOWED_EMAIL_DOMAINS contains no usable domain")
	}

	requireHD := envOr("NEXUS_OIDC_REQUIRE_HD", "true")
	b, err := strconv.ParseBool(requireHD)
	if err != nil {
		return nil, fmt.Errorf("NEXUS_OIDC_REQUIRE_HD %q: %w", requireHD, err)
	}
	c.OIDCRequireHD = b

	return c, nil
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
