package i18n

import (
	"go/ast"
	"go/parser"
	"go/token"
	"strconv"
	"testing"
)

// Every key constant must have an entry in both catalogues.
//
// TestCatalogsCoverTheSameKeys compares the two catalogues against each other,
// which cannot see a key that is in neither. Six of them were: three shipped
// with the session and API-key work and rendered on screen as "err.session_expired".
// A missing entry is not a compile error and not a runtime error -- it is a
// message that quietly turns into its own key in front of a user, which is why
// the guard has to read the declarations rather than the maps.
func TestEveryDeclaredKeyIsInBothCatalogues(t *testing.T) {
	fset := token.NewFileSet()
	file, err := parser.ParseFile(fset, "keys.go", nil, 0)
	if err != nil {
		t.Fatalf("parse keys.go: %v", err)
	}

	declared := map[string]string{} // constant name -> key
	ast.Inspect(file, func(n ast.Node) bool {
		spec, ok := n.(*ast.ValueSpec)
		if !ok {
			return true
		}
		for i, name := range spec.Names {
			if i >= len(spec.Values) {
				continue
			}
			lit, ok := spec.Values[i].(*ast.BasicLit)
			if !ok || lit.Kind != token.STRING {
				continue
			}
			value, err := strconv.Unquote(lit.Value)
			if err != nil {
				continue
			}
			declared[name.Name] = value
		}
		return true
	})
	if len(declared) < 100 {
		t.Fatalf("only %d keys found; the parser is looking at the wrong thing", len(declared))
	}

	for _, lang := range []Lang{ZH, EN} {
		present := map[string]struct{}{}
		for _, key := range Keys(lang) {
			present[key] = struct{}{}
		}
		for name, key := range declared {
			if _, ok := present[key]; !ok {
				t.Errorf("%s (%q) has no %v entry", name, key, lang)
			}
		}
	}
}
