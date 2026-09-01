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
