package compute

import (
	"sort"
	"strings"
	"text/template/parse"
)

// AttrPrefix is the context member that carries custom field values.
const AttrPrefix = "attrs"

// References lists every context path a template reads, such as
// "attrs.mac" or "category.code".
//
// The paths come from the syntax tree rather than a regular expression. A regex
// gets confused by nested calls, pipelines and string literals, and the
// reference set decides both cycle detection and the "a referenced field cannot
// be disabled" guard -- getting it wrong means those checks silently miss cases.
func References(root parse.Node) []string {
	seen := map[string]struct{}{}
	walk(root, func(n parse.Node) {
		switch t := n.(type) {
		case *parse.FieldNode:
			if len(t.Ident) > 0 {
				seen[strings.Join(t.Ident, ".")] = struct{}{}
			}
		case *parse.ChainNode:
			if f, ok := t.Node.(*parse.FieldNode); ok {
				all := append(append([]string{}, f.Ident...), t.Field...)
				seen[strings.Join(all, ".")] = struct{}{}
			}
		}
	})
	out := make([]string, 0, len(seen))
	for k := range seen {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

// AttrReferences narrows References to the custom field keys a template reads.
// These are the edges of the dependency graph between computed fields.
func AttrReferences(root parse.Node) []string {
	var out []string
	for _, ref := range References(root) {
		if key, ok := strings.CutPrefix(ref, AttrPrefix+"."); ok && key != "" {
			// Only the first segment names a field.
			out = append(out, strings.SplitN(key, ".", 2)[0])
		}
	}
	sort.Strings(out)
	return dedupe(out)
}

func dedupe(in []string) []string {
	if len(in) == 0 {
		return nil
	}
	out := in[:1]
	for _, v := range in[1:] {
		if v != out[len(out)-1] {
			out = append(out, v)
		}
	}
	return out
}
