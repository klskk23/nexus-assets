package schema

import (
	"context"
	"maps"
	"slices"
	"strings"

	"github.com/klskk23/nexus-assets/internal/i18n"
	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/store"
)

// PreviewCategory plans against a consistent read transaction. It neither
// acquires the writer nor uses temporary writes to simulate the draft.
func (s *Store) PreviewCategory(ctx context.Context, id string, draft CategoryDraft) (CategoryPreview, error) {
	var result CategoryPreview
	err := s.db.ReadTx(ctx, func(ctx context.Context, q store.Querier) error {
		plan, err := s.planCategory(ctx, q, id, draft)
		result = plan.preview
		return err
	})
	return result, err
}

type categoryPlan struct {
	preview CategoryPreview
	before  *SchemaSnapshot
	after   *SchemaSnapshot
	effects *AssetEffectPlan
}

func (s *Store) planCategory(ctx context.Context, q store.Querier, id string, draft CategoryDraft) (categoryPlan, error) {
	var plan categoryPlan
	var err error
	plan.before, err = LoadSchemaSnapshot(ctx, q)
	if err != nil {
		return plan, err
	}
	plan.preview, plan.after, err = previewCategory(plan.before, id, draft)
	if err != nil {
		return plan, err
	}
	for i := range plan.preview.Issues {
		issue := &plan.preview.Issues[i]
		if issue.Code == "display_key_unbound" {
			issue.Message, err = displayKeyError(ctx, q, issue.FieldKey)
			if err != nil {
				return plan, err
			}
		}
	}
	if current, exists := plan.before.categories[id]; exists && !sameParent(current.ParentID, plan.preview.Category.ParentID) {
		issue, err := categoryMoveIssue(ctx, q, current)
		if err != nil {
			return plan, err
		}
		if issue != nil {
			plan.preview.Issues = append(plan.preview.Issues, *issue)
		}
	}
	plan.preview.AssetCount, err = changedAssetCount(ctx, q, plan.preview.Changes)
	if err != nil {
		return plan, err
	}
	plan.effects, err = s.planAssetEffects(ctx, q, SchemaChange{
		Before: plan.before, After: plan.after, Changes: plan.preview.Changes,
	}, plan.preview.AssetCount)
	if err != nil {
		return plan, err
	}
	if plan.effects != nil {
		plan.preview.Issues = append(plan.preview.Issues, plan.effects.Issues...)
	}
	if err := s.prepareConfirmation(ctx, q, "category", id, draft, &plan); err != nil {
		return plan, err
	}
	return plan, nil
}

func categoryMoveIssue(ctx context.Context, q store.Querier, cat model.Category) (*ChangeIssue, error) {
	var count int
	if err := q.QueryRowContext(ctx, `SELECT count(*) FROM assets a
		JOIN categories c ON c.id = a.category_id WHERE c.path LIKE ? || '%'`, cat.Path).Scan(&count); err != nil {
		return nil, err
	}
	if count == 0 {
		return nil, nil
	}
	return &ChangeIssue{
		Code: "category_has_assets", CategoryID: cat.ID,
		Message: i18n.Wrap(ErrCategoryHasAssets, i18n.KeyCategoryHasAssetsMove, cat.Name, count),
	}, nil
}

func previewCategory(before *SchemaSnapshot, id string, draft CategoryDraft) (CategoryPreview, *SchemaSnapshot, error) {
	var result CategoryPreview
	cat, err := before.draftCategory(id, draft)
	if err != nil {
		return result, nil, err
	}
	after := before.overlay()
	after.categories[cat.ID] = cat
	if old, exists := before.categories[id]; exists && old.Path != cat.Path {
		for childID, child := range after.categories {
			if childID != id && strings.HasPrefix(child.Path, old.Path) {
				child.Path = cat.Path + strings.TrimPrefix(child.Path, old.Path)
				after.categories[childID] = child
			}
		}
	}
	if err := after.selectDraftFields(cat, draft); err != nil {
		return result, nil, err
	}
	if err := after.pruneDescendants(cat.ID); err != nil {
		return result, nil, err
	}
	result, err = projectCategory(after, cat)
	if err != nil {
		return result, nil, err
	}
	result.Changes, err = categoryDeltas(before, after, cat.ID)
	if err != nil {
		return result, nil, err
	}
	result.Issues, err = displayIssues(after, cat.ID)
	if err != nil {
		return result, nil, err
	}
	dependencies, err := computedIssues(after, cat.ID)
	result.Issues = append(result.Issues, dependencies...)
	return result, after, err
}

// overlay copies every mutable map. Definitions and device caches are immutable
// after loading; category field caches must start empty after a draft change.
func (s *SchemaSnapshot) overlay() *SchemaSnapshot {
	out := &SchemaSnapshot{
		categories: maps.Clone(s.categories), fields: s.fields,
		models: s.models, vendors: s.vendors, bindings: maps.Clone(s.bindings),
		selections: make(map[string]map[string]bool, len(s.selections)),
		device:     s.device, deviceByModel: s.deviceByModel,
		modelBindings: s.modelBindings, vendorBindings: s.vendorBindings,
		categoryFields: make(map[string][]model.BoundField),
	}
	for id, selected := range s.selections {
		out.selections[id] = maps.Clone(selected)
	}
	return out
}

func projectCategory(after *SchemaSnapshot, cat model.Category) (CategoryPreview, error) {
	result := CategoryPreview{
		Category: cat, SelectedFieldIDs: []string{},
		Candidates: []InheritanceCandidate{}, Changes: []FieldDelta{},
	}
	for id := range after.selections[cat.ID] {
		result.SelectedFieldIDs = append(result.SelectedFieldIDs, id)
	}
	slices.Sort(result.SelectedFieldIDs)
	if cat.ParentID != nil {
		fields, err := after.EffectiveFields(*cat.ParentID)
		if err != nil {
			return result, err
		}
		for _, f := range fields {
			result.Candidates = append(result.Candidates, InheritanceCandidate{
				Field: f.FieldDefinition, SourceCategoryID: fieldSource(*cat.ParentID, f),
				Selected: after.selections[cat.ID][f.ID],
			})
		}
	}
	var err error
	result.Fields, err = after.EffectiveFields(cat.ID)
	return result, err
}

func categoryDeltas(before, after *SchemaSnapshot, rootID string) ([]FieldDelta, error) {
	changes := []FieldDelta{}
	for _, id := range after.categoryIDs() {
		if !strings.HasPrefix(after.categories[id].Path, after.categories[rootID].Path) {
			continue
		}
		var oldFields []model.BoundField
		if _, exists := before.categories[id]; exists {
			var err error
			oldFields, err = before.EffectiveFields(id)
			if err != nil {
				return nil, err
			}
		}
		newFields, err := after.EffectiveFields(id)
		if err != nil {
			return nil, err
		}
		changes = append(changes, diffFields(id, oldFields, newFields)...)
	}
	return changes, nil
}

func displayIssues(after *SchemaSnapshot, rootID string) ([]ChangeIssue, error) {
	issues := []ChangeIssue{}
	for _, id := range after.categoryIDs() {
		cat := after.categories[id]
		if !strings.HasPrefix(cat.Path, after.categories[rootID].Path) || cat.DisplayKey == "" {
			continue
		}
		fields, err := after.EffectiveFields(id)
		if err != nil {
			return nil, err
		}
		if !slices.ContainsFunc(fields, func(f model.BoundField) bool { return f.Key == cat.DisplayKey }) {
			issues = append(issues, ChangeIssue{
				Code: "display_key_unbound", CategoryID: id, FieldKey: cat.DisplayKey,
				Message: i18n.Wrap(ErrDisplayKeyInvalid, i18n.KeyDisplayKeyUnbound, cat.DisplayKey),
			})
		}
	}
	return issues, nil
}

func diffFields(categoryID string, before, after []model.BoundField) []FieldDelta {
	oldByID := make(map[string]model.BoundField, len(before))
	newByID := make(map[string]model.BoundField, len(after))
	for _, f := range before {
		oldByID[f.ID] = f
	}
	for _, f := range after {
		newByID[f.ID] = f
	}
	changes := []FieldDelta{}
	for _, f := range before {
		if _, remains := newByID[f.ID]; !remains {
			changes = append(changes, FieldDelta{CategoryID: categoryID, FieldID: f.ID, Key: f.Key,
				Change: "removed", BeforeSourceCategoryID: fieldSource(categoryID, f)})
		}
	}
	for _, f := range after {
		old, exists := oldByID[f.ID]
		delta := FieldDelta{CategoryID: categoryID, FieldID: f.ID, Key: f.Key,
			AfterSourceCategoryID: fieldSource(categoryID, f)}
		switch {
		case !exists:
			delta.Change = "added"
		case fieldSource(categoryID, old) != delta.AfterSourceCategoryID:
			delta.Change = "source_changed"
			delta.BeforeSourceCategoryID = fieldSource(categoryID, old)
		default:
			continue
		}
		changes = append(changes, delta)
	}
	return changes
}
