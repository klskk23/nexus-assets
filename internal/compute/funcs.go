// Package compute evaluates the expressions behind computed fields and serial
// numbers.
package compute

import (
	"fmt"
	"math/big"
	"strings"

	"github.com/expr-lang/expr"

	"github.com/klskk23/nexus-assets/internal/i18n"
)

// Functions is the whitelist available to expressions.
//
// Deliberately small, and every one of them takes its subject first: expr's
// pipe passes the left-hand value as the *first* argument, where text/template
// passed it as the last. `attrs.mac | pad(16)` therefore means `pad(attrs.mac,
// 16)`, which is also the order that reads correctly when written out in full.
func Functions() []expr.Option {
	return []expr.Option{
		fn("hex2dec", func(p ...any) (any, error) { return hex2dec(p[0]) }),
		fn("dec2hex", func(p ...any) (any, error) { return dec2hex(p[0]) }),
		fn("pad", func(p ...any) (any, error) { return pad(p[0], toInt(p[1])), nil }),
		fn("trunc", func(p ...any) (any, error) { return trunc(p[0], toInt(p[1])), nil }),
		fn("slice", func(p ...any) (any, error) { return slice(p[0], toInt(p[1]), toInt(p[2])) }),
		fn("upper", func(p ...any) (any, error) { return strings.ToUpper(toString(p[0])), nil }),
		fn("lower", func(p ...any) (any, error) { return strings.ToLower(toString(p[0])), nil }),
		fn("trim", func(p ...any) (any, error) { return strings.TrimSpace(toString(p[0])), nil }),
		fn("replace", func(p ...any) (any, error) {
			return strings.ReplaceAll(toString(p[0]), toString(p[1]), toString(p[2])), nil
		}),
		fn("default", func(p ...any) (any, error) { return defaultVal(p[0], toString(p[1])), nil }),
		fn("str", func(p ...any) (any, error) { return toString(p[0]), nil }),
	}
}

// FunctionNames lists the whitelist, sorted. The UI shows it, and the AST
// guard uses it to tell a typo from a call at something outside the list.
func FunctionNames() []string {
	return []string{
		"dec2hex", "default", "hex2dec", "lower", "pad", "replace",
		"slice", "str", "trim", "trunc", "upper",
	}
}

func fn(name string, f func(...any) (any, error)) expr.Option {
	return expr.Function(name, f)
}

// hex2dec converts a hexadecimal string to its decimal representation.
// Separators commonly found in MAC addresses are ignored, so it works whether
// or not the value has already been normalised.
func hex2dec(v any) (string, error) {
	s := clean(toString(v))
	if s == "" {
		return "", i18n.M(i18n.KeyFnHexEmpty)
	}
	n, ok := new(big.Int).SetString(s, 16)
	if !ok {
		return "", i18n.M(i18n.KeyFnNotHex, toString(v))
	}
	return n.String(), nil
}

// dec2hex converts a decimal string to uppercase hexadecimal.
func dec2hex(v any) (string, error) {
	s := strings.TrimSpace(toString(v))
	n, ok := new(big.Int).SetString(s, 10)
	if !ok {
		return "", i18n.M(i18n.KeyFnNotDecimal, s)
	}
	return strings.ToUpper(n.Text(16)), nil
}

// pad left-pads with zeroes to width n. Values longer than n are returned
// unchanged rather than truncated, so an identifier is never silently shortened.
func pad(v any, n int) string {
	s := toString(v)
	if len(s) >= n {
		return s
	}
	return strings.Repeat("0", n-len(s)) + s
}

// trunc keeps the first n characters.
func trunc(v any, n int) string {
	r := []rune(toString(v))
	if n < 0 || n >= len(r) {
		return string(r)
	}
	return string(r[:n])
}

// slice returns the half-open range [a, b) of characters.
func slice(v any, a, b int) (string, error) {
	r := []rune(toString(v))
	if a < 0 || b > len(r) || a > b {
		return "", i18n.M(i18n.KeyFnSliceRange, a, b, len(r))
	}
	return string(r[a:b]), nil
}

// defaultVal substitutes a fallback when the value is empty.
func defaultVal(v any, fallback string) string {
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

func toInt(v any) int {
	switch t := v.(type) {
	case int:
		return t
	case int64:
		return int(t)
	case float64:
		return int(t)
	default:
		return 0
	}
}

// clean strips the separators used in MAC addresses.
func clean(s string) string {
	return strings.NewReplacer(":", "", "-", "", ".", "", " ", "").Replace(strings.TrimSpace(s))
}
