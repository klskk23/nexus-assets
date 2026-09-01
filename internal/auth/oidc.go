package auth

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"

	"github.com/coreos/go-oidc/v3/oidc"
	"golang.org/x/oauth2"

	"github.com/klskk23/nexus-assets/internal/i18n"
	"github.com/klskk23/nexus-assets/internal/model"
)

// OIDC drives the Google sign-in flow.
type OIDC struct {
	provider *oidc.Provider
	verifier *oidc.IDTokenVerifier
	oauth    *oauth2.Config
	checker  DomainChecker
}

// NewOIDC discovers the provider and prepares the flow. It returns nil without
// an error when OIDC is not configured, because local accounts must keep
// working on an installation that has no Google Workspace.
func NewOIDC(ctx context.Context, issuer, clientID, clientSecret, redirectURL string,
	checker DomainChecker) (*OIDC, error) {
	if clientID == "" || clientSecret == "" || redirectURL == "" {
		return nil, nil
	}
	provider, err := oidc.NewProvider(ctx, issuer)
	if err != nil {
		return nil, fmt.Errorf("discover OIDC provider %s: %w", issuer, err)
	}
	return &OIDC{
		provider: provider,
		verifier: provider.Verifier(&oidc.Config{ClientID: clientID}),
		oauth: &oauth2.Config{
			ClientID:     clientID,
			ClientSecret: clientSecret,
			RedirectURL:  redirectURL,
			Endpoint:     provider.Endpoint(),
			Scopes:       []string{oidc.ScopeOpenID, "email", "profile"},
		},
		checker: checker,
	}, nil
}

// NewState returns an unguessable value to carry through the round trip.
func NewState() (string, error) {
	b := make([]byte, 24)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("generate state: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

// AuthCodeURL builds the redirect target.
func (o *OIDC) AuthCodeURL(state string) string {
	return o.oauth.AuthCodeURL(state)
}

// Exchange completes the flow: swap the code for tokens, verify the ID token's
// signature and claims, then apply the admission rules.
//
// Verification is not optional. The email claim is only trustworthy because
// Google signed it; without checking the signature the domain whitelist would
// be advisory.
func (o *OIDC) Exchange(ctx context.Context, code string) (IDTokenClaims, error) {
	var claims IDTokenClaims

	// These four are configuration or transport problems -- a wrong client
	// secret, a redirect_uri Google does not recognise, a clock too far out.
	// The reader can do nothing about any of them, so they get one honest
	// sentence while the cause goes to the log, where the administrator is.
	tok, err := o.oauth.Exchange(ctx, code)
	if err != nil {
		return claims, i18n.Wrap(fmt.Errorf("exchange authorisation code: %w", err),
			i18n.KeyOIDCExchangeFailed)
	}
	raw, ok := tok.Extra("id_token").(string)
	if !ok {
		return claims, i18n.Wrap(errors.New("the token response carried no id_token"),
			i18n.KeyOIDCExchangeFailed)
	}
	idToken, err := o.verifier.Verify(ctx, raw)
	if err != nil {
		return claims, i18n.Wrap(fmt.Errorf("verify id_token: %w", err), i18n.KeyOIDCExchangeFailed)
	}
	if err := idToken.Claims(&claims); err != nil {
		return claims, i18n.Wrap(fmt.Errorf("decode id_token claims: %w", err),
			i18n.KeyOIDCExchangeFailed)
	}
	claims.Subject = idToken.Subject

	if err := o.checker.Admit(claims); err != nil {
		return claims, err
	}
	return claims, nil
}

// UpsertUser finds the account for a verified identity, creating it on first
// sign-in. Automatic creation is safe precisely because Admit already ran.
func UpsertUser(ctx context.Context, users *Store, claims IDTokenClaims) (model.User, error) {
	u, err := users.ByEmail(ctx, claims.Email)
	if err == nil {
		return u, nil
	}
	name := claims.Name
	if name == "" {
		name = claims.Email
	}
	return users.Create(ctx, CreateInput{
		Email: claims.Email, Name: name, AuthType: model.AuthOIDC, OIDCSubject: claims.Subject,
	})
}
