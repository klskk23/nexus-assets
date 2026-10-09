package asset

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"reflect"
	"time"

	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/schema"
	"github.com/klskk23/nexus-assets/internal/store"
)

// SchemaEffects is the asset-side boundary for schema change effects.
// Schema metadata is owned by schema; this adapter owns values and their indexes.
type SchemaEffects struct{}

var _ schema.AssetEffects = (*SchemaEffects)(nil)

func NewSchemaEffects() *SchemaEffects { return &SchemaEffects{} }

type schemaAssetEffect struct {
	asset  model.Asset
	claims schemaClaimChange
	search map[string]string
	attrs  map[string]any
	issues []schema.ChangeIssue
	fields []model.BoundField
}

// Plan uses only the caller's snapshot. It never persists or opens a transaction.
func (*SchemaEffects) Plan(ctx context.Context, q store.Querier, change schema.SchemaChange) (*schema.AssetEffectPlan, error) {
	if q == nil || change.Before == nil || change.After == nil {
		return nil, schema.ErrSchemaEffectsUnavailable
	}
	ids := make([]string, 0, len(change.Changes))
	for _, delta := range change.Changes {
		if delta.Change != "removed" && delta.Change != "added" && delta.Change != "source_changed" {
			return nil, schema.ErrSchemaEffectsUnavailable
		}
		ids = append(ids, delta.CategoryID)
	}
	plan := &schema.AssetEffectPlan{}
	var effects []schemaAssetEffect
	cache := newSchemaComputeCache()
	err := scanSchemaAssets(ctx, q, ids, func(assets []model.Asset) error {
		for _, a := range assets {
			effect, err := planSchemaAssetCached(change, a, cache)
			if err != nil {
				return err
			}
			effects = append(effects, effect)
			plan.Issues = append(plan.Issues, effect.issues...)
			plan.Assets = append(plan.Assets, schema.AssetImpact{ID: a.ID, Version: a.Version})
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	if len(plan.Issues) != 0 {
		return plan, nil
	}
	plan.Issues, err = checkSchemaClaims(ctx, q, effects)
	if err != nil || len(plan.Issues) != 0 {
		return plan, err
	}
	plan.Apply = func(ctx context.Context, tx *sql.Tx) error {
		return applySchemaEffects(ctx, tx, effects)
	}
	return plan, nil
}

const schemaAssetBatchSize = 128

// The callback consumes each batch synchronously; its slice is reused. One
// cursor bounds raw staging without adding per-batch queries or transactions.
// Final effects and claims remain in the caller's plan for atomic validation.
func scanSchemaAssets(ctx context.Context, q store.Querier, categoryIDs []string, consume func([]model.Asset) error) error {
	if len(categoryIDs) == 0 {
		return nil
	}
	encoded, err := json.Marshal(categoryIDs)
	if err != nil {
		return err
	}
	rows, err := q.QueryContext(ctx, `SELECT `+assetCols+` FROM assets
		WHERE category_id IN (SELECT value FROM json_each(?)) ORDER BY id`, string(encoded))
	if err != nil {
		return fmt.Errorf("load schema assets: %w", err)
	}
	defer rows.Close()
	batch := make([]model.Asset, 0, schemaAssetBatchSize)
	for rows.Next() {
		a, err := scanAsset(rows)
		if err != nil {
			return err
		}
		batch = append(batch, a)
		if len(batch) == schemaAssetBatchSize {
			if err := consume(batch); err != nil {
				return err
			}
			clear(batch)
			batch = batch[:0]
		}
	}
	if err := rows.Err(); err != nil {
		return err
	}
	if len(batch) != 0 {
		return consume(batch)
	}
	return nil
}

// The caller owns rollback of metadata and asset effects together. Only restored
// values are normalized; archived attrs remain and no transfers are fabricated.
func applySchemaEffects(ctx context.Context, tx *sql.Tx, effects []schemaAssetEffect) error {
	now := time.Now().UTC()
	claims := make([]schemaClaimChange, 0, len(effects))
	for _, effect := range effects {
		result, err := tx.ExecContext(ctx, `UPDATE assets SET version = version + 1, updated_at = ?
			WHERE id = ? AND version = ?`, store.FormatTime(now), effect.asset.ID, effect.asset.Version)
		if err != nil {
			return fmt.Errorf("update schema asset %s: %w", effect.asset.ID, err)
		}
		count, err := result.RowsAffected()
		if err != nil {
			return err
		}
		if count != 1 {
			return ErrVersionConflict
		}
		if !reflect.DeepEqual(effect.asset.Attrs, effect.attrs) {
			encoded, err := json.Marshal(effect.attrs)
			if err != nil {
				return err
			}
			if _, err := tx.ExecContext(ctx, `UPDATE assets SET attrs = ? WHERE id = ?`, string(encoded), effect.asset.ID); err != nil {
				return fmt.Errorf("update schema attrs %s: %w", effect.asset.ID, err)
			}
		}
		claims = append(claims, effect.claims)
	}
	if err := syncSchemaClaims(ctx, tx, claims, now); err != nil {
		return err
	}
	for _, effect := range effects {
		if err := syncSearchValues(ctx, tx, effect.asset.ID, effect.search); err != nil {
			return err
		}
	}
	return nil
}
