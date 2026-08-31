package schema

import (
	"errors"
	"strings"
	"testing"

	"github.com/klskk23/nexus-assets/internal/model"
)

func TestReferrersFindsExpressionKeys(t *testing.T) {
	s, ctx := newStore(t)
	root, _ := tree(t, s, ctx)

	mac, err := s.CreateField(ctx, CreateFieldInput{
		Key: "mac", Label: "基准 MAC", Type: model.FieldMAC, IsUnique: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	tag, err := s.CreateField(ctx, CreateFieldInput{
		Key: "tag", Label: "标签", Type: model.FieldComputed,
		Options: model.FieldOptions{Template: `category.code + "-" + hex2dec(attrs.mac)`},
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := s.Bind(ctx, root.ID, mac.ID, true, 10); err != nil {
		t.Fatal(err)
	}
	// Bound, because a template that governs no category reads nothing: scope
	// is what a binding gives a field, and keys only have to be unique inside
	// one chain now.
	if err := s.Bind(ctx, root.ID, tag.ID, false, 20); err != nil {
		t.Fatal(err)
	}

	refs, err := s.ReferrersOf(ctx, mac.ID, "mac")
	if err != nil {
		t.Fatalf("referrers: %v", err)
	}
	if len(refs) != 1 || refs[0].Kind != "field" || refs[0].Label != "标签" {
		t.Fatalf("the expression key should be the one referrer, got %+v", refs)
	}
}

// The second way to be referenced: a category showing the field as its
// identifier. Archiving it would blank that category's first column.
func TestDeleteRefusedWhileAFieldIsADisplayKey(t *testing.T) {
	s, ctx := newStore(t)
	root, _ := tree(t, s, ctx)

	tag, err := s.CreateField(ctx, CreateFieldInput{
		Key: "tag", Label: "资产标签", Type: model.FieldText, IsUnique: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := s.Bind(ctx, root.ID, tag.ID, true, 10); err != nil {
		t.Fatal(err)
	}
	key := "tag"
	if _, err := s.UpdateCategory(ctx, root.ID, UpdateCategoryInput{DisplayKey: &key}); err != nil {
		t.Fatal(err)
	}

	refs, _, _, err := s.DeleteField(ctx, tag.ID)
	if !errors.Is(err, ErrFieldReferenced) {
		t.Fatalf("want ErrFieldReferenced, got %v", err)
	}
	if len(refs) != 1 || refs[0].Kind != "display_key" {
		t.Errorf("the referrer should be the category display key, got %+v", refs)
	}
	if !strings.Contains(err.Error(), "网络设备") {
		t.Errorf("the error should name the category, got %v", err)
	}
}

// A regex over the template text would get both of these wrong.
func TestReferrersIgnoresStringLiteralsAndFindsNestedCalls(t *testing.T) {
	s, ctx := newStore(t)
	root, _ := tree(t, s, ctx)

	realField, err := s.CreateField(ctx, CreateFieldInput{Key: "real", Label: "真实项", Type: model.FieldText})
	if err != nil {
		t.Fatal(err)
	}
	decoyField, err := s.CreateField(ctx, CreateFieldInput{Key: "decoy", Label: "诱饵", Type: model.FieldText})
	if err != nil {
		t.Fatal(err)
	}
	derived, err := s.CreateField(ctx, CreateFieldInput{
		Key: "derived", Label: "推导项", Type: model.FieldComputed,
		// "decoy" appears only inside a string literal.
		Options: model.FieldOptions{Template: `replace(upper(attrs.real), ".attrs.decoy", "")`},
	})
	if err != nil {
		t.Fatal(err)
	}
	for _, f := range []model.FieldDefinition{realField, decoyField} {
		if err := s.Bind(ctx, root.ID, f.ID, true, 10); err != nil {
			t.Fatal(err)
		}
	}
	if err := s.Bind(ctx, root.ID, derived.ID, false, 30); err != nil {
		t.Fatal(err)
	}

	real, err := s.ReferrersOf(ctx, realField.ID, "real")
	if err != nil {
		t.Fatal(err)
	}
	if len(real) != 1 {
		t.Errorf("a key inside a nested call must be found, got %+v", real)
	}
	decoy, err := s.ReferrersOf(ctx, decoyField.ID, "decoy")
	if err != nil {
		t.Fatal(err)
	}
	if len(decoy) != 0 {
		t.Errorf("a key inside a string literal must not count, got %+v", decoy)
	}
}

func TestDeleteFieldRefusedWhileReferenced(t *testing.T) {
	s, ctx := newStore(t)
	root, _ := tree(t, s, ctx)

	mac, err := s.CreateField(ctx, CreateFieldInput{Key: "mac", Label: "基准 MAC", Type: model.FieldMAC})
	if err != nil {
		t.Fatal(err)
	}
	sn, err := s.CreateField(ctx, CreateFieldInput{
		Key: "sn", Label: "设备编号", Type: model.FieldComputed, IsUnique: true,
		Options: model.FieldOptions{Template: "hex2dec(attrs.mac)"},
	})
	if err != nil {
		t.Fatal(err)
	}
	// Both bound: scope comes from bindings, so a template governing no
	// category is in nobody's way.
	if err := s.Bind(ctx, root.ID, mac.ID, true, 10); err != nil {
		t.Fatal(err)
	}
	if err := s.Bind(ctx, root.ID, sn.ID, false, 20); err != nil {
		t.Fatal(err)
	}

	// Archiving mac would make every asset in that category unsaveable, since
	// the expression key over it could no longer be evaluated.
	refs, _, _, err := s.DeleteField(ctx, mac.ID)
	if !errors.Is(err, ErrFieldReferenced) {
		t.Fatalf("want ErrFieldReferenced, got %v", err)
	}
	if len(refs) == 0 {
		t.Error("the caller needs the referrer list to show the user what is in the way")
	}
	if !strings.Contains(err.Error(), "设备编号") {
		t.Errorf("the message should name what is referencing it, got: %v", err)
	}

	if _, err := s.GetField(ctx, mac.ID); err != nil {
		t.Errorf("the field must still exist after a refused delete: %v", err)
	}
}

func TestDeleteFieldSucceedsOnceNothingReadsIt(t *testing.T) {
	s, ctx := newStore(t)
	f, err := s.CreateField(ctx, CreateFieldInput{Key: "spare", Label: "备用", Type: model.FieldText})
	if err != nil {
		t.Fatal(err)
	}
	if _, _, _, err := s.DeleteField(ctx, f.ID); err != nil {
		t.Fatalf("delete: %v", err)
	}
	if _, err := s.GetField(ctx, f.ID); !errors.Is(err, ErrNotFound) {
		t.Errorf("the field should be gone, got %v", err)
	}
}

// Keys are only unique inside a chain now, so two categories may each have a
// "rack". Deleting one of them must not be blocked by the other's template,
// nor by devices in the other tree that carry a value under the same name.
func TestReferenceChecksStopAtTheCategoriesAFieldIsBoundTo(t *testing.T) {
	s, ctx := newStore(t)
	root, _ := tree(t, s, ctx)

	other, err := s.CreateCategory(ctx, CreateCategoryInput{Code: "SW", Name: "交换机"})
	if err != nil {
		t.Fatal(err)
	}

	mine, err := s.CreateField(ctx, CreateFieldInput{Key: "rack", Label: "机柜位", Type: model.FieldText})
	if err != nil {
		t.Fatal(err)
	}
	theirs, err := s.CreateField(ctx, CreateFieldInput{Key: "rack", Label: "机柜位（交换机）", Type: model.FieldText})
	if err != nil {
		t.Fatalf("a second field may take the same key: %v", err)
	}
	// Their expression key reads their rack, in their tree.
	derived, err := s.CreateField(ctx, CreateFieldInput{
		Key: "slot", Label: "槽位", Type: model.FieldComputed,
		Options: model.FieldOptions{Template: `upper(attrs.rack)`},
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := s.Bind(ctx, root.ID, mine.ID, false, 10); err != nil {
		t.Fatal(err)
	}
	// Their static key first, and required, which is what the dependency gate
	// asks of anything a template reads.
	if err := s.Bind(ctx, other.ID, theirs.ID, true, 10); err != nil {
		t.Fatal(err)
	}
	if err := s.Bind(ctx, other.ID, derived.ID, false, 20); err != nil {
		t.Fatal(err)
	}

	refs, err := s.ReferrersOf(ctx, mine.ID, "rack")
	if err != nil {
		t.Fatal(err)
	}
	if len(refs) != 0 {
		t.Errorf("another category's template is not a referrer of this field, got %+v", refs)
	}
	// Theirs is read by theirs, and still says so.
	refs, err = s.ReferrersOf(ctx, theirs.ID, "rack")
	if err != nil {
		t.Fatal(err)
	}
	if len(refs) != 1 {
		t.Errorf("the template in its own tree should be found, got %+v", refs)
	}
}
