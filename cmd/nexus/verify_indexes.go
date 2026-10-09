package main

import (
	"context"
	"fmt"
	"log"
	"strings"

	"github.com/klskk23/nexus-assets/internal/asset"
	"github.com/klskk23/nexus-assets/internal/schema"
	"github.com/klskk23/nexus-assets/internal/store"
)

type verifyIndexKey struct{ assetID, fieldKey string }
type verifyIndexValue struct{ value, scope string }

// expectedIndexes deliberately derives claims from effective definitions and
// raw attrs, independently of the persistence/index synchronization functions.
func expectedIndexes(sch *schema.SchemaSnapshot, snaps map[string]snapshot) (map[verifyIndexKey]verifyIndexValue, map[verifyIndexKey]verifyIndexValue, int) {
	unique := map[verifyIndexKey]verifyIndexValue{}
	search := map[verifyIndexKey]verifyIndexValue{}
	problems := 0
	for id, snap := range snaps {
		resolved, err := sch.AssetSchema(snap.categoryID, snap.modelID)
		if err != nil {
			problems++
			log.Printf("asset %s: cannot resolve schema: %v", id, err)
			continue
		}
		for _, f := range resolved.Fields {
			raw := snap.attrs[f.Key]
			if raw == nil {
				continue
			}
			value := strings.TrimSpace(fmt.Sprint(raw))
			if value == "" {
				continue
			}
			key := verifyIndexKey{id, f.Key}
			if f.Findable() {
				search[key] = verifyIndexValue{value: value}
			}
			if !f.IsUnique {
				continue
			}
			scope := snap.categoryID
			if f.InheritedFrom != "" {
				scope = f.InheritedFrom
			}
			if len(f.ModelIDs) > 0 {
				scope = asset.ModelScopePrefix + f.ID
			}
			unique[key] = verifyIndexValue{value: value, scope: scope}
		}
	}
	return unique, search, problems
}

func verifyIndexes(ctx context.Context, q store.Querier, sch *schema.SchemaSnapshot, snaps map[string]snapshot) (int, error) {
	unique, search, problems := expectedIndexes(sch, snaps)
	n, err := verifyIndexRows(ctx, q, "unique", `SELECT asset_id,field_key,value,scope_id,search_suppressed FROM asset_unique_values WHERE archived_at IS NULL`, unique)
	if err != nil {
		return 0, err
	}
	problems += n
	n, err = verifyIndexRows(ctx, q, "search", `SELECT asset_id,field_key,value,'',0 FROM asset_search_values`, search)
	if err != nil {
		return 0, err
	}
	return problems + n, nil
}

// Archived unique claims are historical facts, not reconstructions of today's
// schema. Only live rows are compared; suppressed live rows are always invalid.
func verifyIndexRows(ctx context.Context, q store.Querier, kind, query string, want map[verifyIndexKey]verifyIndexValue) (int, error) {
	rows, err := q.QueryContext(ctx, query)
	if err != nil {
		return 0, fmt.Errorf("scan %s index: %w", kind, err)
	}
	defer rows.Close()
	problems := 0
	for rows.Next() {
		var key verifyIndexKey
		var got verifyIndexValue
		var suppressed bool
		if err := rows.Scan(&key.assetID, &key.fieldKey, &got.value, &got.scope, &suppressed); err != nil {
			return 0, fmt.Errorf("scan %s index row: %w", kind, err)
		}
		expected, present := want[key]
		if !present || got != expected || suppressed {
			problems++
			log.Printf("asset %s field %s: %s index value=%q scope=%q suppressed=%t; expected present=%t value=%q scope=%q", key.assetID, key.fieldKey, kind, got.value, got.scope, suppressed, present, expected.value, expected.scope)
		}
		delete(want, key)
	}
	if err := rows.Err(); err != nil {
		return 0, fmt.Errorf("read %s index: %w", kind, err)
	}
	for key, expected := range want {
		problems++
		log.Printf("asset %s field %s: missing %s index value=%q scope=%q", key.assetID, key.fieldKey, kind, expected.value, expected.scope)
	}
	return problems, nil
}
