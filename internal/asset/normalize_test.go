package asset

import (
	"testing"

	"github.com/klskk23/nexus-assets/internal/model"
)

func TestNormalizeMACCanonicalises(t *testing.T) {
	// The three spellings of one network card.
	same := []string{"00:1A:2B:3C:4D:5E", "00-1a-2b-3c-4d-5e", "001a2b3c4d5e", " 001A.2B3C.4D5E "}
	want := "001A2B3C4D5E"
	for _, in := range same {
		got, err := NormalizeMAC(in)
		if err != nil {
			t.Fatalf("NormalizeMAC(%q): %v", in, err)
		}
		if got != want {
			t.Errorf("NormalizeMAC(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestNormalizeMACRejects(t *testing.T) {
	for _, in := range []string{"", "00:1A:2B:3C:4D", "00:1A:2B:3C:4D:5G", "001A2B3C4D5E7F"} {
		if _, err := NormalizeMAC(in); err == nil {
			t.Errorf("NormalizeMAC(%q) should fail", in)
		}
	}
}

func TestNormalizeIPAndURL(t *testing.T) {
	if got, err := NormalizeIP(" 192.168.001.1 "); err == nil && got != "192.168.1.1" {
		t.Errorf("NormalizeIP = %q, %v", got, err)
	}
	if _, err := NormalizeIP("not-an-ip"); err == nil {
		t.Error("bad IP must fail")
	}
	if _, err := NormalizeURL("https://example.com/x"); err != nil {
		t.Errorf("valid URL rejected: %v", err)
	}
	if _, err := NormalizeURL("example.com"); err == nil {
		t.Error("a relative URL must fail")
	}
}

func TestSplitAttrsKeepsOrphanKeys(t *testing.T) {
	fields := []model.BoundField{
		{FieldDefinition: model.FieldDefinition{Key: "mac"}},
		{FieldDefinition: model.FieldDefinition{Key: "firmware"}},
	}
	stored := map[string]any{"mac": "001A2B3C4D5E", "firmware": "2.1.3", "legacy_note": "旧备注"}

	live, archived := SplitAttrs(fields, stored)
	if len(live) != 2 {
		t.Errorf("live = %v, want mac and firmware", live)
	}
	// Nothing is destroyed when a field leaves the effective set; the value is
	// simply shown read-only, so putting the field back restores it.
	if archived["legacy_note"] != "旧备注" {
		t.Errorf("orphan key must be preserved, got %v", archived)
	}
}
