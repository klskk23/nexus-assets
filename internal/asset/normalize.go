// Package asset owns the save pipeline: everything that has to happen, in
// order, for one device record to be written.
package asset

import (
	"net/netip"
	"net/url"
	"regexp"
	"strings"

	"github.com/klskk23/nexus-assets/internal/i18n"
	"github.com/klskk23/nexus-assets/internal/model"
)

var hex12 = regexp.MustCompile(`^[0-9A-F]{12}$`)

// NormalizeMAC canonicalises a MAC address to uppercase hex with no separators.
//
// Without this step 00:1A:2B:3C:4D:5E, 00-1a-2b-3c-4d-5e and 001A2B3C4D5E are
// three different strings, so one network card would pass the uniqueness check
// three times and produce three different serial numbers. That is why
// normalisation must run before the uniqueness check, never after.
func NormalizeMAC(raw string) (string, error) {
	s := strings.ToUpper(strings.NewReplacer(":", "", "-", "", ".", "", " ", "").Replace(strings.TrimSpace(raw)))
	if s == "" {
		return "", i18n.M(i18n.KeyFieldMACEmpty)
	}
	if !hex12.MatchString(s) {
		return "", i18n.M(i18n.KeyFieldMACInvalid, raw)
	}
	return s, nil
}

// NormalizeIP canonicalises an IP address.
func NormalizeIP(raw string) (string, error) {
	addr, err := netip.ParseAddr(strings.TrimSpace(raw))
	if err != nil {
		return "", i18n.M(i18n.KeyFieldIPInvalid, raw)
	}
	return addr.String(), nil
}

// NormalizeURL canonicalises a URL, requiring an absolute form.
func NormalizeURL(raw string) (string, error) {
	s := strings.TrimSpace(raw)
	u, err := url.Parse(s)
	if err != nil || u.Scheme == "" || u.Host == "" {
		return "", i18n.M(i18n.KeyFieldURLInvalid, raw)
	}
	return u.String(), nil
}

// Normalize applies the format-specific canonical form for one field type.
func Normalize(t model.FieldType, raw string) (string, error) {
	switch t {
	case model.FieldMAC:
		return NormalizeMAC(raw)
	case model.FieldIP:
		return NormalizeIP(raw)
	case model.FieldURL:
		return NormalizeURL(raw)
	default:
		return raw, nil
	}
}
