package auth

import (
	"strings"
	"testing"
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
		if !strings.Contains(err.Error(), "NEXUS_OIDC_REQUIRE_HD") {
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
