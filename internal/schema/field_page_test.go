package schema

import (
	"context"
	"errors"
	"testing"

	"github.com/klskk23/nexus-assets/internal/model"
)

// TestListFieldPageFiltersByCategory covers what makes the field library
// readable now that a key may repeat (v6 decision 71): asking for one
// category's fields, and paging through them.
func TestListFieldPageFiltersByCategory(t *testing.T) {
	s, ctx := newStore(t)
	root, child := tree(t, s, ctx)

	// Two fields on the parent and one on the child. The child's page must show
	// all three -- a bound field is inherited down the chain -- while the
	// parent's shows only its own.
	mac := mustField(t, s, ctx, "mac", "基准 MAC", model.FieldMAC)
	fw := mustField(t, s, ctx, "firmware", "固件版本", model.FieldText)
	port := mustField(t, s, ctx, "ports", "端口数", model.FieldNumber)
	// A fourth, bound nowhere: it exists in the library and belongs to no
	// category's page.
	orphan := mustField(t, s, ctx, "note", "备注", model.FieldText)

	for _, b := range []struct {
		category string
		field    string
	}{{root.ID, mac.ID}, {root.ID, fw.ID}, {child.ID, port.ID}} {
		if err := s.Bind(ctx, b.category, b.field, 10); err != nil {
			t.Fatalf("bind: %v", err)
		}
	}

	all, err := s.ListFieldPage(ctx, FieldFilter{})
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if all.Total != 4 {
		t.Errorf("the library holds four fields, page says %d", all.Total)
	}

	onChild, err := s.ListFieldPage(ctx, FieldFilter{CategoryID: child.ID})
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if got := keysOf(onChild.Items); len(got) != 3 {
		t.Errorf("the child inherits the parent's two and adds one, got %v", got)
	}
	for _, k := range keysOf(onChild.Items) {
		if k == "note" {
			t.Error("a field bound nowhere must not appear under a category")
		}
	}

	onRoot, err := s.ListFieldPage(ctx, FieldFilter{CategoryID: root.ID})
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if got := keysOf(onRoot.Items); len(got) != 2 {
		t.Errorf("the parent has two of its own, got %v", got)
	}
	_ = orphan

	// Paging is over the filtered set, not the library: a page of one out of
	// three, and an offset past the end is empty rather than an error.
	first, err := s.ListFieldPage(ctx, FieldFilter{CategoryID: child.ID, Limit: 1})
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if first.Total != 3 || len(first.Items) != 1 {
		t.Errorf("expected 1 of 3, got %d of %d", len(first.Items), first.Total)
	}
	past, err := s.ListFieldPage(ctx, FieldFilter{CategoryID: child.ID, Offset: 99, Limit: 10})
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(past.Items) != 0 {
		t.Errorf("an offset past the end should be empty, got %d", len(past.Items))
	}
}

// TestBoundCategoriesTellsFieldsApart pins the answer to "where does this field
// live", which is the only thing separating two fields that share a key.
func TestBoundCategoriesTellsFieldsApart(t *testing.T) {
	s, ctx := newStore(t)
	root, _ := tree(t, s, ctx)

	// Two chains, because the same key twice on one chain is still refused:
	// what v6 allows is a key repeating across the tree, not within a lineage.
	office, err := s.CreateCategory(ctx, CreateCategoryInput{Code: "OFF", Name: "办公设备"})
	if err != nil {
		t.Fatalf("create category: %v", err)
	}

	here := mustField(t, s, ctx, "sn", "本机编号", model.FieldText)
	there := mustField(t, s, ctx, "sn", "厂商序列号", model.FieldText)
	if err := s.Bind(ctx, root.ID, here.ID, 10); err != nil {
		t.Fatalf("bind: %v", err)
	}
	if err := s.Bind(ctx, office.ID, there.ID, 20); err != nil {
		t.Fatalf("bind: %v", err)
	}

	bound, err := s.BoundCategories(ctx)
	if err != nil {
		t.Fatalf("bound categories: %v", err)
	}
	if got := bound[here.ID]; len(got) != 1 || got[0] != root.ID {
		t.Errorf("the first field belongs to the parent, got %v", got)
	}
	if got := bound[there.ID]; len(got) != 1 || got[0] != office.ID {
		t.Errorf("the second belongs to the child, got %v", got)
	}
}

func mustField(t *testing.T, s *Store, ctx context.Context, key, label string, typ model.FieldType) model.FieldDefinition {
	t.Helper()
	f, err := s.CreateField(ctx, CreateFieldInput{Key: key, Label: label, Type: typ})
	if err != nil {
		t.Fatalf("create field %q: %v", key, err)
	}
	return f
}

func keysOf(fields []model.FieldDefinition) []string {
	out := make([]string, 0, len(fields))
	for _, f := range fields {
		out = append(out, f.Key)
	}
	return out
}

// TestBindRefusesASecondFieldWithTheSameKeyOnOneCategory pins the gap the
// create-and-bind path found: the clash check exempted the whole category, so
// a second field carrying the same key could be bound right beside the first
// and the effective field set had two answers for one key.
func TestBindRefusesASecondFieldWithTheSameKeyOnOneCategory(t *testing.T) {
	s, ctx := newStore(t)
	root, _ := tree(t, s, ctx)

	first := mustField(t, s, ctx, "rack", "机柜位", model.FieldText)
	second := mustField(t, s, ctx, "rack", "另一个机柜位", model.FieldText)

	if err := s.Bind(ctx, root.ID, first.ID, 10); err != nil {
		t.Fatalf("bind: %v", err)
	}
	if err := s.Bind(ctx, root.ID, second.ID, 20); !errors.Is(err, ErrKeyConflict) {
		t.Fatalf("a second field with the same key on one category should conflict, got %v", err)
	}

	// What must stay allowed: re-binding the same field, which is how sort is
	// changed (required moved onto the field in 018).
	if err := s.Bind(ctx, root.ID, first.ID, 30); err != nil {
		t.Fatalf("re-binding the same field should be allowed: %v", err)
	}
	fields, err := s.EffectiveFields(ctx, root.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(fields) != 1 || fields[0].Sort != 30 {
		t.Errorf("expected one field, re-sorted; got %+v", fields)
	}
}

// TestCreateFieldBindsAtomically covers the create-with-categories path: the
// pair is the request, so a refused binding leaves no field behind.
func TestCreateFieldBindsAtomically(t *testing.T) {
	s, ctx := newStore(t)
	root, child := tree(t, s, ctx)

	f, err := s.CreateField(ctx, CreateFieldInput{
		Key: "rack", Label: "机柜位", Type: model.FieldText,
		CategoryIDs: []string{root.ID}, Required: true,
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	bound, err := s.EffectiveFields(ctx, child.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(bound) != 1 || bound[0].ID != f.ID || !bound[0].Required {
		t.Errorf("the field should be bound to the parent as required; got %+v", bound)
	}

	// The same key again on the same chain: refused, and nothing created.
	if _, err := s.CreateField(ctx, CreateFieldInput{
		Key: "rack", Label: "另一个机柜位", Type: model.FieldText,
		CategoryIDs: []string{child.ID},
	}); !errors.Is(err, ErrKeyConflict) {
		t.Fatalf("expected ErrKeyConflict, got %v", err)
	}
	page, err := s.ListFieldPage(ctx, FieldFilter{})
	if err != nil {
		t.Fatal(err)
	}
	if page.Total != 1 {
		t.Errorf("a refused create must leave no field behind, library holds %d", page.Total)
	}
}
