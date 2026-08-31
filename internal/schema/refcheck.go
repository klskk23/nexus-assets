package schema

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"slices"

	"github.com/klskk23/nexus-assets/internal/compute"
	"github.com/klskk23/nexus-assets/internal/i18n"
	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/store"
)

// ErrFieldReferenced blocks deleting a field something still reads.
var ErrFieldReferenced = errors.New("field is still referenced")

// ErrFieldInUse blocks deleting a field that assets carry values for.
var ErrFieldInUse = errors.New("field still holds data on existing assets")

// Referrer names one expression key that reads a field.
type Referrer struct {
	// Kind is "field" for an expression key that reads this one, or
	// "display_key" for a category that shows it as the asset identifier.
	Kind  string `json:"kind"`
	ID    string `json:"id"`
	Label string `json:"label"`
}

// Message renders a referrer as a translatable fragment.
//
// It is a Message rather than a string so it can be an argument of the refusal
// that quotes it: the language is chosen once, at the edge, not here.
func (r Referrer) Message() i18n.Message {
	if r.Kind == "display_key" {
		return i18n.M(i18n.KeyRefDisplayKey, r.Label)
	}
	return i18n.M(i18n.KeyRefComputedKey, r.Label)
}

// String keeps Referrer printable in logs and tests.
func (r Referrer) String() string { return r.Message().Error() }

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
		if f.Type != model.FieldComputed || f.Key == key {
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

// Blocker names one asset standing in the way of deleting a field.
type Blocker struct {
	AssetID string `json:"asset_id"`
	Name    string `json:"name"`
}

// blockerLimit caps how many assets are listed. Enough to show what is going
// on without turning an error message into a report.
const blockerLimit = 5

// AssetsUsing reports the assets carrying a non-empty value for the key.
//
// This has to be a full scan: attrs is a JSON column and the key is decided at
// runtime, so a parameterised json_extract cannot use an index. Deleting is a
// rare, deliberate act, and what the scan buys is that deleting never loses
// data -- an approximation here would mean a silent loss there.
//
// Emptiness is judged after trimming rather than by IS NOT NULL. A field that
// was once filled in and later cleared leaves an empty string behind, and
// treating that as "in use" would make it undeletable for ever while the screen
// shows the column as blank.
func (s *Store) AssetsUsing(ctx context.Context, key string) ([]Blocker, int, error) {
	const pred = `coalesce(trim(json_extract(a.attrs, '$.' || ?)), '') != ''`

	var total int
	if err := s.db.ReadDB().QueryRowContext(ctx,
		`SELECT count(*) FROM assets a WHERE `+pred, key).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count assets using %q: %w", key, err)
	}
	if total == 0 {
		return nil, 0, nil
	}

	rows, err := s.db.ReadDB().QueryContext(ctx,
		`SELECT a.id, a.attrs, coalesce(c.display_key, '')
		 FROM assets a JOIN categories c ON c.id = a.category_id
		 WHERE `+pred+` ORDER BY a.created_at, a.id LIMIT ?`, key, blockerLimit)
	if err != nil {
		return nil, 0, fmt.Errorf("list assets using %q: %w", key, err)
	}
	defer rows.Close()
	var out []Blocker
	for rows.Next() {
		var b Blocker
		var attrsJSON, displayKey string
		if err := rows.Scan(&b.AssetID, &attrsJSON, &displayKey); err != nil {
			return nil, 0, err
		}
		attrs, err := store.UnmarshalJSONMap(attrsJSON)
		if err != nil {
			return nil, 0, err
		}
		b.Name = model.AssetDisplayName(b.AssetID, attrs, displayKey)
		out = append(out, b)
	}
	return out, total, rows.Err()
}

// DeleteField removes a field, refusing while anything still points at it.
//
// Three checks, cheapest first: an expression key that reads it, a category
// that shows it as the asset identifier, then the full scan for stored values.
// The first two are configuration and the third is data; both kinds of refusal
// name what is in the way, because "cannot delete" without that is a dead end.
func (s *Store) DeleteField(ctx context.Context, id string) ([]Referrer, []Blocker, int, error) {
	f, err := s.GetField(ctx, id)
	if err != nil {
		return nil, nil, 0, err
	}

	referrers, err := s.ReferrersOf(ctx, f.Key)
	if err != nil {
		return nil, nil, 0, err
	}
	users, err := s.categoriesUsingDisplayKey(ctx, f.Key)
	if err != nil {
		return nil, nil, 0, err
	}
	referrers = append(referrers, users...)
	if len(referrers) > 0 {
		names := make([]any, 0, len(referrers))
		for _, r := range referrers {
			names = append(names, r.Message())
		}
		return referrers, nil, 0, i18n.Wrap(ErrFieldReferenced, i18n.KeyFieldReferenced,
			i18n.Join(i18n.KeyListSeparator, names...), f.Label)
	}

	blockers, total, err := s.AssetsUsing(ctx, f.Key)
	if err != nil {
		return nil, nil, 0, err
	}
	if total > 0 {
		var partial any = ""
		if len(blockers) < total {
			partial = i18n.M(i18n.KeyListTruncated, len(blockers))
		}
		return nil, blockers, total, i18n.Wrap(ErrFieldInUse,
			i18n.KeyFieldInUseByAssets, total, f.Label, partial)
	}

	err = s.db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		return s.deleteFieldTx(ctx, tx, f.ID, f.Key)
	})
	return nil, nil, 0, err
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
