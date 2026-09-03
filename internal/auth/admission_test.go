package auth

import (
	"testing"

	"github.com/klskk23/nexus-assets/internal/i18n"
)

func TestAdmitRequireHD(t *testing.T) {
	d := DomainChecker{Allowed: []string{"yourcompany.com"}, RequireHD: true}

	t.Run("hd matches", func(t *testing.T) {
		err := d.Admit(IDTokenClaims{Email: "a@yourcompany.com", EmailVerified: true, HostedDomain: "yourcompany.com"})
		if err != nil {
			t.Errorf("should be admitted: %v", err)
		}
	})

	t.Run("hd missing", func(t *testing.T) {
		err := d.Admit(IDTokenClaims{Email: "a@yourcompany.com", EmailVerified: true})
		if err == nil {
			t.Fatal("an absent hd claim must be refused while RequireHD is on")
		}
		if !i18n.HasKey(err, i18n.KeyOIDCNoHostedDomain) {
			t.Errorf("error should tell the operator how to relax this, got: %v", err)
		}
	})

	t.Run("hd mismatched", func(t *testing.T) {
		err := d.Admit(IDTokenClaims{Email: "a@yourcompany.com", EmailVerified: true, HostedDomain: "evil.com"})
		if err == nil {
			t.Fatal("a foreign hosted domain must be refused")
		}
	})
}

func TestAdmitSuffixFallback(t *testing.T) {
	d := DomainChecker{Allowed: []string{"yourcompany.com"}, RequireHD: false}

	if err := d.Admit(IDTokenClaims{Email: "a@YourCompany.com", EmailVerified: true}); err != nil {
		t.Errorf("suffix matching should be case-insensitive: %v", err)
	}
	if err := d.Admit(IDTokenClaims{Email: "a@gmail.com", EmailVerified: true}); err == nil {
		t.Error("an outside domain must be refused")
	}
}

func TestAdmitRequiresVerifiedEmail(t *testing.T) {
	d := DomainChecker{Allowed: []string{"yourcompany.com"}, RequireHD: false}
	if err := d.Admit(IDTokenClaims{Email: "a@yourcompany.com", EmailVerified: false}); err == nil {
		t.Error("an unverified email must be refused even when the domain matches")
	}
}

// Every refusal reaches the login page through userText, which renders an
// error with no catalogue key as "server error" -- so a refusal without one is
// a refusal nobody can act on. This is the guard for that.
func TestEveryRefusalCarriesAMessage(t *testing.T) {
	hd := DomainChecker{Allowed: []string{"yourcompany.com"}, RequireHD: true}
	suffix := DomainChecker{Allowed: []string{"yourcompany.com"}, RequireHD: false}

	cases := []struct {
		name    string
		checker DomainChecker
		claims  IDTokenClaims
		want    string
	}{
		{"unverified email", suffix,
			IDTokenClaims{Email: "a@yourcompany.com"}, i18n.KeyOIDCEmailUnverified},
		{"no email", suffix,
			IDTokenClaims{EmailVerified: true}, i18n.KeyOIDCNoEmail},
		{"no hosted domain", hd,
			IDTokenClaims{Email: "a@yourcompany.com", EmailVerified: true}, i18n.KeyOIDCNoHostedDomain},
		{"foreign hosted domain", hd,
			IDTokenClaims{Email: "a@evil.com", EmailVerified: true, HostedDomain: "evil.com"},
			i18n.KeyOIDCHDNotAllowed},
		{"foreign email domain", suffix,
			IDTokenClaims{Email: "a@gmail.com", EmailVerified: true}, i18n.KeyOIDCDomainRefused},
		{"malformed email", suffix,
			IDTokenClaims{Email: "nobody", EmailVerified: true}, i18n.KeyOIDCEmailMalformed},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := tc.checker.Admit(tc.claims)
			if err == nil {
				t.Fatal("expected a refusal")
			}
			if !i18n.HasKey(err, tc.want) {
				t.Errorf("refusal should carry %s, got: %v", tc.want, err)
			}
			// And it must read as itself in both languages, not as a fallback.
			for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
				if text := i18n.Text(err, lang); text == "" {
					t.Errorf("no %v text for %s", lang, tc.want)
				}
			}
		})
	}
}

// TestWildcardDomains pins the one wildcard form and, just as importantly, the
// shapes that must not match: an allow list where people guess wrong about
// what they granted is a security setting doing the opposite of its job.
func TestWildcardDomains(t *testing.T) {
	d := DomainChecker{Allowed: []string{"*.mixlake.com", "partner.cn"}}

	cases := []struct {
		email string
		ok    bool
		why   string
	}{
		{"a@it.mixlake.com", true, "a subdomain is what the wildcard is for"},
		{"b@a.b.mixlake.com", true, "and so is a deeper one"},
		{"c@IT.MIXLAKE.COM", true, "case is not part of a domain"},
		{"d@mixlake.com", false, "*.example.com does not include example.com -- write both to get both"},
		{"e@evil-mixlake.com", false, "a suffix match would have let this through"},
		{"f@mixlake.com.evil.net", false, "and so would a substring match"},
		{"g@partner.cn", true, "plain entries still work beside a wildcard"},
		{"h@sub.partner.cn", false, "a plain entry is not a wildcard"},
	}
	for _, c := range cases {
		err := d.Admit(IDTokenClaims{Email: c.email, EmailVerified: true})
		if (err == nil) != c.ok {
			t.Errorf("%s: allowed=%v, want %v -- %s", c.email, err == nil, c.ok, c.why)
		}
	}

	// Both forms together, which is how a company admits itself and its
	// subsidiaries' subdomains.
	both := DomainChecker{Allowed: []string{"mixlake.com", "*.mixlake.com"}}
	for _, e := range []string{"a@mixlake.com", "b@it.mixlake.com"} {
		if err := both.Admit(IDTokenClaims{Email: e, EmailVerified: true}); err != nil {
			t.Errorf("%s should be admitted: %v", e, err)
		}
	}

	// A star anywhere else is an ordinary character, so a typo narrows rather
	// than widens: it matches nothing at all.
	typo := DomainChecker{Allowed: []string{"mix*.com", "*"}}
	for _, e := range []string{"a@mixlake.com", "b@anything.com"} {
		if err := typo.Admit(IDTokenClaims{Email: e, EmailVerified: true}); err == nil {
			t.Errorf("%s: a malformed wildcard must not widen the list", e)
		}
	}
}

// The hd claim goes through the same matcher, so a Workspace whose hosted
// domain is a subdomain is admitted by the same entry.
func TestWildcardAppliesToTheHostedDomainToo(t *testing.T) {
	d := DomainChecker{Allowed: []string{"*.mixlake.com"}, RequireHD: true}

	if err := d.Admit(IDTokenClaims{
		Email: "a@it.mixlake.com", EmailVerified: true, HostedDomain: "it.mixlake.com",
	}); err != nil {
		t.Errorf("a subdomain hd should be admitted: %v", err)
	}
	if err := d.Admit(IDTokenClaims{
		Email: "b@mixlake.com", EmailVerified: true, HostedDomain: "mixlake.com",
	}); err == nil {
		t.Error("the parent domain is not included by *.mixlake.com")
	}
}

// TestAnInvitationIsOneAddress covers the second door: a contractor on
// gmail.com whose account an administrator created. The allow list decides who
// may arrive uninvited; putting gmail.com on it would admit every Gmail
// account in the world, which is the thing this avoids.
func TestAnInvitationIsOneAddress(t *testing.T) {
	d := DomainChecker{Allowed: []string{"mixlake.com"}, RequireHD: true}
	outsider := IDTokenClaims{
		Email: "contractor@gmail.com", EmailVerified: true, Subject: "sub-1",
		// A personal Google account carries no hd claim at all, which is why
		// that requirement has to be waived for this door rather than merely
		// passing by luck.
	}

	if err := d.Admit(outsider); err == nil {
		t.Error("without an account, an outsider is refused by the allow list")
	}
	if err := d.AdmitKnown(outsider); err != nil {
		t.Errorf("with an account, the same person is admitted: %v", err)
	}

	// What the invitation does not waive: Google saying the person controls
	// the address. That is the whole basis for matching them to the account.
	unverified := outsider
	unverified.EmailVerified = false
	if err := d.AdmitKnown(unverified); err == nil {
		t.Error("an unverified address must be refused at either door")
	}

	// And the allow list still means what it meant for everybody else.
	insider := IDTokenClaims{Email: "a@mixlake.com", EmailVerified: true, HostedDomain: "mixlake.com"}
	if err := d.Admit(insider); err != nil {
		t.Errorf("the domain path is unchanged: %v", err)
	}
	noHD := IDTokenClaims{Email: "b@mixlake.com", EmailVerified: true}
	if err := d.Admit(noHD); err == nil {
		t.Error("the hosted-domain requirement still applies to the domain path")
	}
}
