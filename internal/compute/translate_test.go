package compute

import (
	"strings"
	"testing"
)

// Every rule shape the codebase and its seed data actually used, plus the two
// that need the argument order inverted -- which is why this is done from the
// syntax tree and not with a regular expression.
func TestTranslateCoversTheStoredShapes(t *testing.T) {
	for _, tc := range []struct{ old, want string }{
		{`{{ .attrs.mac }}`, `attrs.mac`},
		{`{{ .id }}`, `id`},
		{`{{ .category.code }}`, `category.code`},
		{`{{ .attrs.mac | hex2dec }}`, `hex2dec(attrs.mac)`},
		{`{{ .attrs.firmware | upper }}`, `upper(attrs.firmware)`},
		// text/template appended the piped value; expr prepends it.
		{`{{ .attrs.mac | hex2dec | pad 16 }}`, `pad(hex2dec(attrs.mac), 16)`},
		{`{{ .attrs.mac | trunc 6 }}`, `trunc(attrs.mac, 6)`},
		{`{{ .attrs.mac | replace "00" "FF" }}`, `replace(attrs.mac, "00", "FF")`},
		// Several pieces: what each produced was concatenated, so each has to
		// become a string in its own right.
		{`{{ .category.code }}-{{ .attrs.seq }}`, `str(category.code) + "-" + str(attrs.seq)`},
		{`SN{{ .attrs.mac | hex2dec }}`, `"SN" + str(hex2dec(attrs.mac))`},
	} {
		got, err := Translate(tc.old)
		if err != nil {
			t.Errorf("%s: %v", tc.old, err)
			continue
		}
		if got != tc.want {
			t.Errorf("%s\n  got  %s\n  want %s", tc.old, got, tc.want)
			continue
		}
		// A translation that does not compile under the new guards would be
		// worse than none: the migration would replace a working rule with a
		// broken one.
		if _, err := Parse("k", got); err != nil {
			t.Errorf("%s translated to something that will not compile: %v", tc.old, err)
		}
	}
}

// Better to stop and say so than to write a rule that quietly means something
// else.
func TestTranslateRefusesWhatItCannotCarryOver(t *testing.T) {
	for _, tc := range []struct{ old, because string }{
		{`{{ printf "%s-%s" .attrs.a .attrs.b }}`, "printf"},
		{`{{ . }}`, "bare dot"},
	} {
		if _, err := Translate(tc.old); err == nil {
			t.Errorf("%s should have been refused", tc.old)
		} else if !strings.Contains(err.Error(), tc.because) {
			t.Errorf("%s: got %v", tc.old, err)
		}
	}
}

func TestTranslateQuotesARuleWithNoActions(t *testing.T) {
	got, err := Translate("FIXED-01")
	if err != nil || got != `"FIXED-01"` {
		t.Errorf("got %q %v", got, err)
	}
}
