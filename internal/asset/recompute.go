package asset

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"maps"
	"sort"
	"strings"
	"time"

	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/schema"
	"github.com/klskk23/nexus-assets/internal/store"
)

var ErrRecomputeConflict = errors.New("recomputed values collide on a unique key")

type Conflict struct {
	Key    string   `json:"key"`
	Value  string   `json:"value"`
	Assets []string `json:"assets"`
}

type RecomputeReport struct {
	Affected  int               `json:"affected"`
	Total     int               `json:"total"`
	Conflicts []Conflict        `json:"conflicts"`
	Applied   bool              `json:"applied"`
	Samples   []RecomputeSample `json:"samples"`
}

type RecomputeSample struct {
	Asset string `json:"asset"`
	Key   string `json:"key"`
	From  string `json:"from"`
	To    string `json:"to"`
}

const maxSamples = 5

// Recompute evaluates the effective expressions in a category subtree. The
// read plan and the single batch write are separated by a stale-input guard.
func (s *Service) Recompute(ctx context.Context, categoryID string, dryRun bool) (RecomputeReport, error) {
	return s.recompute(ctx, categoryID, "", dryRun)
}

// RecomputeField visits actual field identities, including device bindings,
// rather than assuming every descendant inherits every ancestor binding.
func (s *Service) RecomputeField(ctx context.Context, fieldID string, dryRun bool) (RecomputeReport, error) {
	return s.recompute(ctx, "", fieldID, dryRun)
}

func (s *Service) recompute(ctx context.Context, categoryID, fieldID string, dryRun bool) (RecomputeReport, error) {
	var plan *recomputePlan
	err := s.db.ReadTx(ctx, func(ctx context.Context, q store.Querier) error {
		var err error
		plan, err = planRecompute(ctx, q, categoryID, fieldID)
		return err
	})
	if err != nil {
		return RecomputeReport{}, err
	}
	if dryRun || len(plan.report.Conflicts) > 0 || plan.report.Affected == 0 {
		return plan.report, nil
	}
	err = s.db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error { return plan.apply(ctx, tx) })
	if err != nil {
		return plan.report, err
	}
	plan.report.Applied = true
	return plan.report, nil
}

type recomputeInput struct {
	asset       model.Asset
	fingerprint string
}

type change struct {
	id      string
	version int
	attrs   map[string]any
	unique  map[string]UniqueValue
	search  map[string]string
}

type recomputePlan struct {
	inputs  []recomputeInput
	changes []change
	report  RecomputeReport
}

// Plan all assets and expressions from one consistent read transaction.
func planRecompute(ctx context.Context, q store.Querier, categoryID, fieldID string) (*recomputePlan, error) {
	snapshot, err := schema.LoadSchemaSnapshot(ctx, q)
	if err != nil {
		return nil, err
	}
	rootPath := ""
	if categoryID != "" {
		root, err := snapshot.Category(categoryID)
		if err != nil {
			return nil, err
		}
		rootPath = root.Path
	}
	ids := []string{}
	for _, cat := range snapshot.Categories() {
		if strings.HasPrefix(cat.Path, rootPath) {
			ids = append(ids, cat.ID)
		}
	}
	plan := &recomputePlan{}
	cache := newSchemaComputeCache()
	claimed := make(map[[3]string][]string)
	err = scanSchemaAssets(ctx, q, ids, func(assets []model.Asset) error {
		for _, a := range assets {
			resolved, err := snapshot.AssetSchema(a.CategoryID, a.ModelID)
			if err != nil {
				return err
			}
			changed, reached := recomputeSeeds(resolved.Fields, fieldID)
			if !reached {
				continue
			}
			if err := plan.add(a, resolved, changed, cache, claimed); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	if err := plan.checkClaims(ctx, q, claimed); err != nil {
		return nil, err
	}
	plan.report.Affected = len(plan.changes)
	sortConflicts(plan.report.Conflicts)
	return plan, nil
}

func recomputeSeeds(fields []model.BoundField, fieldID string) (map[string]bool, bool) {
	if fieldID == "" {
		return nil, true
	}
	for _, field := range fields {
		if field.ID == fieldID {
			return map[string]bool{field.Key: true}, true
		}
	}
	return nil, false
}

func (plan *recomputePlan) add(a model.Asset, resolved schema.AssetSchema, changed map[string]bool, cache schemaComputeCache, claimed map[[3]string][]string) error {
	computation, err := cache.get(resolved)
	if err != nil {
		return err
	}
	values, err := computation.evaluate(resolved, a.ID, a.Attrs, changed)
	if err != nil {
		return err
	}
	attrs := maps.Clone(a.Attrs)
	dirty := applyRecomputed(attrs, a.Attrs, values, a.ID, &plan.report)
	next := uniqueValues(resolved.Fields, attrs, a.CategoryID)
	for key, value := range next {
		at := [3]string{value.Scope, key, value.Value}
		claimed[at] = append(claimed[at], a.ID)
	}
	plan.inputs = append(plan.inputs, recomputeInput{asset: a, fingerprint: resolved.Fingerprint})
	plan.report.Total++
	if dirty {
		plan.changes = append(plan.changes, change{id: a.ID, version: a.Version, attrs: attrs, unique: next, search: searchValues(resolved.Fields, attrs)})
	}
	return nil
}

func (plan *recomputePlan) checkClaims(ctx context.Context, q store.Querier, claimed map[[3]string][]string) error {
	planned := make(map[string]bool, len(plan.inputs))
	for _, input := range plan.inputs {
		planned[input.asset.ID] = true
	}
	rows, err := q.QueryContext(ctx, `SELECT asset_id, scope_id, field_key, value FROM asset_unique_values WHERE archived_at IS NULL`)
	if err != nil {
		return fmt.Errorf("load recompute claims: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var id, scope, key, value string
		if err := rows.Scan(&id, &scope, &key, &value); err != nil {
			return err
		}
		at := [3]string{scope, key, value}
		if !planned[id] && len(claimed[at]) > 0 {
			claimed[at] = append(claimed[at], id)
		}
	}
	if err := rows.Err(); err != nil {
		return err
	}
	for at, owners := range claimed {
		if len(owners) > 1 {
			sort.Strings(owners)
			plan.report.Conflicts = append(plan.report.Conflicts, Conflict{Key: at[1], Value: at[2], Assets: owners})
		}
	}
	return nil
}

// Validate even unchanged members: they contributed to the final claims check.
// No asset, search row, or unique row is written until every input passes.
func (plan *recomputePlan) validate(ctx context.Context, tx *sql.Tx) error {
	snapshot, err := schema.LoadSchemaSnapshot(ctx, tx)
	if err != nil {
		return err
	}
	for _, input := range plan.inputs {
		current, err := snapshot.AssetSchema(input.asset.CategoryID, input.asset.ModelID)
		if err != nil || current.Fingerprint != input.fingerprint {
			return ErrSchemaStale
		}
	}
	return plan.validateVersions(ctx, tx)
}

func (plan *recomputePlan) validateVersions(ctx context.Context, q store.Querier) error {
	ids := make([]string, 0, len(plan.inputs))
	versions := make(map[string]int, len(plan.inputs))
	for _, input := range plan.inputs {
		ids = append(ids, input.asset.ID)
		versions[input.asset.ID] = input.asset.Version
	}
	encoded, err := json.Marshal(ids)
	if err != nil {
		return err
	}
	rows, err := q.QueryContext(ctx, `SELECT id, version FROM assets WHERE id IN (SELECT value FROM json_each(?))`, string(encoded))
	if err != nil {
		return fmt.Errorf("load recompute versions: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var id string
		var version int
		if err := rows.Scan(&id, &version); err != nil {
			return err
		}
		if version != versions[id] {
			return ErrVersionConflict
		}
		delete(versions, id)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	if len(versions) != 0 {
		return ErrVersionConflict
	}
	return nil
}

func (plan *recomputePlan) apply(ctx context.Context, tx *sql.Tx) error {
	if err := plan.validate(ctx, tx); err != nil {
		return err
	}
	now := time.Now().UTC()
	claims := make([]schemaClaimChange, 0, len(plan.changes))
	for _, c := range plan.changes {
		if err := writeRecomputed(ctx, tx, c, now); err != nil {
			return err
		}
		claims = append(claims, schemaClaimChange{assetID: c.id, want: c.unique})
	}
	// Release the entire batch before claiming final values, so legal swaps work.
	if err := syncSchemaClaims(ctx, tx, claims, now); err != nil {
		return fmt.Errorf("%w: %w", ErrRecomputeConflict, err)
	}
	return nil
}

func writeRecomputed(ctx context.Context, tx *sql.Tx, c change, now time.Time) error {
	attrsJSON, err := store.MarshalJSONMap(c.attrs)
	if err != nil {
		return err
	}
	result, err := tx.ExecContext(ctx, `UPDATE assets SET attrs = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?`, attrsJSON, store.FormatTime(now), c.id, c.version)
	if err != nil {
		return err
	}
	count, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if count != 1 {
		return ErrVersionConflict
	}
	return syncSearchValues(ctx, tx, c.id, c.search)
}

func sortConflicts(cs []Conflict) {
	sort.Slice(cs, func(i, j int) bool {
		if cs[i].Key != cs[j].Key {
			return cs[i].Key < cs[j].Key
		}
		return cs[i].Value < cs[j].Value
	})
}

func applyRecomputed(attrs, before, values map[string]any, display string, report *RecomputeReport) bool {
	keys := make([]string, 0, len(values))
	for k := range values {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	dirty := false
	for _, key := range keys {
		from, to := fmt.Sprint(before[key]), fmt.Sprint(values[key])
		if from == to {
			continue
		}
		dirty = true
		attrs[key] = values[key]
		if len(report.Samples) < maxSamples {
			report.Samples = append(report.Samples, RecomputeSample{Asset: display, Key: key, From: from, To: to})
		}
	}
	return dirty
}
