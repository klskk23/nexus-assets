package schema

import (
	"fmt"
	"slices"
	"sort"

	"github.com/klskk23/nexus-assets/internal/model"
)

// DependencyClosure returns every field key the given expression field reads,
// transitively, sorted for a stable error message.
//
// The walk is transitive because an expression key may read another expression
// key: binding "label" is only safe if "sn" is available, and "sn" is only
// usable if "mac" is. Checking one level would let a category reach a state
// where a bound field can never be evaluated.
//
// A cycle in the library is reported rather than looped on. The evaluator has
// its own cycle check, but that one only runs when someone tries to save an
// asset, which is exactly the late failure this package exists to prevent.
func DependencyClosure(start string, byKey map[string]model.FieldDefinition) ([]string, error) {
	seen := map[string]bool{start: true}
	var out []string

	var walk func(key string, stack []string) error
	walk = func(key string, stack []string) error {
		f, ok := byKey[key]
		if !ok || f.Type != model.FieldComputed {
			return nil
		}
		refs, err := templateRefs(key, f.Options.Template)
		if err != nil {
			return fmt.Errorf("信息项「%s」的表达式无法解析：%w", f.Label, err)
		}
		for _, ref := range refs {
			if slices.Contains(stack, ref) {
				return fmt.Errorf("表达式键 %s 存在循环依赖：%s", start, joinArrow(append(stack, ref)))
			}
			if seen[ref] {
				continue
			}
			seen[ref] = true
			out = append(out, ref)
			if err := walk(ref, append(stack, ref)); err != nil {
				return err
			}
		}
		return nil
	}
	if err := walk(start, []string{start}); err != nil {
		return nil, err
	}
	sort.Strings(out)
	return out, nil
}

func joinArrow(keys []string) string {
	s := ""
	for i, k := range keys {
		if i > 0 {
			s += " → "
		}
		s += k
	}
	return s
}
