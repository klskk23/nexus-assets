package schema

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"strings"

	"github.com/klskk23/nexus-assets/internal/compute"
	"github.com/klskk23/nexus-assets/internal/model"
)

// ErrFieldReferenced blocks archiving a field something still reads.
var ErrFieldReferenced = errors.New("field is still referenced")

// Referrer names one expression key that reads a field.
type Referrer struct {
	// Kind is "field" for an expression key that reads this one, or
	// "display_key" for a category that shows it as the asset identifier.
	Kind  string `json:"kind"`
	ID    string `json:"id"`
	Label string `json:"label"`
}

// String renders a referrer for an error message.
func (r Referrer) String() string {
	if r.Kind == "display_key" {
		return fmt.Sprintf("类别「%s」的显示编号", r.Label)
	}
	return fmt.Sprintf("表达式键「%s」", r.Label)
}

// ReferrersOf lists every expression key whose template reads the given field.
//
// References come from the parsed syntax tree, not a text search: a regular
// expression would miss a key inside a nested call and would match one inside a
// string literal. Both mistakes are silent, and this list is what stands
// between an administrator and an unusable system -- taking away a field that
// an expression key reads makes every asset in that category impossible to
// save.
func (s *Store) ReferrersOf(ctx context.Context, key string) ([]Referrer, error) {
	var out []Referrer

	fields, err := s.ListFields(ctx)
	if err != nil {
		return nil, err
	}
	for _, f := range fields {
		if f.Type != model.FieldComputed || f.ArchivedAt != nil || f.Key == key {
			continue
		}
		refs, err := templateRefs(f.Key, f.Options.Template)
		if err != nil {
			// A template that no longer parses cannot be shown to reference
			// anything, but it must not hide a real dependency either, so the
			// failure is reported rather than swallowed.
			return nil, fmt.Errorf("computed field %q has an unparsable template: %w", f.Key, err)
		}
		if slices.Contains(refs, key) {
			out = append(out, Referrer{Kind: "field", ID: f.ID, Label: f.Label})
		}
	}

	return out, nil
}

func templateRefs(name, text string) ([]string, error) {
	t, err := compute.Parse(name, text)
	if err != nil {
		return nil, err
	}
	return compute.AttrReferences(t.Tree.Root), nil
}

// ArchiveField disables a field, refusing while anything still reads it.
//
// This is the same rule as for holder entities and accounts: referenced means
// refused. One behaviour to remember rather than three.
func (s *Store) ArchiveField(ctx context.Context, id string) ([]Referrer, error) {
	f, err := s.GetField(ctx, id)
	if err != nil {
		return nil, err
	}
	referrers, err := s.ReferrersOf(ctx, f.Key)
	if err != nil {
		return nil, err
	}
	// A category nominating this field as its display key is the second way to
	// be referenced: archiving it would leave that category's assets falling
	// back to a short UUID with no warning.
	users, err := s.categoriesUsingDisplayKey(ctx, f.Key)
	if err != nil {
		return nil, err
	}
	referrers = append(referrers, users...)
	if len(referrers) > 0 {
		names := make([]string, 0, len(referrers))
		for _, r := range referrers {
			names = append(names, r.String())
		}
		return referrers, fmt.Errorf("%w：%s正在引用「%s」，请先修改它们",
			ErrFieldReferenced, strings.Join(names, "、"), f.Label)
	}
	yes := true
	if _, err := s.UpdateField(ctx, id, UpdateFieldInput{Archive: &yes}); err != nil {
		return nil, err
	}
	return nil, nil
}

// categoriesUsingDisplayKey lists categories whose display key is this field.
func (s *Store) categoriesUsingDisplayKey(ctx context.Context, key string) ([]Referrer, error) {
	rows, err := s.db.ReadDB().QueryContext(ctx,
		`SELECT id, name FROM categories WHERE display_key = ?`, key)
	if err != nil {
		return nil, fmt.Errorf("scan display keys: %w", err)
	}
	defer rows.Close()
	var out []Referrer
	for rows.Next() {
		var r Referrer
		if err := rows.Scan(&r.ID, &r.Label); err != nil {
			return nil, err
		}
		r.Kind = "display_key"
		out = append(out, r)
	}
	return out, rows.Err()
}
