package compute

import (
	"strings"
	"testing"
)

func TestParseRejectsControlFlow(t *testing.T) {
	cases := map[string]string{
		"if":      `{{ if .attrs.mac }}A{{ end }}`,
		"range":   `{{ range .attrs.list }}x{{ end }}`,
		"with":    `{{ with .attrs.mac }}{{ . }}{{ end }}`,
		"if/else": `{{ if .attrs.mac }}A{{ else }}B{{ end }}`,
	}
	for name, text := range cases {
		t.Run(name, func(t *testing.T) {
			_, err := Parse("t", text)
			if err == nil {
				t.Fatal("control flow must be refused at parse time")
			}
			if !strings.Contains(err.Error(), "identifier rules") {
				t.Errorf("error should explain why, got: %v", err)
			}
		})
	}
}

func TestParseRejectsUnknownFunction(t *testing.T) {
	// text/template catches this itself; the test pins the behaviour.
	if _, err := Parse("t", `{{ .attrs.mac | md5 }}`); err == nil {
		t.Fatal("a function outside the whitelist must be refused")
	}
}

func TestParseAcceptsPipelinesAndPrintf(t *testing.T) {
	for _, text := range []string{
		`{{ .attrs.mac | hex2dec }}`,
		`{{ .attrs.mac | hex2dec | pad 16 }}`,
		`{{ printf "%s-%s" .category.code (.attrs.mac | hex2dec) }}`,
	} {
		if _, err := Parse("t", text); err != nil {
			t.Errorf("Parse(%q): %v", text, err)
		}
	}
}
