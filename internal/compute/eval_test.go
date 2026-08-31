package compute

import (
	"strings"
	"testing"

	"github.com/klskk23/nexus-assets/internal/i18n"
)

func ctx(attrs map[string]any) Context {
	return NewContext("abcd1234", attrs, "RT", "SDWAN 路由器", "X100", "Acme")
}

func TestEvalCoversTheRulesPeopleActuallyWrite(t *testing.T) {
	attrs := map[string]any{"mac": "001A2B3C4D5E", "seq": 7, "kind": "spare", "rack": " r-01 "}
	for _, tc := range []struct{ src, want string }{
		{`attrs.mac`, "001A2B3C4D5E"},
		{`hex2dec(attrs.mac)`, "112394521950"},
		// The pipe passes its subject first, so this reads the same way it
		// would written out in full.
		{`attrs.mac | hex2dec()`, "112394521950"},
		{`attrs.mac | hex2dec() | pad(16)`, "0000112394521950"},
		{`pad(hex2dec(attrs.mac), 16)`, "0000112394521950"},
		{`upper(trim(attrs.rack))`, "R-01"},
		{`category.code + "-" + string(attrs.seq)`, "RT-7"},
		{`id`, "abcd1234"},
		{`trunc(attrs.mac, 6)`, "001A2B"},
		{`slice(attrs.mac, 6, 12)`, "3C4D5E"},
		{`dec2hex("112394521950")`, "1A2B3C4D5E"},
		{`replace(attrs.mac, "00", "FF")`, "FF1A2B3C4D5E"},
		{`default(attrs.missing, "none")`, "none"},

		// The whole reason for the new engine: rules the old syntax could not
		// express at all.
		{`attrs.kind == "spare" ? "S" : "M"`, "S"},
		{`attrs.sn ?? hex2dec(attrs.mac)`, "112394521950"},
		{`(attrs.kind == "spare" ? "S" : "M") + "-" + trunc(attrs.mac, 4)`, "S-001A"},
		{`len(attrs.mac) == 12 ? "ok" : "bad"`, "ok"},
		{`hasPrefix(attrs.mac, "001A") ? "acme" : "other"`, "acme"},
		{`string(attrs.seq * 100)`, "700"},
	} {
		got, err := Eval("sn", tc.src, ctx(attrs))
		if err != nil {
			t.Errorf("%s: %v", tc.src, err)
			continue
		}
		if got != tc.want {
			t.Errorf("%s = %q, want %q", tc.src, got, tc.want)
		}
	}
}

// A missing field is a legal nil in this language, and concatenation folds it
// into the string without complaint. The result would be a serial number
// reading "RT-<nil>", written into the column assets are identified by and
// indexed as unique. Nothing downstream would notice.
func TestNilNeverReachesAnIdentifier(t *testing.T) {
	attrs := map[string]any{"mac": "001A2B3C4D5E"}
	for _, src := range []string{
		`attrs.missing`,
		`category.code + "-" + string(attrs.missing)`,
		`attrs.missing ?? attrs.alsoMissing`,
	} {
		out, err := Eval("sn", src, ctx(attrs))
		if err == nil {
			t.Errorf("%s produced %q instead of refusing", src, out)
			continue
		}
		if !i18n.HasKey(err, i18n.KeyExprNoValue) {
			t.Errorf("%s: message should say a field has no value, got %v", src, err)
		}
	}
}

func TestEmptyResultIsRefused(t *testing.T) {
	if _, err := Eval("sn", `trim("   ")`, ctx(nil)); err == nil {
		t.Fatal("an empty identifier must be refused")
	}
}

// A function's own complaint has to survive to the operator: it names the
// value that was wrong, which the generic wrapper cannot.
func TestFunctionErrorsKeepTheirDetail(t *testing.T) {
	_, err := Eval("sn", `hex2dec(attrs.mac)`, ctx(map[string]any{"mac": "ZZZZ"}))
	if err == nil {
		t.Fatal("a bad value must be refused")
	}
	if !strings.Contains(err.Error(), "ZZZZ") {
		t.Errorf("message should name the offending value, got %v", err)
	}
}

// Compiling once and running many times is what recompute does across a whole
// subtree; the program has to be reusable.
func TestCompiledProgramRunsRepeatedly(t *testing.T) {
	p, err := Parse("sn", `hex2dec(attrs.mac)`)
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct{ mac, want string }{
		{"001A2B3C4D5E", "112394521950"},
		{"001A2B3C4D5F", "112394521951"},
	} {
		got, err := p.Run(ctx(map[string]any{"mac": tc.mac}))
		if err != nil || got != tc.want {
			t.Errorf("%s -> %q %v", tc.mac, got, err)
		}
	}
}

// pad never shortens: an identifier that lost characters would collide with
// one that kept them.
func TestPadDoesNotTruncate(t *testing.T) {
	got, err := Eval("sn", `pad(attrs.mac, 4)`, ctx(map[string]any{"mac": "001A2B3C4D5E"}))
	if err != nil || got != "001A2B3C4D5E" {
		t.Errorf("got %q %v", got, err)
	}
}
