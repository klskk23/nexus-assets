package schema

import (
	"context"
	"database/sql"
	"errors"
	"reflect"
	"testing"

	"github.com/klskk23/nexus-assets/internal/store"
)

func TestInheritanceCreatePersistsCompleteDraft(t *testing.T) {
	s, ctx := newStore(t)
	seedSnapshot(t, s, ctx)
	parent := "root"
	ids := []string{"b", "a", "a"}
	presets := []string{"label-large", "label-small"}
	cat, err := s.CreateCategory(ctx, CreateCategoryInput{
		Code: "NEW", Name: "New", ParentID: &parent, DisplayKey: "tag",
		InheritedFieldIDs: &ids, PrintPresetIDs: presets,
	})
	if err != nil {
		t.Fatal(err)
	}
	stored, err := s.GetCategory(ctx, cat.ID)
	if err != nil {
		t.Fatal(err)
	}
	if cat.ID == "draft" || cat.ID == "" || stored.Path != "/root/"+cat.ID+"/" || stored.DisplayKey != "tag" || !reflect.DeepEqual(stored.PrintPresetIDs, presets) {
		t.Fatalf("complete draft not persisted: %+v", stored)
	}
	preview, err := s.PreviewCategory(ctx, cat.ID, CategoryDraft{})
	if err != nil || !reflect.DeepEqual(preview.SelectedFieldIDs, []string{"a", "b"}) || !reflect.DeepEqual(fieldIDs(preview.Fields), []string{"a", "b"}) {
		t.Fatalf("created choices = %+v, err=%v", preview, err)
	}
}

func TestInheritanceCreatePresenceAndInvalidChoices(t *testing.T) {
	for _, tc := range []struct {
		name   string
		parent string
		ids    *[]string
		bad    bool
	}{
		{name: "omitted", parent: "root"},
		{name: "empty", parent: "root", ids: slicePointer([]string{})},
		{name: "null", parent: "root", ids: slicePointer(nil), bad: true},
		{name: "root selection", ids: slicePointer([]string{"a"}), bad: true},
		{name: "skip parent", parent: "child", ids: slicePointer([]string{"b"}), bad: true},
		{name: "unknown", parent: "root", ids: slicePointer([]string{"unknown"}), bad: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			s, ctx := newStore(t)
			seedSnapshot(t, s, ctx)
			before := selectionState(t, s, ctx)
			var parent *string
			if tc.parent != "" {
				parent = &tc.parent
			}
			cat, err := s.CreateCategory(ctx, CreateCategoryInput{Code: "NEW", Name: "New", ParentID: parent, InheritedFieldIDs: tc.ids})
			if tc.bad {
				if !errors.Is(err, ErrInheritanceSelection) || selectionState(t, s, ctx) != before {
					t.Fatalf("invalid create changed state or wrong error: %v", err)
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			fields, err := s.EffectiveFields(ctx, cat.ID)
			if err != nil || len(fields) != 0 {
				t.Fatalf("new child inherited automatically: %+v, err=%v", fields, err)
			}
		})
	}
}

func TestInheritanceUpdateAddsWithoutPropagatingAndPreservesOmitted(t *testing.T) {
	s, ctx := newStore(t)
	seedSnapshot(t, s, ctx)
	ids := []string{"b", "a", "a"}
	key, name := "note", "Edited child"
	presets := []string{"label"}
	_, err := s.UpdateCategory(ctx, "child", UpdateCategoryInput{Name: &name, DisplayKey: &key, PrintPresetIDs: &presets, InheritedFieldIDs: &ids})
	if err != nil {
		t.Fatal(err)
	}
	stored, err := s.GetCategory(ctx, "child")
	if err != nil {
		t.Fatal(err)
	}
	if stored.Name != name || stored.DisplayKey != key || !reflect.DeepEqual(stored.PrintPresetIDs, presets) {
		t.Fatalf("metadata not saved: %+v", stored)
	}
	for _, tc := range []struct {
		id   string
		want []string
	}{
		{id: "child", want: []string{"a", "b", "c"}},
		{id: "leaf", want: []string{"a", "c", "d"}},
	} {
		fields, err := s.EffectiveFields(ctx, tc.id)
		if err != nil || !reflect.DeepEqual(fieldIDs(fields), tc.want) {
			t.Fatalf("fields for %s = %+v, err=%v", tc.id, fields, err)
		}
	}
	name = "Rename only"
	if _, err := s.UpdateCategory(ctx, "child", UpdateCategoryInput{Name: &name}); err != nil {
		t.Fatal(err)
	}
	preview, err := s.PreviewCategory(ctx, "child", CategoryDraft{})
	if err != nil || !reflect.DeepEqual(preview.SelectedFieldIDs, []string{"a", "b"}) {
		t.Fatalf("omitted choices not retained: %+v err=%v", preview, err)
	}
}

func TestInheritanceUpdateRejectsInvalidFinalDraftAtomically(t *testing.T) {
	for _, tc := range []struct {
		name string
		ids  *[]string
		key  *string
		want error
	}{
		{name: "null", ids: slicePointer(nil), want: ErrInheritanceSelection},
		{name: "own field", ids: slicePointer([]string{"c"}), want: ErrInheritanceSelection},
		{name: "unknown", ids: slicePointer([]string{"missing"}), want: ErrInheritanceSelection},
		{name: "unselected display", key: strPointer("note"), want: ErrDisplayKeyInvalid},
		{name: "withdrawal needs confirmation", ids: slicePointer([]string{}), want: ErrConfirmationRequired},
	} {
		t.Run(tc.name, func(t *testing.T) {
			s, ctx := newStore(t)
			seedSnapshot(t, s, ctx)
			before := selectionState(t, s, ctx)
			name := "Must not persist"
			_, err := s.UpdateCategory(ctx, "child", UpdateCategoryInput{Name: &name, DisplayKey: tc.key, InheritedFieldIDs: tc.ids})
			if !errors.Is(err, tc.want) || selectionState(t, s, ctx) != before {
				t.Fatalf("rejected draft changed data or wrong error: %v", err)
			}
		})
	}
}

func TestInheritanceUpdateRefusesAssetEffectsBeforeWriting(t *testing.T) {
	s, ctx := newStore(t)
	seedSnapshot(t, s, ctx)
	seedAsset(t, s, ctx, "child", "asset-child", `{}`)
	before := selectionState(t, s, ctx)
	ids, name := []string{"a", "b"}, "Must not persist"
	_, err := s.UpdateCategory(ctx, "child", UpdateCategoryInput{Name: &name, InheritedFieldIDs: &ids})
	if !errors.Is(err, ErrSchemaEffectsUnavailable) || selectionState(t, s, ctx) != before {
		t.Fatalf("asset-affecting write accepted: %v", err)
	}
}

func TestInheritanceUpdateEmptyIDDoesNotCreate(t *testing.T) {
	s, ctx := newStore(t)
	seedSnapshot(t, s, ctx)
	before := selectionState(t, s, ctx)
	name := "Not a new category"
	if _, err := s.UpdateCategory(ctx, "", UpdateCategoryInput{Name: &name}); !errors.Is(err, ErrNotFound) {
		t.Fatalf("empty update target should be missing, got %v", err)
	}
	if selectionState(t, s, ctx) != before {
		t.Fatal("empty update target inserted a category")
	}
}

func TestInheritanceUpdateMovesEntireSubtreeWithRetainedIdentity(t *testing.T) {
	s, ctx := newStore(t)
	seedSnapshot(t, s, ctx)
	other, err := s.CreateCategory(ctx, CreateCategoryInput{Code: "OTHER", Name: "Other"})
	if err != nil {
		t.Fatal(err)
	}
	if err := s.Bind(ctx, other.ID, "a", 0); err != nil {
		t.Fatal(err)
	}
	parent := &other.ID
	if _, err := s.UpdateCategory(ctx, "child", UpdateCategoryInput{ParentID: &parent}); err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		id, path string
		ids      []string
	}{
		{id: "child", path: "/" + other.ID + "/child/", ids: []string{"a", "c"}},
		{id: "leaf", path: "/" + other.ID + "/child/leaf/", ids: []string{"a", "c", "d"}},
	} {
		cat, err := s.GetCategory(ctx, tc.id)
		if err != nil || cat.Path != tc.path {
			t.Fatalf("moved category = %+v, err=%v", cat, err)
		}
		fields, err := s.EffectiveFields(ctx, tc.id)
		if err != nil || !reflect.DeepEqual(fieldIDs(fields), tc.ids) || fields[0].InheritedFrom != other.ID {
			t.Fatalf("moved fields = %+v, err=%v", fields, err)
		}
	}
}

func TestInheritanceUpdateRejectsCyclesAndChainConflicts(t *testing.T) {
	for _, parentID := range []string{"child", "leaf", "missing", "sibling"} {
		t.Run(parentID, func(t *testing.T) {
			s, ctx := newStore(t)
			seedSnapshot(t, s, ctx)
			before := selectionState(t, s, ctx)
			parent := &parentID
			_, err := s.UpdateCategory(ctx, "child", UpdateCategoryInput{ParentID: &parent})
			if err == nil {
				t.Fatal("invalid move accepted")
			}
			if parentID == "sibling" && !errors.Is(err, ErrKeyConflict) {
				t.Fatalf("chain key collision = %v", err)
			}
			if selectionState(t, s, ctx) != before {
				t.Fatal("invalid move changed subtree")
			}
		})
	}
}

func TestInheritanceCreateRollsBackMetadataIfSelectionWriteFails(t *testing.T) {
	s, ctx := newStore(t)
	seedSnapshot(t, s, ctx)
	if err := s.db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `CREATE TRIGGER reject_new_selection BEFORE INSERT ON category_field_selections
			BEGIN SELECT RAISE(ABORT, 'injected selection failure'); END`)
		return err
	}); err != nil {
		t.Fatal(err)
	}
	before := selectionState(t, s, ctx)
	parent, ids := "root", []string{"a"}
	cat, err := s.CreateCategory(ctx, CreateCategoryInput{Code: "NEW", Name: "New", ParentID: &parent, InheritedFieldIDs: &ids})
	if err == nil || cat.ID != "" || selectionState(t, s, ctx) != before {
		t.Fatalf("partial create survived selection failure: category=%+v err=%v", cat, err)
	}
}

func TestInheritanceUpdateEffectFailureRollsBackWholeTransaction(t *testing.T) {
	s, ctx := newStore(t)
	seedSnapshot(t, s, ctx)
	seedAsset(t, s, ctx, "child", "asset-child", `{"tag":"ABC"}`)
	before := selectionState(t, s, ctx)
	var originalVersion int
	if err := s.db.ReadDB().QueryRowContext(ctx, `SELECT version FROM assets WHERE id = 'asset-child'`).Scan(&originalVersion); err != nil {
		t.Fatal(err)
	}
	failure := errors.New("injected apply failure")
	s = NewWithEffects(s.db, effectPlannerFunc(func(ctx context.Context, q store.Querier, change SchemaChange) (*AssetEffectPlan, error) {
		var selected int
		if err := q.QueryRowContext(ctx, `SELECT count(*) FROM category_field_selections WHERE category_id = 'child' AND field_id = 'b'`).Scan(&selected); err != nil {
			return nil, err
		}
		if selected != 0 {
			t.Fatal("planner observed metadata written before validation")
		}
		return &AssetEffectPlan{
			Assets: []AssetImpact{{ID: "asset-child", Version: originalVersion}},
			Apply: func(ctx context.Context, tx *sql.Tx) error {
				if err := tx.QueryRowContext(ctx, `SELECT count(*) FROM category_field_selections WHERE category_id = 'child' AND field_id = 'b'`).Scan(&selected); err != nil {
					return err
				}
				if selected != 1 {
					t.Fatal("effects did not receive the metadata write transaction")
				}
				if _, err := tx.ExecContext(ctx, `UPDATE assets SET version = version + 1 WHERE id = 'asset-child'`); err != nil {
					return err
				}
				return failure
			},
		}, nil
	}))
	ids, name := []string{"a", "b"}, "Must roll back"
	cat, err := s.UpdateCategory(ctx, "child", UpdateCategoryInput{Name: &name, InheritedFieldIDs: &ids})
	if !errors.Is(err, failure) || cat.ID != "" || selectionState(t, s, ctx) != before {
		t.Fatalf("failed effects committed metadata: category=%+v err=%v", cat, err)
	}
	var version int
	if err := s.db.ReadDB().QueryRowContext(ctx, `SELECT version FROM assets WHERE id = 'asset-child'`).Scan(&version); err != nil {
		t.Fatal(err)
	}
	if version != originalVersion {
		t.Fatalf("failed effects changed version: got %d want %d", version, originalVersion)
	}
}

func strPointer(s string) *string { return &s }
