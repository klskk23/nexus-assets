package asset

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"slices"
	"time"

	"github.com/klskk23/nexus-assets/internal/store"
)

// schemaClaimChange holds one asset's complete final claims and the keys that
// actually cease to be effective. A source-only change is not a withdrawal.
type schemaClaimChange struct {
	assetID   string
	want      map[string]UniqueValue
	withdrawn []string
}

// syncSchemaClaims runs only after the planner has checked the complete final
// claim set. The caller owns rollback; never insert until every old claim that
// changes has been released, so exchanges cannot collide with intermediate state.
func syncSchemaClaims(ctx context.Context, tx *sql.Tx, changes []schemaClaimChange, now time.Time) error {
	live, err := loadSchemaClaims(ctx, tx, changes)
	if err != nil {
		return err
	}
	stamp := store.FormatTime(now)
	for _, change := range changes {
		if err := releaseSchemaClaims(ctx, tx, change, live[change.assetID], stamp); err != nil {
			return err
		}
	}
	for _, change := range changes {
		for _, key := range sortedClaimKeys(change.want) {
			value := change.want[key]
			if live[change.assetID][key] == value && !slices.Contains(change.withdrawn, key) {
				continue
			}
			if _, err := tx.ExecContext(ctx, `INSERT INTO asset_unique_values
				(asset_id, field_key, value, scope_id, created_at, search_suppressed)
				VALUES (?, ?, ?, ?, ?, 0)`, change.assetID, key, value.Value, value.Scope, stamp); err != nil {
				return fmt.Errorf("insert schema claim for %s/%s: %w", change.assetID, key, err)
			}
		}
	}
	return nil
}

func loadSchemaClaims(ctx context.Context, tx *sql.Tx, changes []schemaClaimChange) (map[string]map[string]UniqueValue, error) {
	ids := make([]string, 0, len(changes))
	for _, change := range changes {
		ids = append(ids, change.assetID)
	}
	encoded, err := json.Marshal(ids)
	if err != nil {
		return nil, err
	}
	rows, err := tx.QueryContext(ctx, `SELECT asset_id, field_key, value, scope_id FROM asset_unique_values
		WHERE archived_at IS NULL AND asset_id IN (SELECT value FROM json_each(?))`, string(encoded))
	if err != nil {
		return nil, fmt.Errorf("load schema claims: %w", err)
	}
	defer rows.Close()
	live := make(map[string]map[string]UniqueValue, len(changes))
	for rows.Next() {
		var id, key string
		var value UniqueValue
		if err := rows.Scan(&id, &key, &value.Value, &value.Scope); err != nil {
			return nil, err
		}
		if live[id] == nil {
			live[id] = make(map[string]UniqueValue)
		}
		live[id][key] = value
	}
	return live, rows.Err()
}

func releaseSchemaClaims(ctx context.Context, tx *sql.Tx, change schemaClaimChange, live map[string]UniqueValue, stamp string) error {
	for _, key := range change.withdrawn {
		if _, err := tx.ExecContext(ctx, `UPDATE asset_unique_values
			SET search_suppressed = 1, archived_at = coalesce(archived_at, ?)
			WHERE asset_id = ? AND field_key = ?`, stamp, change.assetID, key); err != nil {
			return fmt.Errorf("suppress withdrawn claims for %s/%s: %w", change.assetID, key, err)
		}
	}
	for _, key := range sortedClaimKeys(live) {
		if change.want[key] == live[key] || slices.Contains(change.withdrawn, key) {
			continue
		}
		if _, err := tx.ExecContext(ctx, `UPDATE asset_unique_values SET archived_at = ?
			WHERE asset_id = ? AND field_key = ? AND archived_at IS NULL`, stamp, change.assetID, key); err != nil {
			return fmt.Errorf("release schema claim for %s/%s: %w", change.assetID, key, err)
		}
	}
	return nil
}

func sortedClaimKeys(values map[string]UniqueValue) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	slices.Sort(keys)
	return keys
}
