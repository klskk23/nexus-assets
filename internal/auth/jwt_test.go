package auth

import (
	"testing"
	"time"
)

func TestIssueAndVerifyRoundTrip(t *testing.T) {
	i := NewIssuer([]byte("test-secret"), 8*time.Hour)
	tok, err := i.Issue("u1", "a@example.com", "阿花", 0)
	if err != nil {
		t.Fatalf("Issue: %v", err)
	}
	c, err := i.Verify(tok)
	if err != nil {
		t.Fatalf("Verify: %v", err)
	}
	if c.Subject != "u1" || c.Email != "a@example.com" {
		t.Errorf("claims = %+v", c)
	}
}

func TestVerifyRejectsExpired(t *testing.T) {
	i := NewIssuer([]byte("test-secret"), time.Hour)
	i.now = func() time.Time { return time.Now().Add(-2 * time.Hour) }
	tok, err := i.Issue("u1", "a@example.com", "阿花", 0)
	if err != nil {
		t.Fatal(err)
	}
	i.now = time.Now
	if _, err := i.Verify(tok); err == nil {
		t.Fatal("an expired token must be refused")
	}
}

func TestVerifyRejectsWrongSecret(t *testing.T) {
	a := NewIssuer([]byte("secret-a"), time.Hour)
	b := NewIssuer([]byte("secret-b"), time.Hour)
	tok, _ := a.Issue("u1", "a@example.com", "阿花", 0)
	if _, err := b.Verify(tok); err == nil {
		t.Fatal("a token signed with another key must be refused")
	}
}

func TestPasswordHashing(t *testing.T) {
	if _, err := HashPassword("short"); err == nil {
		t.Error("a short password must be refused")
	}
	h, err := HashPassword("correct-horse")
	if err != nil {
		t.Fatal(err)
	}
	if !CheckPassword(h, "correct-horse") {
		t.Error("the correct password should verify")
	}
	if CheckPassword(h, "wrong") {
		t.Error("a wrong password must not verify")
	}
}
