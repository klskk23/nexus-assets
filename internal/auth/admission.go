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
	if err := d.identity(c); err != nil {
		return err
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

// allows matches a domain against the list, including one wildcard form.
//
// `*.mixlake.com` admits any subdomain and **not** mixlake.com itself. Writing
// both is `mixlake.com,*.mixlake.com`. The alternative -- one entry standing
// for a domain and everything under it -- reads the same and means something
// else, and everywhere this notation already exists (DNS, TLS certificates) it
// means the strict form. An allow list where people guess wrong about what
// they just granted is a security setting doing the opposite of its job.
//
// Only a leading `*.` is special. A `*` anywhere else is an ordinary
// character, so a typo cannot silently widen the list -- it matches nothing,
// and the refusal names the domain that was turned away.
// AdmitKnown is the rule for somebody who already has an account here.
//
// The allow list decides who may arrive **uninvited**; an account an
// administrator created is the invitation, and it names one exact address
// rather than a domain. That is what lets a contractor on gmail.com in without
// admitting every Gmail account in the world -- which is what putting
// gmail.com on the list would do.
//
// The hosted-domain requirement is waived here, and has to be: a personal
// Google account carries no hd claim at all, so requiring one would refuse
// exactly the people this exists for. What is not waived is the verified
// address -- that is Google saying the person controls it, and it is the whole
// basis for matching them to the account.
func (d DomainChecker) AdmitKnown(c IDTokenClaims) error { return d.identity(c) }

// identity is what every sign-in must satisfy, whichever door it came through.
//
// Every refusal here carries a catalogue key. They all end up on the login page
// through userText, which renders a keyless error as "server error" -- and that
// tells the one person who could act on it, by signing in with the other
// account or by correcting the allow list, nothing at all.
func (d DomainChecker) identity(c IDTokenClaims) error {
	if !c.EmailVerified {
		return i18n.M(i18n.KeyOIDCEmailUnverified)
	}
	if c.Email == "" {
		return i18n.M(i18n.KeyOIDCNoEmail)
	}
	return nil
}

func (d DomainChecker) allows(domain string) bool {
	domain = strings.ToLower(strings.TrimSpace(domain))
	if domain == "" {
		return false
	}
	for _, a := range d.Allowed {
		a = strings.ToLower(strings.TrimSpace(a))
		if suffix, ok := strings.CutPrefix(a, "*."); ok {
			// A subdomain, and a real one: ".mixlake.com" must not admit the
			// empty label, and "evil-mixlake.com" must not pass for a
			// subdomain of "mixlake.com".
			if suffix != "" && strings.HasSuffix(domain, "."+suffix) &&
				len(domain) > len(suffix)+1 {
				return true
			}
			continue
		}
		if a == domain {
			return true
		}
	}
	return false
}
