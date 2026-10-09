package schema

import (
	"context"
	"errors"
	"reflect"
	"testing"

	"github.com/klskk23/nexus-assets/internal/store"
)

func TestCategoryConfirmationStaleTokenPrecedesNewIssues(t *testing.T) {
	s, ctx := newStore(t)
	seedSnapshot(t, s, ctx)
	ids := []string{}
	preview, err := s.PreviewCategory(ctx, "child", CategoryDraft{InheritedFieldIDs: &ids})
	if err != nil || preview.ConfirmationToken == "" {
		t.Fatalf("preview=%+v err=%v", preview, err)
	}
	// A separately committed metadata edit now makes the previously valid
	// withdrawal illegal. The old authority must be rejected as stale, not 400.
	key := "tag"
	if _, err := s.UpdateCategory(ctx, "leaf", UpdateCategoryInput{DisplayKey: &key}); err != nil {
		t.Fatal(err)
	}
	before := selectionState(t, s, ctx)
	category, err := s.GetCategory(ctx, "child")
	if err != nil {
		t.Fatal(err)
	}
	_, err = s.UpdateCategory(ctx, "child", UpdateCategoryInput{InheritedFieldIDs: &ids, ConfirmationToken: preview.ConfirmationToken})
	if !errors.Is(err, ErrImpactStale) {
		t.Fatalf("signed stale draft with new issues = %v, want impact_stale", err)
	}
	after, err := s.GetCategory(ctx, "child")
	if err != nil {
		t.Fatal(err)
	}
	if before != selectionState(t, s, ctx) || !reflect.DeepEqual(category, after) {
		t.Fatal("stale confirmation wrote metadata")
	}
	_, err = s.UpdateCategory(ctx, "child", UpdateCategoryInput{InheritedFieldIDs: &ids})
	if err == nil || errors.Is(err, ErrImpactStale) || errors.Is(err, ErrConfirmationRequired) {
		t.Fatalf("unsigned invalid draft lost business issue priority: %v", err)
	}
}

func TestCategoryConfirmationRejectsOperationAndTargetReplay(t *testing.T) {
	for _, scenario := range []string{"operation", "target", "parent_presence"} {
		t.Run(scenario, func(t *testing.T) {
			s, ctx := newStore(t)
			seedSnapshot(t, s, ctx)
			ids := []string{}
			draft := CategoryDraft{InheritedFieldIDs: &ids}
			var token string
			// Keep identical resolved state and vary exactly one authority dimension.
			// These tokens are genuinely signed with the store key, not random garbage.
			err := s.db.ReadTx(ctx, func(ctx context.Context, q store.Querier) error {
				plan, err := s.planCategory(ctx, q, "child", draft)
				if err != nil {
					return err
				}
				control, err := s.signCategoryPlan(ctx, q, "category", "child", draft, plan)
				if err != nil {
					return err
				}
				if control == "" || control != plan.preview.ConfirmationToken {
					t.Fatal("control signature does not authorize the unchanged plan")
				}
				operation, target := "category", "child"
				switch scenario {
				case "operation":
					operation = "unbind_category_field"
				case "target":
					target = "leaf"
				case "parent_presence":
					var parent *string
					draft.ParentID = &parent
				}
				token, err = s.signCategoryPlan(ctx, q, operation, target, draft, plan)
				return err
			})
			if err != nil {
				t.Fatal(err)
			}
			before := selectionState(t, s, ctx)
			_, err = s.UpdateCategory(ctx, "child", UpdateCategoryInput{InheritedFieldIDs: &ids, ConfirmationToken: token})
			if !errors.Is(err, ErrImpactStale) {
				t.Fatalf("%s replay accepted: %v", scenario, err)
			}
			if before != selectionState(t, s, ctx) {
				t.Fatal("replayed token wrote selections")
			}
		})
	}
}

func TestCategoryConfirmationParentNullDiffersFromOmission(t *testing.T) {
	s, ctx := newStore(t)
	seedSnapshot(t, s, ctx)
	ids := []string{}
	var parent *string
	omitted, err := s.PreviewCategory(ctx, "child", CategoryDraft{InheritedFieldIDs: &ids})
	if err != nil {
		t.Fatal(err)
	}
	detached, err := s.PreviewCategory(ctx, "child", CategoryDraft{ParentID: &parent, InheritedFieldIDs: &ids})
	if err != nil {
		t.Fatal(err)
	}
	if omitted.ConfirmationToken == "" || detached.ConfirmationToken == "" || omitted.ConfirmationToken == detached.ConfirmationToken {
		t.Fatalf("presence not signed: omitted=%+v null=%+v", omitted, detached)
	}
	before := selectionState(t, s, ctx)
	_, err = s.UpdateCategory(ctx, "child", UpdateCategoryInput{ParentID: &parent, InheritedFieldIDs: &ids, ConfirmationToken: omitted.ConfirmationToken})
	if !errors.Is(err, ErrImpactStale) {
		t.Fatalf("omitted token authorized parent null: %v", err)
	}
	if before != selectionState(t, s, ctx) {
		t.Fatal("parent replay wrote selections")
	}
	cat, err := s.UpdateCategory(ctx, "child", UpdateCategoryInput{ParentID: &parent, InheritedFieldIDs: &ids, ConfirmationToken: detached.ConfirmationToken})
	if err != nil || cat.ParentID != nil {
		t.Fatalf("confirmed explicit null=%+v err=%v", cat, err)
	}
}
