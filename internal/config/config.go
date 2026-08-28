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
	DBPath         string
	Addr           string
	JWTSecret      []byte
	JWTTTL         time.Duration
	AllowedDomains []string

	OIDCClientID     string
	OIDCClientSecret string
	OIDCRedirectURL  string
	OIDCIssuer       string
	OIDCRequireHD    bool

	AdminEmail    string
	AdminPassword string
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

// Load reads configuration from the environment.
//
// It deliberately fails when NEXUS_JWT_SECRET is absent instead of generating a
// random key: a generated key would change on every restart, silently logging
// every user out and costing an hour to diagnose.
func Load() (*Config, error) {
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

	ttl := envOr("NEXUS_JWT_TTL", "8h")
	d, err := time.ParseDuration(ttl)
	if err != nil {
		return nil, fmt.Errorf("NEXUS_JWT_TTL %q: %w", ttl, err)
	}
	c.JWTTTL = d

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
