package schema

import (
	"testing"

	"github.com/klskk23/nexus-assets/internal/model"
)

func TestUnbindPrunesDescendantSelectionsWithoutRestoringThem(t *testing.T) {
	s, ctx := newStore(t)
	root, child := tree(t, s, ctx)
	leaf, err := s.CreateCategory(ctx, CreateCategoryInput{Code: "EDGE", Name: "Edge", ParentID: &child.ID})
	if err != nil {
		t.Fatal(err)
	}
	other, err := s.CreateCategory(ctx, CreateCategoryInput{Code: "OTHER", Name: "Other"})
	if err != nil {
		t.Fatal(err)
	}
	otherChild, err := s.CreateCategory(ctx, CreateCategoryInput{Code: "OTHER_CHILD", Name: "Other child", ParentID: &other.ID})
	if err != nil {
		t.Fatal(err)
	}
	field := mustField(t, s, ctx, "rack", "Rack", model.FieldText)
	for _, id := range []string{root.ID, other.ID} {
		if err := s.Bind(ctx, id, field.ID, 10); err != nil {
			t.Fatal(err)
		}
	}
	for _, id := range []string{child.ID, leaf.ID, otherChild.ID} {
		selectFixtureFields(t, s, ctx, id, field.ID)
	}
	// Unbinding a non-binding must not withdraw inherited choices below it.
	if err := s.Unbind(ctx, child.ID, field.ID); err != nil {
		t.Fatal(err)
	}
	before, err := s.EffectiveFields(ctx, leaf.ID)
	if err != nil || len(before) != 1 {
		t.Fatalf("non-binding unbind changed leaf: fields=%v err=%v", before, err)
	}
	if err := confirmedUnbind(t, s, ctx, root.ID, field.ID); err != nil {
		t.Fatal(err)
	}
	for _, id := range []string{root.ID, child.ID, leaf.ID} {
		fields, err := s.EffectiveFields(ctx, id)
		if err != nil || len(fields) != 0 {
			t.Fatalf("unbound category %s: fields=%v err=%v", id, fields, err)
		}
	}
	var selections int
	if err := s.db.ReadDB().QueryRowContext(ctx, `SELECT count(*) FROM category_field_selections WHERE field_id = ?`, field.ID).Scan(&selections); err != nil {
		t.Fatal(err)
	}
	if selections != 1 {
		t.Fatalf("only the independent branch should keep its selection, got %d", selections)
	}
	if err := s.Bind(ctx, root.ID, field.ID, 10); err != nil {
		t.Fatal(err)
	}
	for _, id := range []string{child.ID, leaf.ID} {
		fields, err := s.EffectiveFields(ctx, id)
		if err != nil || len(fields) != 0 {
			t.Fatalf("rebinding must not restore %s: fields=%v err=%v", id, fields, err)
		}
	}
	fields, err := s.EffectiveFields(ctx, otherChild.ID)
	if err != nil || len(fields) != 1 || fields[0].InheritedFrom != other.ID {
		t.Fatalf("independent binding must survive: fields=%v err=%v", fields, err)
	}
}

func TestRefusedUnbindKeepsDescendantSelections(t *testing.T) {
	s, ctx := newStore(t)
	root, child := tree(t, s, ctx)
	field := mustField(t, s, ctx, "tag", "Tag", model.FieldText)
	if err := s.Bind(ctx, root.ID, field.ID, 10); err != nil {
		t.Fatal(err)
	}
	selectFixtureFields(t, s, ctx, child.ID, field.ID)
	if _, err := s.UpdateCategory(ctx, child.ID, UpdateCategoryInput{DisplayKey: &field.Key}); err != nil {
		t.Fatal(err)
	}
	if err := s.Unbind(ctx, root.ID, field.ID); err == nil {
		t.Fatal("a descendant display key must block unbinding")
	}
	fields, err := s.EffectiveFields(ctx, child.ID)
	if err != nil || len(fields) != 1 || fields[0].ID != field.ID {
		t.Fatalf("refused unbind changed selections: fields=%v err=%v", fields, err)
	}
}
