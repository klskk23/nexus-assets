package schema

import (
	"context"
	"errors"
	"strings"
	"testing"
)

// Every model is offered under every category.
//
// Two tests stood here, both encoding the association 026 decided against and
// 029 removed. One pinned that a model served exactly the categories it was
// associated with; the other that the association inherited downwards only --
// a model on an ancestor reached its descendants, a model on a child did not
// climb back up. The rule they described is gone: a device of any category may
// be of any model, so there is one candidate list and it is all of them.
//
// Flipped rather than deleted, because the old behaviour is the one somebody
// would re-derive from the shape of the tables. Archived is the one thing that
// still takes a model off the list, and that is a property of the model.
func TestEveryModelIsACandidateEverywhere(t *testing.T) {
	s, ctx := newStore(t)
	tree(t, s, ctx)

	a, err := s.CreateModel(ctx, CreateModelInput{Name: "通用机"})
	if err != nil {
		t.Fatal(err)
	}
	b, err := s.CreateModel(ctx, CreateModelInput{
		Name: "X100", VendorID: vendorNamed(t, s, ctx, "Acme"),
	})
	if err != nil {
		t.Fatal(err)
	}

	cands, err := s.CandidateModels(ctx)
	if err != nil {
		t.Fatal(err)
	}
	ids := map[string]bool{}
	for _, m := range cands {
		ids[m.ID] = true
	}
	if !ids[a.ID] || !ids[b.ID] {
		t.Errorf("both models should be offered, got %+v", cands)
	}
}

// A model name lives in its vendor's namespace: two vendors may both ship an
// X100, but one vendor never ships two.
func TestModelNameIsScopedToItsVendor(t *testing.T) {
	s, ctx := newStore(t)
	tree(t, s, ctx)

	if _, err := s.CreateModel(ctx, CreateModelInput{
		Name: "X100", VendorID: vendorNamed(t, s, ctx, "Acme"),
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := s.CreateModel(ctx, CreateModelInput{
		Name: "X100", VendorID: vendorNamed(t, s, ctx, "Beta"),
	}); err != nil {
		t.Fatalf("two vendors may share a product name: %v", err)
	}
	if _, err := s.CreateModel(ctx, CreateModelInput{
		Name: "X100", VendorID: vendorNamed(t, s, ctx, "Acme"),
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

// The flip side, kept because it is the exact thing that changed.
//
// This used to read "a model with no category is never a candidate" -- created
// fine, offered nowhere until somebody placed it. Since there is nothing to
// place it in, a model that names nothing is offered everywhere, like the rest.
func TestModelWithNoVendorIsStillACandidate(t *testing.T) {
	s, ctx := newStore(t)
	tree(t, s, ctx)

	m, err := s.CreateModel(ctx, CreateModelInput{Name: "草稿"})
	if err != nil {
		t.Fatalf("a model with no vendor must still be creatable: %v", err)
	}
	cands, err := s.CandidateModels(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(cands) != 1 || cands[0].ID != m.ID {
		t.Errorf("it must be offered, got %+v", cands)
	}
}

// A constraint violation is not a server error: the person filling in the form
// can fix it, so they have to be told what to fix.
func TestDuplicateModelIsReportedNotCrashed(t *testing.T) {
	s, ctx := newStore(t)
	tree(t, s, ctx)

	if _, err := s.CreateModel(ctx, CreateModelInput{
		Name: "X100", VendorID: vendorNamed(t, s, ctx, "Acme"),
	}); err != nil {
		t.Fatal(err)
	}
	_, err := s.CreateModel(ctx, CreateModelInput{
		Name: "X100", VendorID: vendorNamed(t, s, ctx, "Acme"),
	})
	if !errors.Is(err, ErrModelDuplicate) {
		t.Fatalf("want ErrModelDuplicate, got %v", err)
	}
	if !strings.Contains(err.Error(), "Acme") || !strings.Contains(err.Error(), "X100") {
		t.Errorf("the message should name both, got %v", err)
	}

	// An unnamed vendor is still a namespace, and the message has to make sense
	// without a name to show.
	if _, err := s.CreateModel(ctx, CreateModelInput{Name: "S24"}); err != nil {
		t.Fatal(err)
	}
	_, err = s.CreateModel(ctx, CreateModelInput{Name: "S24"})
	if !errors.Is(err, ErrModelDuplicate) {
		t.Fatalf("want ErrModelDuplicate for the empty vendor too, got %v", err)
	}
	if !strings.Contains(err.Error(), "未填厂商") {
		t.Errorf("the message should say the vendor is blank, got %v", err)
	}
}

// vendorNamed creates a vendor and hands back its id.
//
// Since 016 a model points at a vendor row rather than carrying its name, so
// every test that used to write VendorID: vendorNamed(t, s, ctx, "Acme") needs the row to exist first.
// Idempotent by name, because most of these tests make two models of the same
// vendor and neither one should have to know whether it came first.
func vendorNamed(t *testing.T, s *Store, ctx context.Context, name string) string {
	t.Helper()
	if name == "" {
		return ""
	}
	existing, err := s.ListVendors(ctx)
	if err != nil {
		t.Fatalf("list vendors: %v", err)
	}
	for _, v := range existing {
		if v.Name == name {
			return v.ID
		}
	}
	v, err := s.CreateVendor(ctx, name)
	if err != nil {
		t.Fatalf("create vendor %s: %v", name, err)
	}
	return v.ID
}

// A note about the model is a fact about the thing -- discontinued, a revision
// to avoid -- and belongs on the model rather than on a text field of some
// category, where there would be one copy per category and no way to search
// them together.
func TestModelNoteIsSetOnCreateAndLeftAloneByAnEditThatOmitsIt(t *testing.T) {
	s, ctx := newStore(t)
	tree(t, s, ctx)

	m, err := s.CreateModel(ctx, CreateModelInput{
		Name: "Latitude 5420", VendorID: vendorNamed(t, s, ctx, "Dell"), Note: "已停产，改买 5430",
	})
	if err != nil {
		t.Fatal(err)
	}
	if m.Note != "已停产，改买 5430" {
		t.Fatalf("note = %q on create", m.Note)
	}

	// An edit that says nothing about the note keeps it. Absent is not empty:
	// changing the categories must not wipe what somebody wrote (v2's rule for
	// the device note, applied here).
	name := "Latitude 5420 (EOL)"
	got, err := s.UpdateModel(ctx, m.ID, UpdateModelInput{Name: &name})
	if err != nil {
		t.Fatal(err)
	}
	if got.Note != "已停产，改买 5430" {
		t.Errorf("an edit that omits the note should keep it, got %q", got.Note)
	}

	// An empty string is how it is cleared, and that is a different request.
	blank := ""
	got, err = s.UpdateModel(ctx, m.ID, UpdateModelInput{Note: &blank})
	if err != nil {
		t.Fatal(err)
	}
	if got.Note != "" {
		t.Errorf("an empty string clears it, got %q", got.Note)
	}

	// It survives a round trip through the list, not only through Get.
	if _, err := s.UpdateModel(ctx, m.ID, UpdateModelInput{Note: strPtrOf("风扇 40℃ 以上有异响")}); err != nil {
		t.Fatal(err)
	}
	list, err := s.ListModels(ctx)
	if err != nil {
		t.Fatal(err)
	}
	for _, l := range list {
		if l.ID == m.ID && l.Note != "风扇 40℃ 以上有异响" {
			t.Errorf("note in the list = %q", l.Note)
		}
	}
}

func strPtrOf(s string) *string { return &s }
