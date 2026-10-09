package asset

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/klskk23/nexus-assets/internal/i18n"
	"github.com/klskk23/nexus-assets/internal/schema"
	"github.com/klskk23/nexus-assets/internal/store"
)

type schemaClaimSlot struct {
	Key   string `json:"key"`
	Value string `json:"value"`
	Scope string `json:"scope"`
}

// Compare the complete final batch with untouched live claims, never with the
// intermediate claims of assets that this same batch will release.
func checkSchemaClaims(ctx context.Context, q store.Querier, effects []schemaAssetEffect) ([]schema.ChangeIssue, error) {
	ids := make([]string, 0, len(effects))
	var slots []schemaClaimSlot
	for _, effect := range effects {
		ids = append(ids, effect.asset.ID)
		for _, key := range sortedClaimKeys(effect.claims.want) {
			value := effect.claims.want[key]
			slots = append(slots, schemaClaimSlot{Key: key, Value: value.Value, Scope: value.Scope})
		}
	}
	encodedIDs, err := json.Marshal(ids)
	if err != nil {
		return nil, err
	}
	encodedSlots, err := json.Marshal(slots)
	if err != nil {
		return nil, err
	}
	// Keep requested slots outermost so each probes the live unique index rather
	// than reparsing and scanning the full JSON array for every existing claim.
	rows, err := q.QueryContext(ctx, `SELECT u.asset_id, u.field_key, u.value, u.scope_id
		FROM json_each(?) s CROSS JOIN asset_unique_values u
		WHERE u.archived_at IS NULL
		AND u.field_key = json_extract(s.value, '$.key')
		AND u.value = json_extract(s.value, '$.value')
		AND u.scope_id = json_extract(s.value, '$.scope')
		AND u.asset_id NOT IN (SELECT value FROM json_each(?))
		ORDER BY u.asset_id, u.field_key`, string(encodedSlots), string(encodedIDs))
	if err != nil {
		return nil, fmt.Errorf("check schema claims: %w", err)
	}
	defer rows.Close()
	occupied := make(map[schemaClaimSlot]string)
	for rows.Next() {
		var id string
		var slot schemaClaimSlot
		if err := rows.Scan(&id, &slot.Key, &slot.Value, &slot.Scope); err != nil {
			return nil, err
		}
		occupied[slot] = id
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	var issues []schema.ChangeIssue
	for _, effect := range effects {
		for _, field := range effect.fields {
			value, exists := effect.claims.want[field.Key]
			if !exists {
				continue
			}
			slot := schemaClaimSlot{Key: field.Key, Value: value.Value, Scope: value.Scope}
			if other, collision := occupied[slot]; collision && other != effect.asset.ID {
				issues = append(issues, schema.ChangeIssue{
					Code: "unique_conflict", Message: i18n.Wrap(
						FieldErrors{field.Key: i18n.M(i18n.KeyFieldValueTaken, other)},
						i18n.KeyFieldValueTaken, other),
					CategoryID: effect.asset.CategoryID, FieldID: field.ID, FieldKey: field.Key,
					AssetID: effect.asset.ID, ConflictAssetID: other,
				})
				continue
			}
			occupied[slot] = effect.asset.ID
		}
	}
	return issues, nil
}
