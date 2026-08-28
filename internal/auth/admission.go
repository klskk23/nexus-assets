package auth

import (
	"fmt"
	"strings"
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
	if !c.EmailVerified {
		return fmt.Errorf("the Google account's email address is not verified")
	}
	if c.Email == "" {
		return fmt.Errorf("the Google account did not provide an email address")
	}

	if d.RequireHD {
		if c.HostedDomain == "" {
			return fmt.Errorf("this sign-in carries no hosted-domain claim; " +
				"set NEXUS_OIDC_REQUIRE_HD=false if the company does not use Google Workspace")
		}
		if !d.allows(c.HostedDomain) {
			return fmt.Errorf("hosted domain %q is not on the allow list", c.HostedDomain)
		}
		return nil
	}

	at := strings.LastIndex(c.Email, "@")
	if at < 0 {
		return fmt.Errorf("malformed email address %q", c.Email)
	}
	suffix := c.Email[at+1:]
	if !d.allows(suffix) {
		return fmt.Errorf("email domain %q is not on the allow list", suffix)
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
