package asset

import (
	"strings"
	"testing"

	"github.com/klskk23/nexus-assets/internal/i18n"
	"github.com/klskk23/nexus-assets/internal/model"
)

func bf(key string, t model.FieldType, opts model.FieldOptions, required bool) model.BoundField {
	return model.BoundField{
		FieldDefinition: model.FieldDefinition{Key: key, Label: key, Type: t, Options: opts},
		Required:        required,
	}
}

func f64p(v float64) *float64 { return &v }

func TestValidateAttrsPerType(t *testing.T) {
	fields := []model.BoundField{
		bf("mac", model.FieldMAC, model.FieldOptions{}, true),
		bf("ip", model.FieldIP, model.FieldOptions{}, false),
		bf("doc", model.FieldURL, model.FieldOptions{}, false),
		bf("tag", model.FieldText, model.FieldOptions{Regex: `^[A-Z]{2}-\d{4}$`, RegexHint: "两位大写字母加四位数字"}, false),
		bf("ports", model.FieldNumber, model.FieldOptions{Min: f64p(1), Max: f64p(48)}, false),
		bf("managed", model.FieldBoolean, model.FieldOptions{}, false),
		bf("bought", model.FieldDate, model.FieldOptions{}, false),
	}

	t.Run("all valid", func(t *testing.T) {
		out, errs := ValidateAttrs(fields, map[string]any{
			"mac": "00:1a:2b:3c:4d:5e", "ip": "192.168.1.1", "doc": "https://example.com/a",
			"tag": "AB-1234", "ports": "24", "managed": "true", "bought": "2026-08-28",
		})
		if errs.Any() {
			t.Fatalf("unexpected errors: %v", errs)
		}
		if out["mac"] != "001A2B3C4D5E" {
			t.Errorf("MAC should come back normalised, got %v", out["mac"])
		}
		if out["ports"] != float64(24) {
			t.Errorf("number should be typed, got %T", out["ports"])
		}
		if out["managed"] != true {
			t.Errorf("boolean should be typed, got %T", out["managed"])
		}
	})

	cases := []struct {
		name, key string
		in        map[string]any
		want      string
	}{
		{"missing required", "mac", map[string]any{}, "必填"},
		{"bad mac", "mac", map[string]any{"mac": "zz"}, "MAC"},
		{"bad ip", "ip", map[string]any{"mac": "001A2B3C4D5E", "ip": "999.1.1.1"}, "IP"},
		{"relative url", "doc", map[string]any{"mac": "001A2B3C4D5E", "doc": "example.com"}, "网址"},
		{"regex miss shows the hint", "tag", map[string]any{"mac": "001A2B3C4D5E", "tag": "nope"}, "两位大写字母"},
		{"number out of range", "ports", map[string]any{"mac": "001A2B3C4D5E", "ports": "99"}, "不能大于"},
		{"not a number", "ports", map[string]any{"mac": "001A2B3C4D5E", "ports": "many"}, "数字"},
		{"bad boolean", "managed", map[string]any{"mac": "001A2B3C4D5E", "managed": "maybe"}, "是或否"},
		{"bad date", "bought", map[string]any{"mac": "001A2B3C4D5E", "bought": "28/08/2026"}, "YYYY-MM-DD"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, errs := ValidateAttrs(fields, tc.in)
			msg := errs[tc.key].Error()
			if msg == "" {
				t.Fatalf("expected an error on %q, got %v", tc.key, errs)
			}
			if !strings.Contains(msg, tc.want) {
				t.Errorf("message %q should mention %q", msg, tc.want)
			}
		})
	}
}

func TestFieldErrorsSummarises(t *testing.T) {
	e := FieldErrors{"mac": i18n.M(i18n.KeyFieldMACInvalid, "zz")}
	if !strings.Contains(e.Error(), "mac") {
		t.Errorf("summary should name the fields, got %q", e.Error())
	}
	if !e.Any() {
		t.Error("Any should report true when something was recorded")
	}
	if (FieldErrors{}).Any() {
		t.Error("an empty set is not an error")
	}

	// The same set renders in whichever language the reader asked for; the
	// keys stay put, because the form matches messages to inputs by key.
	if got := e.In(i18n.EN)["mac"]; got != "Not a valid MAC address: zz" {
		t.Errorf("en = %q", got)
	}
	if got := e.In(i18n.ZH)["mac"]; got != "MAC 格式非法：zz" {
		t.Errorf("zh = %q", got)
	}
}

func TestNormalizePassesThroughPlainTypes(t *testing.T) {
	got, err := Normalize(model.FieldText, "  keep as is  ")
	if err != nil || got != "  keep as is  " {
		t.Errorf("plain types must not be rewritten, got %q %v", got, err)
	}
}
