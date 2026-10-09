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

// Referrer names a computed field or category display key reading a definition.
type Referrer struct {
	Kind  string `json:"kind"`
	ID    string `json:"id"`
	Label string `json:"label"`
}

// Message renders a reference at the request's language boundary.
func (r Referrer) Message() i18n.Message {
	if r.Kind == "display_key" {
		return i18n.M(i18n.KeyRefDisplayKey, r.Label)
	}
	return i18n.M(i18n.KeyRefComputedKey, r.Label)
}

// String keeps Referrer printable in logs and tests.
func (r Referrer) String() string { return r.Message().Error() }

// ReferrersOf uses field identity and simultaneous reach, not ancestor paths or
// a global key match. Two disjoint models can define independent identical keys.
func (s *Store) ReferrersOf(ctx context.Context, fieldID, key string) ([]Referrer, error) {
	snapshot, err := s.Snapshot(ctx)
	if err != nil {
		return nil, err
	}
	return snapshot.referrersOf(fieldID, key)
}

func (s *SchemaSnapshot) referrersOf(fieldID, key string) ([]Referrer, error) {
	target, err := s.FieldReach(fieldID)
	if err != nil {
		return nil, err
	}
	var out []Referrer
	for _, f := range s.fields {
		if f.Type != model.FieldComputed || f.ID == fieldID {
			continue
		}
		reach, err := s.FieldReach(f.ID)
		if err != nil {
			return nil, err
		}
		if !reachesOverlap(target, reach) {
			continue
		}
		refs, err := templateRefs(f.Key, f.Options.Template)
		if err != nil {
			return nil, fmt.Errorf("computed field %q has an unparsable template: %w", f.Key, err)
		}
		if slices.Contains(refs, key) {
			out = append(out, Referrer{Kind: "field", ID: f.ID, Label: f.Label})
		}
	}
	slices.SortFunc(out, func(a, b Referrer) int {
		if a.ID < b.ID {
			return -1
		}
		if a.ID > b.ID {
			return 1
		}
		return 0
	})
	return out, nil
}

func reachesOverlap(a, b FieldReach) bool {
	if len(a.CategoryIDs) > 0 && len(b.ModelIDs) > 0 || len(b.CategoryIDs) > 0 && len(a.ModelIDs) > 0 {
		return true
	}
	for _, id := range a.CategoryIDs {
		if slices.Contains(b.CategoryIDs, id) {
			return true
		}
	}
	for _, id := range a.ModelIDs {
		if slices.Contains(b.ModelIDs, id) {
			return true
		}
	}
	return false
}

func templateRefs(name, text string) ([]string, error) {
	p, err := compute.Parse(name, text)
	if err != nil {
		return nil, err
	}
	return p.AttrReferences(), nil
}

// Blocker names an asset standing in the way of deleting a field.
type Blocker struct {
	AssetID string `json:"asset_id"`
	Name    string `json:"name"`
}

const blockerLimit = 5

// assetsUsing includes ambiguous archived values even when no binding remains.
// A value can be excluded only when another effective definition owns its key.
func assetsUsing(ctx context.Context, q store.Querier, snapshot *SchemaSnapshot, f model.FieldDefinition) ([]Blocker, int, error) {
	rows, err := q.QueryContext(ctx, `SELECT a.id,a.category_id,coalesce(a.model_id,''),a.attrs,coalesce(c.display_key,'')
 FROM assets a JOIN categories c ON c.id=a.category_id
 WHERE coalesce(trim(json_extract(a.attrs,'$.' || ?)),'') <> '' ORDER BY a.created_at,a.id`, f.Key)
	if err != nil {
		return nil, 0, fmt.Errorf("load field values: %w", err)
	}
	defer rows.Close()
	var out []Blocker
	total := 0
	for rows.Next() {
		var id, categoryID, modelID, raw, displayKey string
		if err := rows.Scan(&id, &categoryID, &modelID, &raw, &displayKey); err != nil {
			return nil, 0, err
		}
		owned, err := snapshot.valueOwnedByOther(f, categoryID, modelID)
		if err != nil {
			return nil, 0, err
		}
		if owned {
			continue
		}
		total++
		if len(out) >= blockerLimit {
			continue
		}
		attrs, err := store.UnmarshalJSONMap(raw)
		if err != nil {
			return nil, 0, err
		}
		out = append(out, Blocker{AssetID: id, Name: model.AssetDisplayName(id, attrs, displayKey)})
	}
	return out, total, rows.Err()
}

func (s *SchemaSnapshot) valueOwnedByOther(f model.FieldDefinition, categoryID, modelID string) (bool, error) {
	cat, err := s.Category(categoryID)
	if err != nil {
		return false, err
	}
	fields, err := s.FieldsForAsset(cat.Path, modelID)
	if err != nil {
		return false, err
	}
	for _, effective := range fields {
		if effective.Key == f.Key {
			return effective.ID != f.ID, nil
		}
	}
	return false, nil
}

// DeleteField checks references and retained values in the same write snapshot
// that removes the definition. Archived values cannot race a pre-transaction guard.
func (s *Store) DeleteField(ctx context.Context, id string) ([]Referrer, []Blocker, int, error) {
	var refs []Referrer
	var blockers []Blocker
	var total int
	err := s.db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		snapshot, err := LoadSchemaSnapshot(ctx, tx)
		if err != nil {
			return err
		}
		f, ok := snapshot.fields[id]
		if !ok {
			return ErrNotFound
		}
		refs, err = snapshot.referrersOf(id, f.Key)
		if err != nil {
			return err
		}
		reach, err := snapshot.FieldReach(id)
		if err != nil {
			return err
		}
		for _, catID := range reach.CategoryIDs {
			c := snapshot.categories[catID]
			if c.DisplayKey == f.Key {
				refs = append(refs, Referrer{Kind: "display_key", ID: c.ID, Label: c.Name})
			}
		}
		if len(refs) > 0 {
			names := make([]any, 0, len(refs))
			for _, r := range refs {
				names = append(names, r.Message())
			}
			return i18n.Wrap(ErrFieldReferenced, i18n.KeyFieldReferenced, i18n.Join(i18n.KeyListSeparator, names...), f.Label)
		}
		blockers, total, err = assetsUsing(ctx, tx, snapshot, f)
		if err != nil {
			return err
		}
		if total > 0 {
			var partial any = ""
			if len(blockers) < total {
				partial = i18n.M(i18n.KeyListTruncated, len(blockers))
			}
			return i18n.Wrap(ErrFieldInUse, i18n.KeyFieldInUseByAssets, total, f.Label, partial)
		}
		return s.deleteFieldTx(ctx, tx, id, f.Key)
	})
	return refs, blockers, total, err
}
