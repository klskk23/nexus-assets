package config

import (
	"testing"
	"time"
)

func setEnv(t *testing.T, kv map[string]string) {
	t.Helper()
	for k, v := range kv {
		t.Setenv(k, v)
	}
}

func TestLoadRefusesMissingJWTSecret(t *testing.T) {
	setEnv(t, map[string]string{
		"NEXUS_JWT_SECRET":            "",
		"NEXUS_ALLOWED_EMAIL_DOMAINS": "example.com",
	})
	if _, err := Load(); err == nil {
		t.Fatal("expected Load to fail without NEXUS_JWT_SECRET, got nil error")
	}
}

func TestLoadRefusesMissingDomains(t *testing.T) {
	setEnv(t, map[string]string{
		"NEXUS_JWT_SECRET":            "s3cret",
		"NEXUS_ALLOWED_EMAIL_DOMAINS": "",
	})
	if _, err := Load(); err == nil {
		t.Fatal("expected Load to fail without NEXUS_ALLOWED_EMAIL_DOMAINS")
	}
}

func TestLoadDefaults(t *testing.T) {
	setEnv(t, map[string]string{
		"NEXUS_JWT_SECRET":            "s3cret",
		"NEXUS_ALLOWED_EMAIL_DOMAINS": " Example.com , other.org ",
	})
	c, err := Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if c.DBPath != "./nexus.db" {
		t.Errorf("DBPath = %q, want ./nexus.db", c.DBPath)
	}
	// Short by default, because a session is refreshable now: the long-lived
	// half is the cookie, and that one can be revoked.
	if c.JWTTTL != 15*time.Minute {
		t.Errorf("JWTTTL = %v, want 15m", c.JWTTTL)
	}
	if c.RefreshTTL != 720*time.Hour {
		t.Errorf("RefreshTTL = %v, want 720h", c.RefreshTTL)
	}
	if !c.OIDCRequireHD {
		t.Error("OIDCRequireHD should default to true")
	}
	if !c.AllowsDomain("EXAMPLE.COM") {
		t.Error("domain matching should be case-insensitive and trimmed")
	}
	if c.AllowsDomain("evil.com") {
		t.Error("unlisted domain must not be allowed")
	}
	if c.OIDCEnabled() {
		t.Error("OIDCEnabled should be false when client settings are absent")
	}
}
