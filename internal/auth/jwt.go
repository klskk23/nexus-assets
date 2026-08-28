// Package auth handles sign-in, session tokens and admission control.
package auth

import (
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// Claims is the payload of a session token.
//
// TokenVersion is carried but not yet checked. The column exists so instant
// revocation can be switched on later without a migration; until then a
// disabled account keeps working until its token expires, which is the accepted
// cost of a stateless token.
type Claims struct {
	jwt.RegisteredClaims
	Email        string `json:"email"`
	Name         string `json:"name"`
	TokenVersion int    `json:"tv"`
}

// Issuer signs and verifies session tokens.
type Issuer struct {
	secret []byte
	ttl    time.Duration
	now    func() time.Time
}

// NewIssuer builds an Issuer. The secret comes from configuration; the process
// refuses to start without one, so there is no generated-key path here.
func NewIssuer(secret []byte, ttl time.Duration) *Issuer {
	return &Issuer{secret: secret, ttl: ttl, now: time.Now}
}

// Issue mints a token for a user.
func (i *Issuer) Issue(userID, email, name string, tokenVersion int) (string, error) {
	now := i.now()
	claims := Claims{
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   userID,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(i.ttl)),
		},
		Email:        email,
		Name:         name,
		TokenVersion: tokenVersion,
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	s, err := tok.SignedString(i.secret)
	if err != nil {
		return "", fmt.Errorf("sign token: %w", err)
	}
	return s, nil
}

// Verify parses and validates a token.
func (i *Issuer) Verify(raw string) (*Claims, error) {
	tok, err := jwt.ParseWithClaims(raw, &Claims{}, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method %v", t.Header["alg"])
		}
		return i.secret, nil
	}, jwt.WithValidMethods([]string{"HS256"}))
	if err != nil {
		return nil, fmt.Errorf("verify token: %w", err)
	}
	claims, ok := tok.Claims.(*Claims)
	if !ok || !tok.Valid {
		return nil, fmt.Errorf("verify token: invalid claims")
	}
	return claims, nil
}
