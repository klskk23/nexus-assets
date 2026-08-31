package schema

import (
	"errors"
	"strings"
	"testing"

	"github.com/klskk23/nexus-assets/internal/model"
)

func TestDeleteCategoryRemovesAnEmptyLeaf(t *testing.T) {
	s, ctx := newStore(t)
	root, child := tree(t, s, ctx)

	f, err := s.CreateField(ctx, CreateFieldInput{Key: "rack", Label: "机柜", Type: model.FieldText})
	if err != nil {
		t.Fatal(err)
	}
	if err := s.Bind(ctx, child.ID, f.ID, false, 10); err != nil {
		t.Fatal(err)
	}

	if _, _, err := s.DeleteCategory(ctx, child.ID); err != nil {
		t.Fatalf("an empty leaf must delete: %v", err)
	}
	if _, err := s.GetCategory(ctx, child.ID); !errors.Is(err, ErrNotFound) {
		t.Errorf("the category should be gone, got %v", err)
	}

	// The binding described what this category asked for and means nothing now.
	fields, err := s.EffectiveFields(ctx, root.ID)
	if err != nil {
		t.Fatal(err)
	}
	for _, bf := range fields {
		if bf.Key == "rack" {
			t.Error("the binding should have gone with the category")
		}
	}
	// The definition itself is global and survives.
	if _, err := s.GetField(ctx, f.ID); err != nil {
		t.Errorf("the field definition must survive: %v", err)
	}
}

// Deleting a subtree is a much larger act than the one being asked for.
func TestDeleteCategoryRefusedWhileItHasChildren(t *testing.T) {
	s, ctx := newStore(t)
	root, child := tree(t, s, ctx)

	blockers, total, err := s.DeleteCategory(ctx, root.ID)
	if !errors.Is(err, ErrCategoryHasChildren) {
		t.Fatalf("want ErrCategoryHasChildren, got %v", err)
	}
	if total != 1 || len(blockers) != 1 || blockers[0].ID != child.ID {
		t.Errorf("the child should be named, got %+v", blockers)
	}
	if blockers[0].Kind != "category" {
		t.Errorf("kind = %q, want category", blockers[0].Kind)
	}

	// Once the child is gone the parent follows.
	if _, _, err := s.DeleteCategory(ctx, child.ID); err != nil {
		t.Fatal(err)
	}
	if _, _, err := s.DeleteCategory(ctx, root.ID); err != nil {
		t.Fatalf("with no children left the parent must delete: %v", err)
	}
}

// Configuration that has produced data is not configuration any more.
func TestDeleteCategoryRefusedWhileAssetsExistAnywhereBeneath(t *testing.T) {
	s, ctx := newStore(t)
	root, child := tree(t, s, ctx)
	seedAsset(t, s, ctx, child.ID, "a1", `{"tag":"112394521950"}`)
	seedAsset(t, s, ctx, child.ID, "a2", `{"tag":"112394521951"}`)

	// The asset sits on the child, but the parent is refused too: the check
	// reaches the whole subtree, not just the node itself.
	if _, _, err := s.DeleteCategory(ctx, root.ID); !errors.Is(err, ErrCategoryHasChildren) {
		t.Fatalf("the child blocks first, got %v", err)
	}

	blockers, total, err := s.DeleteCategory(ctx, child.ID)
	if !errors.Is(err, ErrCategoryHasAssets) {
		t.Fatalf("want ErrCategoryHasAssets, got %v", err)
	}
	if total != 2 || len(blockers) != 2 {
		t.Errorf("blockers = %d of %d, want 2 of 2", len(blockers), total)
	}
	if blockers[0].Kind != "asset" {
		t.Errorf("kind = %q, want asset", blockers[0].Kind)
	}
	if !strings.Contains(err.Error(), "移到别处") {
		t.Errorf("the refusal should say what to do instead, got %v", err)
	}
}

// Attached models are detached rather than blocking. Refusing on them looked
// consistent with everything else, but nothing in the interface can detach a
// model from a category, so it was a refusal with no way to act on it.
func TestDeleteCategoryDetachesModelsRatherThanRefusing(t *testing.T) {
	s, ctx := newStore(t)
	root, child := tree(t, s, ctx)

	m, err := s.CreateModel(ctx, CreateModelInput{
		Name: "X100", Vendor: "Acme", CategoryIDs: []string{root.ID, child.ID},
	})
	if err != nil {
		t.Fatal(err)
	}

	// The interface has to be able to say what will happen before it happens.
	attached, err := s.ModelsAttached(ctx, child.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(attached) != 1 || attached[0].ID != m.ID || attached[0].Kind != "model" {
		t.Fatalf("ModelsAttached = %+v", attached)
	}

	if _, _, err := s.DeleteCategory(ctx, child.ID); err != nil {
		t.Fatalf("an attached model must not block the delete: %v", err)
	}

	// The model survives, minus that one association.
	got, err := s.GetModel(ctx, m.ID)
	if err != nil {
		t.Fatalf("the model itself must survive: %v", err)
	}
	if len(got.CategoryIDs) != 1 || got.CategoryIDs[0] != root.ID {
		t.Errorf("only the deleted category should be detached, got %v", got.CategoryIDs)
	}
}

// A model attached to nothing is an ordinary state -- the one it sits in
// before it is placed anywhere -- so losing its last category is allowed.
func TestDeleteCategoryMayLeaveAModelUnattached(t *testing.T) {
	s, ctx := newStore(t)
	_, child := tree(t, s, ctx)

	m, err := s.CreateModel(ctx, CreateModelInput{
		Name: "X100", Vendor: "Acme", CategoryIDs: []string{child.ID},
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := s.DeleteCategory(ctx, child.ID); err != nil {
		t.Fatal(err)
	}
	got, err := s.GetModel(ctx, m.ID)
	if err != nil {
		t.Fatalf("the model must survive: %v", err)
	}
	if len(got.CategoryIDs) != 0 {
		t.Errorf("category_ids = %v, want empty", got.CategoryIDs)
	}
}

func TestDeleteCategoryRequiresAKnownCategory(t *testing.T) {
	s, ctx := newStore(t)
	if _, _, err := s.DeleteCategory(ctx, "missing"); !errors.Is(err, ErrNotFound) {
		t.Errorf("want ErrNotFound, got %v", err)
	}
}
