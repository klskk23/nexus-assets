package schema

import (
	"context"
	"database/sql"
	"encoding/json"
	"maps"
	"slices"
	"time"

	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/store"
)

// saveCategory always replans in the write transaction. A previous preview is
// not authority to persist a draft against a different schema or asset state.
func (s *Store) saveCategory(ctx context.Context, id string, draft CategoryDraft) (model.Category, error) {
	var out model.Category
	err := s.db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		plan, err := s.planCategory(ctx, tx, id, draft)
		if err != nil {
			return err
		}
		// An old token must be rejected as stale even when concurrent changes
		// make the draft invalid. Unsigned drafts keep business-error priority.
		if draft.ConfirmationToken != "" {
			if err := checkConfirmation(plan.preview, draft.ConfirmationToken); err != nil {
				return err
			}
		}
		if len(plan.preview.Issues) != 0 {
			return plan.preview.Issues[0].Message
		}
		if err := checkConfirmation(plan.preview, draft.ConfirmationToken); err != nil {
			return err
		}
		cat, err := persistCategoryPlan(ctx, tx, id, plan)
		if err != nil {
			return err
		}
		if plan.effects != nil {
			if err := plan.effects.Apply(ctx, tx); err != nil {
				return err
			}
		}
		out = cat
		return nil
	})
	if err != nil {
		return model.Category{}, err
	}
	return out, nil
}

func persistCategoryPlan(ctx context.Context, tx *sql.Tx, id string, plan categoryPlan) (model.Category, error) {
	cat := plan.preview.Category
	now := time.Now().UTC()
	cat.UpdatedAt = now
	if id == "" {
		cat.ID = store.NewID()
		cat.CreatedAt = now
		parentPath := ""
		if cat.ParentID != nil {
			parentPath = plan.after.categories[*cat.ParentID].Path
		}
		cat.Path = BuildPath(parentPath, cat.ID)
	}
	if err := writeCategoryMetadata(ctx, tx, cat, id == ""); err != nil {
		return model.Category{}, err
	}
	if err := replaceCategorySelections(ctx, tx, cat.ID, plan.after.selections[plan.preview.Category.ID]); err != nil {
		return model.Category{}, err
	}
	for _, childID := range plan.after.categoryIDs() {
		if childID == plan.preview.Category.ID {
			continue
		}
		before, exists := plan.before.categories[childID]
		after := plan.after.categories[childID]
		if !exists {
			continue
		}
		if before.Path != after.Path {
			if _, err := tx.ExecContext(ctx, `UPDATE categories SET path = ?, updated_at = ? WHERE id = ?`, after.Path, store.FormatTime(now), childID); err != nil {
				return model.Category{}, err
			}
		}
		if !maps.Equal(plan.before.selections[childID], plan.after.selections[childID]) {
			if err := replaceCategorySelections(ctx, tx, childID, plan.after.selections[childID]); err != nil {
				return model.Category{}, err
			}
		}
	}
	return cat, nil
}

func writeCategoryMetadata(ctx context.Context, tx *sql.Tx, cat model.Category, create bool) error {
	presets, err := json.Marshal(cat.PrintPresetIDs)
	if err != nil {
		return err
	}
	if create {
		_, err = tx.ExecContext(ctx, `INSERT INTO categories
			(id, code, name, parent_id, path, display_key, print_preset_ids, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, cat.ID, cat.Code, cat.Name,
			store.NullString(cat.ParentID), cat.Path, store.NullString(nilIfEmpty(cat.DisplayKey)), string(presets),
			store.FormatTime(cat.CreatedAt), store.FormatTime(cat.UpdatedAt))
		return err
	}
	_, err = tx.ExecContext(ctx, `UPDATE categories SET name = ?, parent_id = ?, path = ?,
		display_key = ?, print_preset_ids = ?, updated_at = ? WHERE id = ?`, cat.Name,
		store.NullString(cat.ParentID), cat.Path, store.NullString(nilIfEmpty(cat.DisplayKey)), string(presets),
		store.FormatTime(cat.UpdatedAt), cat.ID)
	return err
}

func replaceCategorySelections(ctx context.Context, tx *sql.Tx, id string, selected map[string]bool) error {
	if _, err := tx.ExecContext(ctx, `DELETE FROM category_field_selections WHERE category_id = ?`, id); err != nil {
		return err
	}
	for _, fieldID := range slices.Sorted(maps.Keys(selected)) {
		if _, err := tx.ExecContext(ctx, `INSERT INTO category_field_selections (category_id, field_id) VALUES (?, ?)`, id, fieldID); err != nil {
			return err
		}
	}
	return nil
}
