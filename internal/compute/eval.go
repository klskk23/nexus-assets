package compute

import (
	"fmt"
	"strings"

	"github.com/expr-lang/expr"

	"github.com/klskk23/nexus-assets/internal/i18n"
)

// Context is what an expression can read.
//
// A plain map rather than a struct, because `attrs` holds whatever fields the
// categories happen to define -- there is no type to declare. Nothing here
// changes over an asset's life: time and transfer state are deliberately
// absent, because an identifier that drifts is not an identifier.
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

// emptyEnv is the shape used at compile time, before any asset exists.
func emptyEnv() Context {
	return NewContext("", nil, "", "", "", "")
}

// Run evaluates a compiled expression.
func (p *Program) Run(ctx Context) (string, error) {
	out, err := expr.Run(p.prog, map[string]any(ctx))
	if err != nil {
		return "", i18n.M(i18n.KeyNamedProblem, p.Name, err)
	}
	return render(p.Name, out)
}

// Eval compiles and evaluates in one step.
func Eval(name, src string, ctx Context) (string, error) {
	p, err := Parse(name, src)
	if err != nil {
		return "", err
	}
	return p.Run(ctx)
}

// render turns a result into the string an identifier is made of, and refuses
// the ones that would be a defect written into a unique index.
//
// A missing field is a legal nil in this language, and concatenation happily
// folds it into "RT-<nil>". The old engine caught the same class of mistake by
// looking for "<no value>"; this looks for the shapes nil takes here. Nothing
// else in the system would notice: the value is a string, it is unique, and it
// goes straight into the column the asset is identified by.
func render(name string, v any) (string, error) {
	if v == nil {
		return "", i18n.M(i18n.KeyExprNoValue, name)
	}
	out := strings.TrimSpace(fmt.Sprintf("%v", v))
	if out == "" {
		return "", i18n.M(i18n.KeyExprEmptyResult, name)
	}
	if strings.Contains(out, "<nil>") {
		return "", i18n.M(i18n.KeyExprNoValue, name)
	}
	return out, nil
}
