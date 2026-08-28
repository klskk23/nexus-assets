package compute

import "testing"

func TestHex2DecOnMAC(t *testing.T) {
	// The default SN rule, spelled out in the design baseline.
	cases := map[string]string{
		"001A2B3C4D5E":      "112394521950",
		"00:1A:2B:3C:4D:5E": "112394521950",
		"00-1a-2b-3c-4d-5e": "112394521950",
		"0000.0000.0001":    "1",
	}
	for in, want := range cases {
		got, err := hex2dec(in)
		if err != nil {
			t.Fatalf("hex2dec(%q): %v", in, err)
		}
		if got != want {
			t.Errorf("hex2dec(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestHex2DecRejectsGarbage(t *testing.T) {
	for _, in := range []string{"", "zz", "00:1A:2B:3C:4D:5G"} {
		if _, err := hex2dec(in); err == nil {
			t.Errorf("hex2dec(%q) should fail", in)
		}
	}
}

func TestDec2Hex(t *testing.T) {
	got, err := dec2hex("112394521950")
	if err != nil {
		t.Fatal(err)
	}
	if got != "1A2B3C4D5E" {
		t.Errorf("dec2hex = %q, want 1A2B3C4D5E", got)
	}
}

func TestPadDoesNotTruncate(t *testing.T) {
	if got := pad(6, "42"); got != "000042" {
		t.Errorf("pad = %q", got)
	}
	// Never silently shorten an identifier.
	if got := pad(3, "1234567"); got != "1234567" {
		t.Errorf("pad must leave over-long values intact, got %q", got)
	}
}

func TestSliceRangeChecked(t *testing.T) {
	if got, err := slice(0, 4, "ABCDEF"); err != nil || got != "ABCD" {
		t.Errorf("slice = %q, %v", got, err)
	}
	if _, err := slice(0, 99, "ABC"); err == nil {
		t.Error("out-of-range slice must fail rather than clamp")
	}
}

func TestDefaultAndTrunc(t *testing.T) {
	if got := defaultVal("UNKNOWN", ""); got != "UNKNOWN" {
		t.Errorf("default = %q", got)
	}
	if got := defaultVal("UNKNOWN", "x"); got != "x" {
		t.Errorf("default = %q", got)
	}
	if got := trunc(3, "ABCDEF"); got != "ABC" {
		t.Errorf("trunc = %q", got)
	}
}

func TestEvalDefaultSNRule(t *testing.T) {
	ctx := NewContext("asset-1", map[string]any{"mac": "001A2B3C4D5E"}, "RT", "SDWAN 路由器", "", "")
	got, err := Eval("sn", "{{ .attrs.mac | hex2dec }}", ctx)
	if err != nil {
		t.Fatalf("Eval: %v", err)
	}
	if got != "112394521950" {
		t.Errorf("Eval = %q", got)
	}
}

func TestEvalFailsOnMissingValue(t *testing.T) {
	ctx := NewContext("asset-1", map[string]any{}, "RT", "", "", "")
	if _, err := Eval("sn", "{{ .attrs.mac | hex2dec }}", ctx); err == nil {
		t.Fatal("a missing referenced field must fail rather than produce a blank SN")
	}
}
