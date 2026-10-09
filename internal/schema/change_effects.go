package schema

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"slices"

	"github.com/klskk23/nexus-assets/internal/i18n"
	"github.com/klskk23/nexus-assets/internal/store"
)

var ErrSchemaEffectsUnavailable = errors.New("schema asset effects unavailable")

// SchemaChange describes the complete final schema, before any persistent writes.
// Snapshots and changes are read-only inputs to an effects planner.
type SchemaChange struct {
	Before, After *SchemaSnapshot
	Changes       []FieldDelta
}

// AssetEffects plans using the caller's consistent read or write transaction.
// Implementations must not write, open another transaction, or call asset Save.
type AssetEffects interface {
	Plan(context.Context, store.Querier, SchemaChange) (*AssetEffectPlan, error)
}

// AssetImpact identifies a record and the version used to plan its effects.
type AssetImpact struct {
	ID      string
	Version int
}

// AssetEffectPlan is valid only within the transaction that produced it. Apply
// receives that caller-owned write transaction; previews never invoke it.
type AssetEffectPlan struct {
	Issues []ChangeIssue
	Assets []AssetImpact
	Apply  func(context.Context, *sql.Tx) error
}

func (s *Store) planAssetEffects(ctx context.Context, q store.Querier, change SchemaChange, count int) (*AssetEffectPlan, error) {
	if count == 0 {
		return nil, nil
	}
	unavailable := func() (*AssetEffectPlan, error) {
		return &AssetEffectPlan{Issues: []ChangeIssue{unavailableEffectsIssue(count)}}, nil
	}
	if s.effects == nil {
		return unavailable()
	}
	plan, err := s.effects.Plan(ctx, q, change)
	if errors.Is(err, ErrSchemaEffectsUnavailable) {
		return unavailable()
	}
	if err != nil {
		return nil, err
	}
	if plan == nil || (len(plan.Issues) == 0 && (plan.Apply == nil || len(plan.Assets) != count)) {
		return unavailable()
	}
	return plan, nil
}

// changedAssetCount counts assets by actual changed category, not by an ancestor
// path. Multiple field deltas must never count the same asset more than once.
func changedAssetCount(ctx context.Context, q store.Querier, changes []FieldDelta) (int, error) {
	if len(changes) == 0 {
		return 0, nil
	}
	ids := make([]string, 0, len(changes))
	for _, change := range changes {
		ids = append(ids, change.CategoryID)
	}
	slices.Sort(ids)
	encoded, err := json.Marshal(slices.Compact(ids))
	if err != nil {
		return 0, err
	}
	var count int
	err = q.QueryRowContext(ctx, `SELECT count(*) FROM assets
		WHERE category_id IN (SELECT value FROM json_each(?))`, string(encoded)).Scan(&count)
	return count, err
}

// Until transactional asset effects are supplied, a preview must not advertise
// an asset-affecting field change as ready to commit (T015/T030).
func unavailableEffectsIssue(count int) ChangeIssue {
	return ChangeIssue{
		Code:    "schema_effects_unavailable",
		Message: i18n.Wrap(ErrSchemaEffectsUnavailable, i18n.KeySchemaEffectsUnavailable, count),
	}
}
