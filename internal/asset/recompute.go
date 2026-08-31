package asset

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/klskk23/nexus-assets/internal/compute"
	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/schema"
	"github.com/klskk23/nexus-assets/internal/store"
)

// ErrRecomputeConflict reports that the new rules would give two devices the
// same value on a key that must be unique.
var ErrRecomputeConflict = errors.New("recomputed values collide on a unique key")

// Conflict is one collision the new rules would cause.
type Conflict struct {
	Key   string `json:"key"`
	Value string `json:"value"`
	// Assets names the devices that would end up sharing the value.
	Assets []string `json:"assets"`
}

// RecomputeReport is what a run produced.
type RecomputeReport struct {
	// Affected counts assets at least one of whose values would change.
	Affected int `json:"affected"`
	// Total is how many assets the rules were applied to.
	Total     int        `json:"total"`
	Conflicts []Conflict `json:"conflicts"`
	// Applied is false for a dry run, and false for a real run that was
	// abandoned because of a conflict.
	Applied bool `json:"applied"`
	// Samples shows a few before/after pairs so the operator can sanity-check
	// the rules before committing to them.
	Samples []RecomputeSample `json:"samples"`
}

// RecomputeSample is one before/after pair.
type RecomputeSample struct {
	Asset string `json:"asset"`
	Key   string `json:"key"`
	From  string `json:"from"`
	To    string `json:"to"`
}

const maxSamples = 5

// Recompute re-evaluates every expression key of every asset in a category
// subtree.
//
// Two phases on purpose. Editing a template that governs thousands of devices
// is not something to discover the consequences of afterwards, so a dry run
// reports the blast radius and any collisions first. The real run is one
// transaction: if a single pair of devices would end up sharing a value on a
// unique key the whole thing is abandoned, because a half-renumbered warehouse
// is worse than an un-renumbered one.
func (s *Service) Recompute(ctx context.Context, categoryID string, dryRun bool) (RecomputeReport, error) {
	var report RecomputeReport

	root, err := s.schema.GetCategory(ctx, categoryID)
	if err != nil {
		return report, err
	}
	bindings, err := s.schema.BindingsByCategory(ctx)
	if err != nil {
		return report, err
	}
	categories, err := s.schema.ListCategories(ctx)
	if err != nil {
		return report, err
	}
	catByID := make(map[string]model.Category, len(categories))
	for _, c := range categories {
		catByID[c.ID] = c
	}
	// Models are loaded in one go rather than per asset: a subtree recompute
	// touches thousands of rows and a lookup per row is the classic N+1.
	models, err := s.schema.ListModels(ctx)
	if err != nil {
		return report, err
	}
	modelByID := make(map[string]model.ProductModel, len(models))
	for _, m := range models {
		modelByID[m.ID] = m
	}

	rows, err := s.db.ReadDB().QueryContext(ctx,
		`SELECT a.id, a.category_id, a.model_id, a.attrs
		 FROM assets a JOIN categories c ON c.id = a.category_id
		 WHERE c.path LIKE ? || '%'
		 ORDER BY a.created_at, a.id`, root.Path)
	if err != nil {
		return report, fmt.Errorf("load subtree assets: %w", err)
	}
	defer rows.Close()

	type change struct {
		id     string
		attrs  map[string]any
		unique map[string]UniqueValue
	}
	var changes []change
	// Values that will exist once the run completes, so a collision between two
	// recomputed assets is caught as well as one against an untouched row.
	// Keyed by scope as well: the same value under two categories is no longer
	// a collision.
	claimed := map[[3]string][]string{}

	for rows.Next() {
		var id, catID, attrsJSON string
		var modelID sql.NullString
		if err := rows.Scan(&id, &catID, &modelID, &attrsJSON); err != nil {
			return report, err
		}
		report.Total++

		attrs, err := store.UnmarshalJSONMap(attrsJSON)
		if err != nil {
			return report, err
		}
		cat := catByID[catID]
		fields, err := schema.Resolve(cat.Path, bindings)
		if err != nil {
			return report, err
		}
		fields = schema.ActiveFields(fields)

		var modelName, modelVendor string
		if modelID.Valid {
			if pm, ok := modelByID[modelID.String]; ok {
				modelName, modelVendor = pm.Name, pm.Vendor
			}
		}

		before := make(map[string]any, len(attrs))
		for k, v := range attrs {
			before[k] = v
		}
		values, err := evalComputed(fields, compute.NewContext(id, attrs, cat.Code, cat.Name, modelName, modelVendor))
		if err != nil {
			return report, err
		}

		display := model.AssetDisplayName(id, before, cat.DisplayKey)
		dirty := false
		keys := make([]string, 0, len(values))
		for k := range values {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		for _, k := range keys {
			from, to := fmt.Sprintf("%v", before[k]), fmt.Sprintf("%v", values[k])
			if from == to {
				continue
			}
			dirty = true
			attrs[k] = values[k]
			if len(report.Samples) < maxSamples {
				report.Samples = append(report.Samples, RecomputeSample{Asset: display, Key: k, From: from, To: to})
			}
		}

		next := uniqueValues(fields, attrs, catID)
		for k, uv := range next {
			at := [3]string{uv.Scope, k, uv.Value}
			claimed[at] = append(claimed[at], display)
		}
		if dirty {
			changes = append(changes, change{id: id, attrs: attrs, unique: next})
		}
	}
	if err := rows.Err(); err != nil {
		return report, err
	}
	report.Affected = len(changes)

	for at, owners := range claimed {
		if len(owners) > 1 {
			report.Conflicts = append(report.Conflicts, Conflict{Key: at[1], Value: at[2], Assets: owners})
		}
	}
	if err := s.collideWithUntouched(ctx, root.Path, claimed, &report); err != nil {
		return report, err
	}
	sortConflicts(report.Conflicts)

	if dryRun || len(report.Conflicts) > 0 || report.Affected == 0 {
		return report, nil
	}

	now := time.Now().UTC()
	err = s.db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		for _, c := range changes {
			attrsJSON, err := store.MarshalJSONMap(c.attrs)
			if err != nil {
				return err
			}
			if _, err := tx.ExecContext(ctx,
				`UPDATE assets SET attrs = ?, version = version + 1, updated_at = ? WHERE id = ?`,
				attrsJSON, store.FormatTime(now), c.id); err != nil {
				return err
			}
			// The partial unique index is the last line of defence; a violation
			// here aborts the whole transaction, which is the intended
			// behaviour.
			if err := syncUniqueValues(ctx, tx, c.id, c.unique, now); err != nil {
				return fmt.Errorf("%w: %v", ErrRecomputeConflict, err)
			}
		}
		return nil
	})
	if err != nil {
		return report, err
	}
	report.Applied = true
	return report, nil
}

// collideWithUntouched checks the proposed values against assets outside the
// subtree.
//
// Retired values are deliberately not checked: an archived row leaves the
// partial unique index, so a value that was replaced is free to appear again.
// A mainboard swap really does move a MAC from one device to another.
func (s *Service) collideWithUntouched(ctx context.Context, rootPath string,
	claimed map[[3]string][]string, report *RecomputeReport) error {

	for at, owners := range claimed {
		var otherID string
		err := s.db.ReadDB().QueryRowContext(ctx,
			`SELECT uv.asset_id FROM asset_unique_values uv
			 JOIN assets a ON a.id = uv.asset_id
			 JOIN categories c ON c.id = a.category_id
			 WHERE uv.scope_id = ? AND uv.field_key = ? AND uv.value = ? AND uv.archived_at IS NULL
			   AND c.path NOT LIKE ? || '%' LIMIT 1`, at[0], at[1], at[2], rootPath).Scan(&otherID)
		if err == nil {
			report.Conflicts = append(report.Conflicts,
				Conflict{Key: at[1], Value: at[2], Assets: append(owners, model.ShortID(otherID))})
			continue
		}
		if !errors.Is(err, sql.ErrNoRows) {
			return err
		}
	}
	return nil
}

// sortConflicts gives the report a stable order; map iteration would otherwise
// shuffle it between identical runs and make the dry run look unrepeatable.
func sortConflicts(cs []Conflict) {
	sort.Slice(cs, func(i, j int) bool {
		if cs[i].Key != cs[j].Key {
			return cs[i].Key < cs[j].Key
		}
		return cs[i].Value < cs[j].Value
	})
}

// RecomputeField re-evaluates every asset a field's expression can reach.
//
// A binding covers the category it is made on and everything beneath it, so
// the work is one subtree run per bound category, with descendants dropped --
// an ancestor's run already covered them.
//
// The dry run over every subtree happens before any of them is applied. A
// conflict in the third warehouse must stop the first two from being written,
// for the same reason a single subtree is one transaction: half a renumbering
// is worse than none.
func (s *Service) RecomputeField(ctx context.Context, fieldID string, dryRun bool) (RecomputeReport, error) {
	var merged RecomputeReport

	roots, err := s.categoriesBinding(ctx, fieldID)
	if err != nil {
		return merged, err
	}

	for _, id := range roots {
		r, err := s.Recompute(ctx, id, true)
		if err != nil {
			return merged, err
		}
		merge(&merged, r)
	}
	if dryRun || len(merged.Conflicts) > 0 || merged.Affected == 0 {
		return merged, nil
	}

	// The second pass writes. Its numbers replace the dry run's rather than
	// adding to them, or every asset would be counted twice.
	var applied RecomputeReport
	for _, id := range roots {
		r, err := s.Recompute(ctx, id, false)
		if err != nil {
			return applied, err
		}
		merge(&applied, r)
	}
	applied.Applied = len(applied.Conflicts) == 0
	return applied, nil
}

// categoriesBinding lists the categories whose own binding carries the field,
// dropping any that another one already contains.
func (s *Service) categoriesBinding(ctx context.Context, fieldID string) ([]string, error) {
	bindings, err := s.schema.BindingsByCategory(ctx)
	if err != nil {
		return nil, err
	}
	categories, err := s.schema.ListCategories(ctx)
	if err != nil {
		return nil, err
	}
	pathOf := make(map[string]string, len(categories))
	for _, c := range categories {
		pathOf[c.ID] = c.Path
	}

	var bound []string
	for catID, bs := range bindings {
		for _, b := range bs {
			if b.Field.ID == fieldID {
				bound = append(bound, catID)
				break
			}
		}
	}
	sort.Slice(bound, func(i, j int) bool { return pathOf[bound[i]] < pathOf[bound[j]] })

	var roots []string
	for _, id := range bound {
		covered := false
		for _, r := range roots {
			if strings.HasPrefix(pathOf[id], pathOf[r]) {
				covered = true
				break
			}
		}
		if !covered {
			roots = append(roots, id)
		}
	}
	return roots, nil
}

// merge folds one subtree's report into the running total.
func merge(into *RecomputeReport, r RecomputeReport) {
	into.Affected += r.Affected
	into.Total += r.Total
	into.Conflicts = append(into.Conflicts, r.Conflicts...)
	for _, s := range r.Samples {
		if len(into.Samples) >= maxSamples {
			break
		}
		into.Samples = append(into.Samples, s)
	}
}
