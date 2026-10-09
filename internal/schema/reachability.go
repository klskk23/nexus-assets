package schema

import (
	"context"
	"encoding/json"
	"fmt"
	"slices"

	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/store"
)

// FieldReach is a union of exact categories and actual models, never subtrees.
// Device bindings remain independent of category and overlapping routes dedupe.
type FieldReach struct {
	CategoryIDs []string
	ModelIDs    []string
}

// SQLPredicate uses JSON sets to keep SQLite parameter use constant. Column
// names must be trusted SQL identifiers supplied by the caller, not user input.
func (r FieldReach) SQLPredicate(categoryColumn, modelColumn string) (string, []any, error) {
	categories, err := json.Marshal(r.CategoryIDs)
	if err != nil {
		return "", nil, err
	}
	models, err := json.Marshal(r.ModelIDs)
	if err != nil {
		return "", nil, err
	}
	return "(" + categoryColumn + " IN (SELECT value FROM json_each(?)) OR " + modelColumn + " IN (SELECT value FROM json_each(?)))", []any{string(categories), string(models)}, nil
}

// FieldReach resolves a definition by identity, not by its possibly shared key.
func (s *SchemaSnapshot) FieldReach(fieldID string) (FieldReach, error) {
	if _, ok := s.fields[fieldID]; !ok {
		return FieldReach{}, ErrNotFound
	}
	return s.reachMatching(func(f model.BoundField) bool { return f.ID == fieldID })
}

// KeyReach covers all independent definitions of a filter's attribute key.
func (s *SchemaSnapshot) KeyReach(key string) (FieldReach, error) {
	return s.reachMatching(func(f model.BoundField) bool { return f.Key == key })
}

func (s *SchemaSnapshot) reachMatching(matches func(model.BoundField) bool) (FieldReach, error) {
	reach := FieldReach{}
	for id := range s.categories {
		fields, err := s.EffectiveFields(id)
		if err != nil {
			return reach, err
		}
		if slices.ContainsFunc(fields, matches) {
			reach.CategoryIDs = append(reach.CategoryIDs, id)
		}
	}
	for id, fields := range s.deviceByModel {
		if slices.ContainsFunc(fields, matches) {
			reach.ModelIDs = append(reach.ModelIDs, id)
		}
	}
	slices.Sort(reach.CategoryIDs)
	slices.Sort(reach.ModelIDs)
	return reach, nil
}

// FieldAppliesTo checks the output column's identity against this row's schema.
func (s *SchemaSnapshot) FieldAppliesTo(fieldID, categoryID, modelID string) (bool, error) {
	fields, err := s.EffectiveFields(categoryID)
	if err != nil {
		return false, err
	}
	has := func(f model.BoundField) bool { return f.ID == fieldID }
	return slices.ContainsFunc(fields, has) || slices.ContainsFunc(s.deviceByModel[modelID], has), nil
}

// FieldAssetCount counts each currently reached asset once, including devices
// reached both through their model and its vendor. Missing definitions are 404.
func (s *Store) FieldAssetCount(ctx context.Context, fieldID string) (int, error) {
	var total int
	err := s.db.ReadTx(ctx, func(ctx context.Context, q store.Querier) error {
		snapshot, err := LoadSchemaSnapshot(ctx, q)
		if err != nil {
			return err
		}
		reach, err := snapshot.FieldReach(fieldID)
		if err != nil {
			return err
		}
		predicate, args, err := reach.SQLPredicate("category_id", "model_id")
		if err != nil {
			return err
		}
		if err = q.QueryRowContext(ctx, `SELECT count(*) FROM assets WHERE `+predicate, args...).Scan(&total); err != nil {
			return fmt.Errorf("count field assets: %w", err)
		}
		return nil
	})
	return total, err
}
