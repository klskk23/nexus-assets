package schema

import (
	"context"
	"database/sql"
	"errors"
	"reflect"
	"testing"

	"github.com/klskk23/nexus-assets/internal/store"
)

func TestInheritancePreviewBlocksAssetChangesWithoutEffects(t *testing.T) {
	s, ctx := newStore(t)
	seedSnapshot(t, s, ctx)
	seedAsset(t, s, ctx, "child", "asset-child", `{"tag":"ABC"}`)
	seedAsset(t, s, ctx, "leaf", "asset-leaf", `{"tag":"DEF","ports":4}`)
	seedAsset(t, s, ctx, "sibling", "asset-unaffected", `{}`)
	before := selectionState(t, s, ctx)
	empty := []string{}
	preview, err := s.PreviewCategory(ctx, "child", CategoryDraft{InheritedFieldIDs: &empty})
	if err != nil {
		t.Fatal(err)
	}
	if len(preview.Issues) != 1 || preview.Issues[0].Code != "schema_effects_unavailable" {
		t.Fatalf("asset-affecting preview silently accepted without effects: %+v", preview.Issues)
	}
	if preview.AssetCount != 2 {
		t.Fatalf("affected assets = %d, want 2 distinct assets", preview.AssetCount)
	}
	if after := selectionState(t, s, ctx); after != before {
		t.Fatal("blocked preview changed persistent state")
	}
	name := "Renamed child"
	preview, err = s.PreviewCategory(ctx, "child", CategoryDraft{Name: &name})
	if err != nil || len(preview.Issues) != 0 {
		t.Fatalf("rename without field changes was blocked: issues=%+v err=%v", preview.Issues, err)
	}
}

// The planner must hand effects the final overlay and the same read transaction,
// retain their complete impact, and never run Apply while previewing.
func TestInheritancePreviewPlansEffectsWithoutApplying(t *testing.T) {
	s, ctx := newStore(t)
	seedSnapshot(t, s, ctx)
	seedAsset(t, s, ctx, "child", "asset-child", `{"tag":"ABC"}`)
	before := selectionState(t, s, ctx)
	applied := false
	s = NewWithEffects(s.db, effectPlannerFunc(func(ctx context.Context, q store.Querier, change SchemaChange) (*AssetEffectPlan, error) {
		oldFields, err := change.Before.EffectiveFields("child")
		if err != nil {
			return nil, err
		}
		newFields, err := change.After.EffectiveFields("child")
		if err != nil {
			return nil, err
		}
		if !reflect.DeepEqual(fieldIDs(oldFields), []string{"a", "c"}) || !reflect.DeepEqual(fieldIDs(newFields), []string{"c"}) {
			t.Fatalf("effects received wrong before/after: %v -> %v", fieldIDs(oldFields), fieldIDs(newFields))
		}
		want := []FieldDelta{
			{CategoryID: "child", FieldID: "a", Key: "tag", Change: "removed", BeforeSourceCategoryID: "root"},
			{CategoryID: "leaf", FieldID: "a", Key: "tag", Change: "removed", BeforeSourceCategoryID: "root"},
		}
		if !reflect.DeepEqual(change.Changes, want) {
			t.Fatalf("effects received incomplete changes: %+v", change.Changes)
		}
		var selected int
		if err := q.QueryRowContext(ctx, `SELECT count(*) FROM category_field_selections WHERE category_id = 'child' AND field_id = 'a'`).Scan(&selected); err != nil {
			return nil, err
		}
		if selected != 1 {
			t.Fatal("preview wrote the overlay before planning effects")
		}
		var version int
		if err := q.QueryRowContext(ctx, `SELECT version FROM assets WHERE id = 'asset-child'`).Scan(&version); err != nil {
			return nil, err
		}
		return &AssetEffectPlan{
			Assets: []AssetImpact{{ID: "asset-child", Version: version}},
			Apply: func(context.Context, *sql.Tx) error {
				applied = true
				return errors.New("preview must never apply effects")
			},
		}, nil
	}))
	empty := []string{}
	preview, err := s.PreviewCategory(ctx, "child", CategoryDraft{InheritedFieldIDs: &empty})
	if err != nil || len(preview.Issues) != 0 || preview.AssetCount != 1 {
		t.Fatalf("prepared effects were not used: preview=%+v err=%v", preview, err)
	}
	if applied || selectionState(t, s, ctx) != before {
		t.Fatal("preview applied effects or persisted its draft")
	}
}

func TestInheritancePreviewPropagatesEffectFailures(t *testing.T) {
	s, ctx := newStore(t)
	seedSnapshot(t, s, ctx)
	seedAsset(t, s, ctx, "child", "asset-child", `{}`)
	failure := errors.New("effect query failed")
	for _, tc := range []struct {
		name      string
		plan      *AssetEffectPlan
		err       error
		wantCode  string
		wantError error
	}{
		{name: "unavailable", err: ErrSchemaEffectsUnavailable, wantCode: "schema_effects_unavailable"},
		{name: "empty result", wantCode: "schema_effects_unavailable"},
		{name: "missing apply", plan: &AssetEffectPlan{}, wantCode: "schema_effects_unavailable"},
		{name: "missing impact", plan: &AssetEffectPlan{Apply: func(context.Context, *sql.Tx) error { return nil }}, wantCode: "schema_effects_unavailable"},
		{name: "query failure", err: failure, wantError: failure},
		{name: "blocked", plan: &AssetEffectPlan{Issues: []ChangeIssue{{Code: "restore_invalid", CategoryID: "child", FieldID: "a", FieldKey: "tag", Message: failure}}}, wantCode: "restore_invalid"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			configured := NewWithEffects(s.db, effectPlannerFunc(func(context.Context, store.Querier, SchemaChange) (*AssetEffectPlan, error) {
				return tc.plan, tc.err
			}))
			empty := []string{}
			before := selectionState(t, s, ctx)
			preview, err := configured.PreviewCategory(ctx, "child", CategoryDraft{InheritedFieldIDs: &empty})
			if !errors.Is(err, tc.wantError) {
				t.Fatalf("error = %v, want %v", err, tc.wantError)
			}
			if tc.wantCode != "" && (len(preview.Issues) != 1 || preview.Issues[0].Code != tc.wantCode) {
				t.Fatalf("effect failure lost: %+v", preview.Issues)
			}
			if selectionState(t, s, ctx) != before {
				t.Fatal("failed effect planning wrote the draft")
			}
		})
	}
}

func TestInheritancePreviewSkipsEffectsForUnaffectedAssets(t *testing.T) {
	s, ctx := newStore(t)
	seedSnapshot(t, s, ctx)
	seedAsset(t, s, ctx, "leaf", "asset-leaf", `{}`)
	s = NewWithEffects(s.db, effectPlannerFunc(func(context.Context, store.Querier, SchemaChange) (*AssetEffectPlan, error) {
		return nil, errors.New("unaffected assets must not be planned")
	}))
	choices := []string{"a", "b"}
	preview, err := s.PreviewCategory(ctx, "child", CategoryDraft{InheritedFieldIDs: &choices})
	if err != nil || len(preview.Issues) != 0 || preview.AssetCount != 0 {
		t.Fatalf("unaffected assets entered effects: preview=%+v err=%v", preview, err)
	}
}

type effectPlannerFunc func(context.Context, store.Querier, SchemaChange) (*AssetEffectPlan, error)

func (f effectPlannerFunc) Plan(ctx context.Context, q store.Querier, change SchemaChange) (*AssetEffectPlan, error) {
	return f(ctx, q, change)
}

func TestInheritancePreviewDoesNotCountUnchangedDescendants(t *testing.T) {
	s, ctx := newStore(t)
	seedSnapshot(t, s, ctx)
	seedAsset(t, s, ctx, "leaf", "asset-leaf", `{}`)
	// The child gains b, but the leaf has not selected it and remains unchanged.
	choices := []string{"a", "b"}
	preview, err := s.PreviewCategory(ctx, "child", CategoryDraft{InheritedFieldIDs: &choices})
	if err != nil || len(preview.Issues) != 0 {
		t.Fatalf("unaffected descendant asset blocked addition: issues=%+v err=%v", preview.Issues, err)
	}
}
