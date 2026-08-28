// Package compute evaluates the templates behind computed fields and serial
// numbers.
package compute

import (
	"fmt"
	"math/big"
	"strings"
	"text/template"
)

// FuncMap is the whitelist available to templates.
//
// It is deliberately small. Anything that introduces branching or iteration is
// left out: a branch inside an identifier-generation rule is the first sign of
// complexity getting away from us, and parse.go rejects if/range outright.
func FuncMap() template.FuncMap {
	return template.FuncMap{
		"hex2dec": hex2dec,
		"dec2hex": dec2hex,
		"pad":     pad,
		"trunc":   trunc,
		"slice":   slice,
		"upper":   strings.ToUpper,
		"lower":   strings.ToLower,
		"trim":    strings.TrimSpace,
		"replace": replace,
		"default": defaultVal,
		"printf":  fmt.Sprintf,
	}
}

// hex2dec converts a hexadecimal string to its decimal representation.
// Separators commonly found in MAC addresses are ignored, so it works whether
// or not the value has already been normalised.
func hex2dec(v any) (string, error) {
	s := clean(toString(v))
	if s == "" {
		return "", fmt.Errorf("hex2dec: empty value")
	}
	n, ok := new(big.Int).SetString(s, 16)
	if !ok {
		return "", fmt.Errorf("hex2dec: %q is not hexadecimal", toString(v))
	}
	return n.String(), nil
}

// dec2hex converts a decimal string to uppercase hexadecimal.
func dec2hex(v any) (string, error) {
	s := strings.TrimSpace(toString(v))
	n, ok := new(big.Int).SetString(s, 10)
	if !ok {
		return "", fmt.Errorf("dec2hex: %q is not a decimal number", s)
	}
	return strings.ToUpper(n.Text(16)), nil
}

// pad left-pads with zeroes to width n. Values longer than n are returned
// unchanged rather than truncated, so an identifier is never silently shortened.
func pad(n int, v any) string {
	s := toString(v)
	if len(s) >= n {
		return s
	}
	return strings.Repeat("0", n-len(s)) + s
}

// trunc keeps the first n characters.
func trunc(n int, v any) string {
	r := []rune(toString(v))
	if n < 0 || n >= len(r) {
		return string(r)
	}
	return string(r[:n])
}

// slice returns the half-open range [a, b) of characters.
func slice(a, b int, v any) (string, error) {
	r := []rune(toString(v))
	if a < 0 || b > len(r) || a > b {
		return "", fmt.Errorf("slice: range [%d,%d) is outside a value of length %d", a, b, len(r))
	}
	return string(r[a:b]), nil
}

func replace(old, replacement string, v any) string {
	return strings.ReplaceAll(toString(v), old, replacement)
}

// defaultVal substitutes a fallback when the value is empty.
func defaultVal(fallback string, v any) string {
	if s := toString(v); s != "" {
		return s
	}
	return fallback
}

func toString(v any) string {
	switch t := v.(type) {
	case nil:
		return ""
	case string:
		return t
	case fmt.Stringer:
		return t.String()
	default:
		return fmt.Sprintf("%v", t)
	}
}

// clean strips the separators used in MAC addresses.
func clean(s string) string {
	return strings.NewReplacer(":", "", "-", "", ".", "", " ", "").Replace(strings.TrimSpace(s))
}
