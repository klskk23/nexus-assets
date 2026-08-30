package schema

import (
	"errors"
	"strings"
	"testing"
)

// One device can genuinely be both an SDWAN router and a spare. Forcing a
// choice between two correct answers only leads to the model being entered
// twice, and then to two copies of its defaults drifting apart.
func TestModelServesEveryCategoryItIsAssociatedWith(t *testing.T) {
	s, ctx := newStore(t)
	root, child := tree(t, s, ctx)

	m, err := s.CreateModel(ctx, CreateModelInput{
		Name: "X100", Vendor: "Acme", CategoryIDs: []string{root.ID, child.ID},
	})
	if err != nil {
		t.Fatalf("create model: %v", err)
	}
	got, err := s.GetModel(ctx, m.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(got.CategoryIDs) != 2 {
		t.Fatalf("category_ids = %v, want both", got.CategoryIDs)
	}

	for _, c := range []struct {
		name string
		path string
	}{{"root", root.Path}, {"child", child.Path}} {
		cands, err := s.CandidateModels(ctx, c.path)
		if err != nil {
			t.Fatal(err)
		}
		if len(cands) != 1 || cands[0].ID != m.ID {
			t.Errorf("%s should offer the model, got %+v", c.name, cands)
		}
	}
}

// Inheritance runs one way. A model on an ancestor reaches its descendants,
// matching how bound fields behave; a model attached to a child does not climb
// back up. With many-to-many available, making a model visible somewhere is an
// explicit act rather than an inference.
func TestModelCandidatesInheritDownwardsOnly(t *testing.T) {
	s, ctx := newStore(t)
	root, child := tree(t, s, ctx)

	onRoot, err := s.CreateModel(ctx, CreateModelInput{
		Name: "通用机", CategoryIDs: []string{root.ID},
	})
	if err != nil {
		t.Fatal(err)
	}
	onChild, err := s.CreateModel(ctx, CreateModelInput{
		Name: "专用机", CategoryIDs: []string{child.ID},
	})
	if err != nil {
		t.Fatal(err)
	}

	fromChild, err := s.CandidateModels(ctx, child.Path)
	if err != nil {
		t.Fatal(err)
	}
	if len(fromChild) != 2 {
		t.Errorf("the child should see both, got %d", len(fromChild))
	}

	fromRoot, err := s.CandidateModels(ctx, root.Path)
	if err != nil {
		t.Fatal(err)
	}
	if len(fromRoot) != 1 || fromRoot[0].ID != onRoot.ID {
		t.Errorf("the parent must not see a model attached to its child, got %+v", fromRoot)
	}
	_ = onChild
}

// A model name lives in its vendor's namespace: two vendors may both ship an
// X100, but one vendor never ships two.
func TestModelNameIsScopedToItsVendor(t *testing.T) {
	s, ctx := newStore(t)
	root, _ := tree(t, s, ctx)

	if _, err := s.CreateModel(ctx, CreateModelInput{
		Name: "X100", Vendor: "Acme", CategoryIDs: []string{root.ID},
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := s.CreateModel(ctx, CreateModelInput{
		Name: "X100", Vendor: "Beta", CategoryIDs: []string{root.ID},
	}); err != nil {
		t.Fatalf("two vendors may share a product name: %v", err)
	}
	if _, err := s.CreateModel(ctx, CreateModelInput{
		Name: "X100", Vendor: "Acme", CategoryIDs: []string{root.ID},
	}); err == nil {
		t.Fatal("the same vendor must not ship two products with one name")
	}

	// Import names models rather than carrying ids, so a shared name has to be
	// reported instead of resolved -- picking one would attach the wrong
	// hardware to a device and never say so.
	if _, err := s.ModelByName(ctx, "X100"); !errors.Is(err, ErrModelAmbiguous) {
		t.Errorf("want ErrModelAmbiguous, got %v", err)
	}
}

// A model may exist before it is placed anywhere. It simply appears in no
// entry form until it is associated with a category.
func TestModelWithNoCategoryIsNeverACandidate(t *testing.T) {
	s, ctx := newStore(t)
	root, _ := tree(t, s, ctx)

	if _, err := s.CreateModel(ctx, CreateModelInput{Name: "草稿"}); err != nil {
		t.Fatalf("a model with no category must still be creatable: %v", err)
	}
	cands, err := s.CandidateModels(ctx, root.Path)
	if err != nil {
		t.Fatal(err)
	}
	if len(cands) != 0 {
		t.Errorf("an unassociated model must not be offered, got %+v", cands)
	}
}

// A constraint violation is not a server error: the person filling in the form
// can fix it, so they have to be told what to fix.
func TestDuplicateModelIsReportedNotCrashed(t *testing.T) {
	s, ctx := newStore(t)
	root, _ := tree(t, s, ctx)

	if _, err := s.CreateModel(ctx, CreateModelInput{
		Name: "X100", Vendor: "Acme", CategoryIDs: []string{root.ID},
	}); err != nil {
		t.Fatal(err)
	}
	_, err := s.CreateModel(ctx, CreateModelInput{
		Name: "X100", Vendor: "Acme", CategoryIDs: []string{root.ID},
	})
	if !errors.Is(err, ErrModelDuplicate) {
		t.Fatalf("want ErrModelDuplicate, got %v", err)
	}
	if !strings.Contains(err.Error(), "Acme") || !strings.Contains(err.Error(), "X100") {
		t.Errorf("the message should name both, got %v", err)
	}

	// An unnamed vendor is still a namespace, and the message has to make sense
	// without a name to show.
	if _, err := s.CreateModel(ctx, CreateModelInput{Name: "S24", CategoryIDs: []string{root.ID}}); err != nil {
		t.Fatal(err)
	}
	_, err = s.CreateModel(ctx, CreateModelInput{Name: "S24", CategoryIDs: []string{root.ID}})
	if !errors.Is(err, ErrModelDuplicate) {
		t.Fatalf("want ErrModelDuplicate for the empty vendor too, got %v", err)
	}
	if !strings.Contains(err.Error(), "未填厂商") {
		t.Errorf("the message should say the vendor is blank, got %v", err)
	}
}
