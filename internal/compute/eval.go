package compute

import (
	"bytes"
	"fmt"
	"strings"
)

// Context is what a template can read.
//
// It is a plain map rather than a struct so templates use the lowercase paths
// the design documents describe: {{ .attrs.mac }}, {{ .category.code }}.
// Nothing here changes over an asset's life -- time and transfer state are
// deliberately absent, because an identifier that drifts is not an identifier.
type Context map[string]any

// NewContext assembles the evaluation context for one asset.
func NewContext(id string, attrs map[string]any, categoryCode, categoryName, modelName, modelVendor string) Context {
	if attrs == nil {
		attrs = map[string]any{}
	}
	return Context{
		"id":    id,
		"attrs": attrs,
		"category": map[string]any{
			"code": categoryCode,
			"name": categoryName,
		},
		"model": map[string]any{
			"name":   modelName,
			"vendor": modelVendor,
		},
	}
}

// Eval renders one template against a context.
func Eval(name, text string, ctx Context) (string, error) {
	tmpl, err := Parse(name, text)
	if err != nil {
		return "", err
	}
	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, map[string]any(ctx)); err != nil {
		return "", fmt.Errorf("evaluate %s: %w", name, unwrapExecError(err))
	}
	out := strings.TrimSpace(buf.String())
	if out == "" {
		return "", fmt.Errorf("evaluate %s: produced an empty value", name)
	}
	if strings.Contains(out, "<no value>") {
		return "", fmt.Errorf("evaluate %s: a referenced field has no value", name)
	}
	return out, nil
}

// unwrapExecError strips template's wrapper so the message names the real cause.
func unwrapExecError(err error) error {
	msg := err.Error()
	if i := strings.LastIndex(msg, ": "); i >= 0 && strings.Contains(msg, "executing") {
		return fmt.Errorf("%s", strings.TrimSpace(msg[i+2:]))
	}
	return err
}
