package schema

import (
	"errors"
	"strings"
	"testing"

	"github.com/klskk23/nexus-assets/internal/model"
)

func TestReferrersFindsBothComputedFieldsAndSerialRules(t *testing.T) {
	s, ctx := newStore(t)
	root, child := tree(t, s, ctx) // child's sn_template reads .attrs.mac

	mac, err := s.CreateField(ctx, CreateFieldInput{Key: "mac", Label: "基准 MAC", Type: model.FieldMAC})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.CreateField(ctx, CreateFieldInput{
		Key: "tag", Label: "标签", Type: model.FieldComputed,
		Options: model.FieldOptions{Template: `{{ printf "%s-%s" .category.code (.attrs.mac | hex2dec) }}`},
	}); err != nil {
		t.Fatal(err)
	}
	if err := s.Bind(ctx, root.ID, mac.ID, true, 10); err != nil {
		t.Fatal(err)
	}

	refs, err := s.ReferrersOf(ctx, "mac")
	if err != nil {
		t.Fatalf("referrers: %v", err)
	}
	if len(refs) != 2 {
		t.Fatalf("got %d referrers, want the computed field and the category rule: %+v", len(refs), refs)
	}
	kinds := map[string]bool{}
	for _, r := range refs {
		kinds[r.Kind] = true
	}
	if !kinds["field"] || !kinds["category"] {
		t.Errorf("both kinds should be found, got %+v", refs)
	}
	for _, r := range refs {
		if r.Kind == "category" && r.Label != child.Name {
			t.Errorf("category referrer = %q, want %q", r.Label, child.Name)
		}
	}
}

// A regex over the template text would get both of these wrong.
func TestReferrersIgnoresStringLiteralsAndFindsNestedCalls(t *testing.T) {
	s, ctx := newStore(t)
	root, _ := tree(t, s, ctx)
	// Clear the child's rule so only the field under test references anything.
	empty := ""
	cats, _ := s.ListCategories(ctx)
	for _, c := range cats {
		if _, err := s.UpdateCategory(ctx, c.ID, UpdateCategoryInput{SNTemplate: &empty}); err != nil {
			t.Fatal(err)
		}
	}
	_ = root

	if _, err := s.CreateField(ctx, CreateFieldInput{Key: "real", Label: "真实项", Type: model.FieldText}); err != nil {
		t.Fatal(err)
	}
	if _, err := s.CreateField(ctx, CreateFieldInput{Key: "decoy", Label: "诱饵", Type: model.FieldText}); err != nil {
		t.Fatal(err)
	}
	if _, err := s.CreateField(ctx, CreateFieldInput{
		Key: "derived", Label: "推导项", Type: model.FieldComputed,
		// "decoy" appears only inside a string literal.
		Options: model.FieldOptions{Template: `{{ replace ".attrs.decoy" "" (.attrs.real | upper) }}`},
	}); err != nil {
		t.Fatal(err)
	}

	real, err := s.ReferrersOf(ctx, "real")
	if err != nil {
		t.Fatal(err)
	}
	if len(real) != 1 {
		t.Errorf("a key inside a nested call must be found, got %+v", real)
	}
	decoy, err := s.ReferrersOf(ctx, "decoy")
	if err != nil {
		t.Fatal(err)
	}
	if len(decoy) != 0 {
		t.Errorf("a key inside a string literal must not count, got %+v", decoy)
	}
}

func TestArchiveFieldRefusedWhileReferenced(t *testing.T) {
	s, ctx := newStore(t)
	tree(t, s, ctx) // the child category's rule reads .attrs.mac

	mac, err := s.CreateField(ctx, CreateFieldInput{Key: "mac", Label: "基准 MAC", Type: model.FieldMAC})
	if err != nil {
		t.Fatal(err)
	}

	// Archiving mac would make every asset in that category unsaveable, since
	// the serial-number rule could no longer be evaluated.
	refs, err := s.ArchiveField(ctx, mac.ID)
	if !errors.Is(err, ErrFieldReferenced) {
		t.Fatalf("want ErrFieldReferenced, got %v", err)
	}
	if len(refs) == 0 {
		t.Error("the caller needs the referrer list to show the user what is in the way")
	}
	if !strings.Contains(err.Error(), "编号生成规则") {
		t.Errorf("the message should name what is referencing it, got: %v", err)
	}

	still, err := s.GetField(ctx, mac.ID)
	if err != nil {
		t.Fatal(err)
	}
	if still.ArchivedAt != nil {
		t.Error("the field must not have been archived")
	}
}

func TestArchiveFieldSucceedsOnceNothingReadsIt(t *testing.T) {
	s, ctx := newStore(t)
	f, err := s.CreateField(ctx, CreateFieldInput{Key: "spare", Label: "备用", Type: model.FieldText})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.ArchiveField(ctx, f.ID); err != nil {
		t.Fatalf("archive: %v", err)
	}
	got, err := s.GetField(ctx, f.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.ArchivedAt == nil {
		t.Error("the field should be archived")
	}
}
