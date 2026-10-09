package schema

import (
	"errors"
	"testing"

	"github.com/klskk23/nexus-assets/internal/model"
)

func TestNonUniqueDisplayKeyKeepsFieldSettingsAndReferenceGuards(t *testing.T) {
	s, ctx := newStore(t)
	root, child := tree(t, s, ctx)
	field, err := s.CreateField(ctx, CreateFieldInput{
		Key: "rack", Label: "Rack", Type: model.FieldText,
		CategoryIDs: []string{root.ID},
	})
	if err != nil {
		t.Fatal(err)
	}
	choices := []string{field.ID}
	created, err := s.CreateCategory(ctx, CreateCategoryInput{
		Code: "NEW", Name: "New child", ParentID: &root.ID, DisplayKey: "rack",
		InheritedFieldIDs: &choices,
	})
	if err != nil {
		t.Fatalf("create with inherited non-unique display key: %v", err)
	}
	if created.DisplayKey != "rack" {
		t.Fatalf("display key = %q", created.DisplayKey)
	}
	key := "rack"
	if _, err := s.UpdateCategory(ctx, child.ID, UpdateCategoryInput{DisplayKey: &key, InheritedFieldIDs: &choices}); err != nil {
		t.Fatalf("select inherited non-unique field: %v", err)
	}
	got, err := s.GetField(ctx, field.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.IsUnique || got.Searchable || got.Required {
		t.Fatalf("choosing a display key changed field settings: %+v", got)
	}
	if err := s.Unbind(ctx, root.ID, field.ID); !errors.Is(err, ErrFieldDependedOn) {
		t.Fatalf("display key must still block unbinding: %v", err)
	}
	if _, _, _, err := s.DeleteField(ctx, field.ID); !errors.Is(err, ErrFieldReferenced) {
		t.Fatalf("display key must still block deletion: %v", err)
	}
	key = ""
	for _, id := range []string{created.ID, child.ID} {
		if _, err := s.UpdateCategory(ctx, id, UpdateCategoryInput{DisplayKey: &key}); err != nil {
			t.Fatal(err)
		}
	}
	if err := confirmedUnbind(t, s, ctx, root.ID, field.ID); err != nil {
		t.Fatalf("clearing display keys releases the binding: %v", err)
	}
}

func TestDisplayKeyStillRequiresCategoryChainBinding(t *testing.T) {
	for _, binding := range []string{"unbound", "other category", "model", "vendor"} {
		t.Run(binding, func(t *testing.T) {
			s, ctx := newStore(t)
			root, _ := tree(t, s, ctx)
			in := CreateFieldInput{Key: "tag", Label: "Tag", Type: model.FieldText}
			want := ErrDisplayKeyInvalid
			switch binding {
			case "other category":
				other, err := s.CreateCategory(ctx, CreateCategoryInput{Code: "OTHER", Name: "Other"})
				if err != nil {
					t.Fatal(err)
				}
				in.CategoryIDs = []string{other.ID}
			case "model":
				m := modelOn(t, s, ctx, "Model")
				in.ModelIDs = []string{m.ID}
				want = ErrDisplayKeyNotCategoryField
			case "vendor":
				in.VendorIDs = []string{vendorNamed(t, s, ctx, "Vendor")}
				want = ErrDisplayKeyNotCategoryField
			}
			if _, err := s.CreateField(ctx, in); err != nil {
				t.Fatal(err)
			}
			key := "tag"
			if _, err := s.UpdateCategory(ctx, root.ID, UpdateCategoryInput{DisplayKey: &key}); !errors.Is(err, want) {
				t.Fatalf("update: want %v, got %v", want, err)
			}
			if _, err := s.CreateCategory(ctx, CreateCategoryInput{
				Code: "NEW", Name: "New", ParentID: &root.ID, DisplayKey: key,
			}); !errors.Is(err, want) {
				t.Fatalf("create: want %v, got %v", want, err)
			}
		})
	}
}
