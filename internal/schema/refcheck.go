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

// Referrer names one template that reads a field.
type Referrer struct {
	// Kind is "field" for a computed information item, "category" for an
	// sn_template.
	Kind  string `json:"kind"`
	ID    string `json:"id"`
	Label string `json:"label"`
}

// String renders a referrer for an error message.
func (r Referrer) String() string {
	if r.Kind == "category" {
		return fmt.Sprintf("类别「%s」的编号生成规则", r.Label)
	}
	return fmt.Sprintf("计算项「%s」", r.Label)
}

// ReferrersOf lists everything whose template reads the given field key.
//
// References come from the parsed syntax tree, not a text search: a regular
// expression would miss a key inside a nested call and would match one inside a
// string literal. Both mistakes are silent, and this list is what stands
// between an administrator and an unusable system -- archiving a field that a
// serial-number rule reads would make every asset in that category impossible
// to save.
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

	categories, err := s.ListCategories(ctx)
	if err != nil {
		return nil, err
	}
	for _, c := range categories {
		if strings.TrimSpace(c.SNTemplate) == "" {
			continue
		}
		refs, err := templateRefs("sn:"+c.Code, c.SNTemplate)
		if err != nil {
			return nil, fmt.Errorf("category %q has an unparsable serial-number rule: %w", c.Name, err)
		}
		if slices.Contains(refs, key) {
			out = append(out, Referrer{Kind: "category", ID: c.ID, Label: c.Name})
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
	if len(referrers) > 0 {
		names := make([]string, 0, len(referrers))
		for _, r := range referrers {
			names = append(names, r.String())
		}
		return referrers, fmt.Errorf("%w: %s 正在引用「%s」，请先修改它们",
			ErrFieldReferenced, strings.Join(names, "、"), f.Label)
	}
	yes := true
	if _, err := s.UpdateField(ctx, id, UpdateFieldInput{Archive: &yes}); err != nil {
		return nil, err
	}
	return nil, nil
}
