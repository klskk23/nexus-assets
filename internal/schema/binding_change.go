package schema

import (
	"context"
	"database/sql"
	"fmt"
	"maps"
	"slices"
	"strings"

	"github.com/klskk23/nexus-assets/internal/i18n"
	"github.com/klskk23/nexus-assets/internal/store"
)

// PreviewUnbind removes only the requested direct source in a read-only overlay.
func (s *Store) PreviewUnbind(ctx context.Context, categoryID, fieldID string) (CategoryPreview, error) {
	var preview CategoryPreview
	err := s.db.ReadTx(ctx, func(ctx context.Context, q store.Querier) error {
		plan, err := s.planUnbind(ctx, q, categoryID, fieldID)
		preview = plan.preview
		return err
	})
	return preview, err
}

// UnbindConfirmed replans and checks authority before the first persistent write.
func (s *Store) UnbindConfirmed(ctx context.Context, categoryID, fieldID, token string) error {
	return s.db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		plan, err := s.planUnbind(ctx, tx, categoryID, fieldID)
		if err != nil {
			return err
		}
		if token != "" {
			if err := checkConfirmation(plan.preview, token); err != nil {
				return err
			}
		}
		if len(plan.preview.Issues) != 0 {
			return plan.preview.Issues[0].Message
		}
		if err := checkConfirmation(plan.preview, token); err != nil {
			return err
		}
		if len(plan.preview.Changes) == 0 {
			return nil
		}
		if _, err := tx.ExecContext(ctx, `DELETE FROM category_fields WHERE category_id=? AND field_id=?`, categoryID, fieldID); err != nil {
			return err
		}
		for _, id := range plan.after.categoryIDs() {
			if !maps.Equal(plan.before.selections[id], plan.after.selections[id]) {
				if err := replaceCategorySelections(ctx, tx, id, plan.after.selections[id]); err != nil {
					return err
				}
			}
		}
		if plan.effects != nil {
			return plan.effects.Apply(ctx, tx)
		}
		return nil
	})
}

func (s *Store) planUnbind(ctx context.Context, q store.Querier, categoryID, fieldID string) (categoryPlan, error) {
	var plan categoryPlan
	var err error
	plan.before, err = LoadSchemaSnapshot(ctx, q)
	if err != nil {
		return plan, err
	}
	cat, exists := plan.before.categories[categoryID]
	if !exists {
		return plan, ErrNotFound
	}
	if _, exists := plan.before.fields[fieldID]; !exists {
		return plan, ErrNotFound
	}
	plan.after = plan.before.overlay()
	// DeleteFunc clears the removed tail, so a map clone alone is not isolation.
	bindings := slices.Clone(plan.before.bindings[categoryID])
	plan.after.bindings[categoryID] = slices.DeleteFunc(bindings, func(b Binding) bool { return b.Field.ID == fieldID })
	if len(bindings) == len(plan.after.bindings[categoryID]) {
		plan.preview, err = projectCategory(plan.after, cat)
		return plan, err
	}
	if err := plan.after.pruneDescendants(categoryID); err != nil {
		return plan, err
	}
	plan.preview, err = projectCategory(plan.after, cat)
	if err != nil {
		return plan, err
	}
	if err := s.planBindingEffects(ctx, q, &plan, []string{categoryID}); err != nil {
		return plan, err
	}
	// Preserve the public unbind sentinel while exposing the precise issue code.
	for i := range plan.preview.Issues {
		issue := &plan.preview.Issues[i]
		if issue.Code == "dependencies_unmet" || issue.Code == "display_key_unbound" {
			blocker := causeMessage(issue.Message)
			if issue.Code == "dependencies_unmet" {
				blocker = i18n.M(i18n.KeyRefComputedKey, plan.after.fields[issue.FieldID].Label)
			}
			issue.Message = i18n.Wrap(ErrFieldDependedOn, i18n.KeyUnbindBlocked, blocker, plan.before.fields[fieldID].Key)
		}
	}
	err = s.prepareConfirmation(ctx, q, "unbind", categoryID+"/"+fieldID, CategoryDraft{}, &plan)
	return plan, err
}

// finishCategoryBindings checks the final set once, not each group member's
// intermediate state. The caller owns the transaction and rolls back on failure.
func (s *Store) finishCategoryBindings(ctx context.Context, tx *sql.Tx, before *SchemaSnapshot, categoryIDs []string) error {
	if len(categoryIDs) == 0 {
		return nil
	}
	after, err := LoadSchemaSnapshot(ctx, tx)
	if err != nil {
		return err
	}
	plan := categoryPlan{before: before, after: after}
	if err := s.planBindingEffects(ctx, tx, &plan, categoryIDs); err != nil {
		return err
	}
	if len(plan.preview.Issues) != 0 {
		return plan.preview.Issues[0].Message
	}
	if plan.effects != nil {
		return plan.effects.Apply(ctx, tx)
	}
	return nil
}

func (s *Store) planBindingEffects(ctx context.Context, q store.Querier, plan *categoryPlan, categoryIDs []string) error {
	for _, id := range bindingRoots(plan.after, categoryIDs) {
		changes, err := categoryDeltas(plan.before, plan.after, id)
		if err != nil {
			return err
		}
		plan.preview.Changes = append(plan.preview.Changes, changes...)
		issues, err := displayIssues(plan.after, id)
		if err != nil {
			return err
		}
		plan.preview.Issues = append(plan.preview.Issues, issues...)
		issues, err = computedIssues(plan.after, id)
		if err != nil {
			return err
		}
		plan.preview.Issues = append(plan.preview.Issues, issues...)
	}
	var err error
	plan.preview.AssetCount, err = changedAssetCount(ctx, q, plan.preview.Changes)
	if err != nil {
		return err
	}
	plan.effects, err = s.planAssetEffects(ctx, q, SchemaChange{Before: plan.before, After: plan.after, Changes: plan.preview.Changes}, plan.preview.AssetCount)
	if err != nil {
		return fmt.Errorf("plan binding effects: %w", err)
	}
	if plan.effects != nil {
		plan.preview.Issues = append(plan.preview.Issues, plan.effects.Issues...)
	}
	return nil
}

func bindingRoots(snapshot *SchemaSnapshot, ids []string) []string {
	roots := []string{}
	selected := make(map[string]bool, len(ids))
	for _, id := range ids {
		selected[id] = true
	}
	ordered := snapshot.categoryIDs()
	slices.SortFunc(ordered, func(a, b string) int {
		return strings.Compare(snapshot.categories[a].Path, snapshot.categories[b].Path)
	})
	for _, id := range ordered {
		if !selected[id] {
			continue
		}
		covered := slices.ContainsFunc(roots, func(root string) bool {
			return strings.HasPrefix(snapshot.categories[id].Path, snapshot.categories[root].Path)
		})
		if !covered {
			roots = append(roots, id)
		}
	}
	return roots
}
