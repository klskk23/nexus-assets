// Package schema resolves what a category asks an asset to record.
package schema

import (
	"fmt"
	"sort"
	"strings"

	"github.com/klskk23/nexus-assets/internal/model"
)

// PathSeparator delimits ids inside categories.path.
const PathSeparator = "/"

// BuildPath returns the materialised path of a child under a parent.
// The root form is "/<id>/".
func BuildPath(parentPath, id string) string {
	if parentPath == "" {
		return PathSeparator + id + PathSeparator
	}
	return parentPath + id + PathSeparator
}

// AncestorIDs returns the ids along a materialised path, root first, including
// the category itself.
func AncestorIDs(path string) []string {
	parts := strings.Split(strings.Trim(path, PathSeparator), PathSeparator)
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

// IsDescendantOf reports whether path lies inside ancestorPath (or equals it).
func IsDescendantOf(path, ancestorPath string) bool {
	return strings.HasPrefix(path, ancestorPath)
}

// Binding is one category_fields row joined to its definition.
type Binding struct {
	CategoryID string
	Field      model.FieldDefinition
	Required   bool
	Sort       int
}

// Resolve computes the effective field set of a category.
//
// The set is the union of every binding along the ancestor chain, root first.
// Because a child may only append -- never override -- the union is already the
// final answer and needs no merge rules. A duplicate key means a binding slipped
// past the check in Bind, so it is reported rather than silently resolved.
func Resolve(path string, bindingsByCategory map[string][]Binding) ([]model.BoundField, error) {
	ids := AncestorIDs(path)
	if len(ids) == 0 {
		return nil, fmt.Errorf("category path %q is empty", path)
	}
	self := ids[len(ids)-1]

	seen := make(map[string]string, 16) // field key -> category that bound it
	out := make([]model.BoundField, 0, 16)

	for _, id := range ids {
		bindings := append([]Binding(nil), bindingsByCategory[id]...)
		sort.SliceStable(bindings, func(i, j int) bool { return bindings[i].Sort < bindings[j].Sort })

		for _, b := range bindings {
			if owner, dup := seen[b.Field.Key]; dup {
				return nil, fmt.Errorf(
					"field key %q is bound twice on the same chain (categories %s and %s)",
					b.Field.Key, owner, id)
			}
			seen[b.Field.Key] = id

			bf := model.BoundField{
				FieldDefinition: b.Field,
				Required:        b.Required,
				Sort:            b.Sort,
			}
			if id != self {
				bf.InheritedFrom = id
			}
			out = append(out, bf)
		}
	}
	return out, nil
}

// ActiveFields drops archived definitions. Archived fields keep their stored
// values but take no part in validation or search.
func ActiveFields(fields []model.BoundField) []model.BoundField {
	out := make([]model.BoundField, 0, len(fields))
	for _, f := range fields {
		if f.ArchivedAt == nil {
			out = append(out, f)
		}
	}
	return out
}
