package auth

import (
	"strings"

	"github.com/klskk23/nexus-assets/internal/i18n"
)

// IDTokenClaims is the subset of a Google ID token this project reads.
type IDTokenClaims struct {
	Subject       string `json:"sub"`
	Email         string `json:"email"`
	EmailVerified bool   `json:"email_verified"`
	Name          string `json:"name"`
	HostedDomain  string `json:"hd"`
}

// DomainChecker decides whether an identity may enter the system.
type DomainChecker struct {
	Allowed   []string
	RequireHD bool
}

// Admit reports whether the identity is allowed in.
//
// The hd claim is preferred because Google only sets it for Workspace accounts
// and vouches that the domain belongs to that organisation. Matching on the
// email suffix alone is weaker, since a personal Google account can in principle
// be registered against an arbitrary verified address. RequireHD is a setting
// rather than a hard-coded choice because a company that does not use Workspace
// has no hd claim at all, and refusing everyone would lock the system.
func (d DomainChecker) Admit(c IDTokenClaims) error {
	// Every refusal here carries a catalogue key. They all end up on the login
	// page through userText, which renders a keyless error as "server error" --
	// and that tells the one person who could act on it, by signing in with
	// the other account or by correcting the allow list, nothing at all.
	if !c.EmailVerified {
		return i18n.M(i18n.KeyOIDCEmailUnverified)
	}
	if c.Email == "" {
		return i18n.M(i18n.KeyOIDCNoEmail)
	}

	if d.RequireHD {
		if c.HostedDomain == "" {
			return i18n.M(i18n.KeyOIDCNoHostedDomain)
		}
		if !d.allows(c.HostedDomain) {
			return i18n.M(i18n.KeyOIDCHDNotAllowed, c.HostedDomain)
		}
		return nil
	}

	at := strings.LastIndex(c.Email, "@")
	if at < 0 {
		return i18n.M(i18n.KeyOIDCEmailMalformed, c.Email)
	}
	suffix := c.Email[at+1:]
	if !d.allows(suffix) {
		return i18n.M(i18n.KeyOIDCDomainRefused, suffix)
	}
	return nil
}

func (d DomainChecker) allows(domain string) bool {
	domain = strings.ToLower(strings.TrimSpace(domain))
	for _, a := range d.Allowed {
		if strings.ToLower(a) == domain {
			return true
		}
	}
	return false
}
