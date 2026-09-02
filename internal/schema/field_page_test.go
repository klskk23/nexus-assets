package schema

import (
	"context"
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
		if err := s.Bind(ctx, b.category, b.field, false, 10); err != nil {
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
	if err := s.Bind(ctx, root.ID, here.ID, false, 10); err != nil {
		t.Fatalf("bind: %v", err)
	}
	if err := s.Bind(ctx, office.ID, there.ID, false, 20); err != nil {
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
