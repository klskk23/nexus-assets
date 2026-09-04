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
				Required:        b.Field.Required,
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

// ActiveFields returns the fields currently in effect for a category.
//
// Since information items lost their archived state it has nothing to filter,
// and every caller could drop it. It is kept anyway: each call site is
// expressing "the fields in effect right now", and that is the one place a
// future notion of an inactive field would attach. Removing it would scatter
// that meaning across a dozen call sites and make it a rewrite to reintroduce.
func ActiveFields(fields []model.BoundField) []model.BoundField {
	return fields
}

// resolveModelFields is the model-bound half of a category's field set.
//
// A model contributes its fields to a category when it is registered on that
// category's ancestor chain -- the same reach a category binding has. One field
// bound to several models appears once, carrying all of them in ModelIDs, so a
// caller can ask "does this apply to the device in front of me" with one lookup
// rather than a search.
//
// Everything is already in memory: both maps arrive loaded whole, the way
// category bindings do, because there are hundreds of models rather than
// millions and a query per row is the N+1 the constitution forbids.
func resolveModelFields(
	path string,
	bindingsByModel map[string][]ModelBinding,
	categoriesOfModel map[string][]string,
) []model.BoundField {
	chain := make(map[string]bool, 8)
	for _, id := range AncestorIDs(path) {
		chain[id] = true
	}

	// Field id -> the entry being built, so a field on four models is one
	// column with four model ids and not four columns.
	byField := map[string]*model.BoundField{}
	order := make([]string, 0, 8)

	modelIDs := make([]string, 0, len(bindingsByModel))
	for id := range bindingsByModel {
		modelIDs = append(modelIDs, id)
	}
	sort.Strings(modelIDs)

	for _, modelID := range modelIDs {
		inChain := false
		for _, categoryID := range categoriesOfModel[modelID] {
			if chain[categoryID] {
				inChain = true
				break
			}
		}
		if !inChain {
			continue
		}
		bindings := append([]ModelBinding(nil), bindingsByModel[modelID]...)
		sort.SliceStable(bindings, func(i, j int) bool { return bindings[i].Sort < bindings[j].Sort })

		for _, b := range bindings {
			existing, seen := byField[b.Field.ID]
			if !seen {
				bf := model.BoundField{
					FieldDefinition: b.Field,
					Required:        b.Field.Required,
					Sort:            b.Sort,
					ModelIDs:        []string{modelID},
				}
				byField[b.Field.ID] = &bf
				order = append(order, b.Field.ID)
				continue
			}
			existing.ModelIDs = append(existing.ModelIDs, modelID)
		}
	}

	out := make([]model.BoundField, 0, len(order))
	for _, id := range order {
		out = append(out, *byField[id])
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].Sort < out[j].Sort })
	return out
}
