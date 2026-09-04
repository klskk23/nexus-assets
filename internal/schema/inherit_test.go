package schema

import (
	"errors"
	"testing"

	"github.com/klskk23/nexus-assets/internal/model"
)

// A child inherits everything and may only add. There is no override rule, so
// rebinding a key already present on the chain has no defined meaning.
func TestChildInheritsEverythingAndMayOnlyAppend(t *testing.T) {
	s, ctx := newStore(t)
	root, child := tree(t, s, ctx)

	grandchild, err := s.CreateCategory(ctx, CreateCategoryInput{
		Code: "EDGE", Name: "边缘型", ParentID: &child.ID,
	})
	if err != nil {
		t.Fatal(err)
	}

	mac, _ := s.CreateField(ctx, CreateFieldInput{
		Key: "mac", Label: "基准 MAC", Type: model.FieldMAC, Required: true,
	})
	fw, _ := s.CreateField(ctx, CreateFieldInput{Key: "firmware", Label: "固件版本", Type: model.FieldText})
	tun, _ := s.CreateField(ctx, CreateFieldInput{Key: "tunnels", Label: "隧道数", Type: model.FieldNumber})
	pwr, _ := s.CreateField(ctx, CreateFieldInput{Key: "watts", Label: "功耗", Type: model.FieldNumber})

	if err := s.Bind(ctx, root.ID, mac.ID, 10); err != nil {
		t.Fatal(err)
	}
	if err := s.Bind(ctx, root.ID, fw.ID, 20); err != nil {
		t.Fatal(err)
	}
	if err := s.Bind(ctx, child.ID, tun.ID, 10); err != nil {
		t.Fatal(err)
	}
	if err := s.Bind(ctx, grandchild.ID, pwr.ID, 10); err != nil {
		t.Fatal(err)
	}

	fields, err := s.EffectiveFields(ctx, grandchild.ID)
	if err != nil {
		t.Fatalf("effective fields: %v", err)
	}
	if len(fields) != 4 {
		t.Fatalf("three levels should union to 4 fields, got %d", len(fields))
	}
	// Root first: the order a form should present them in.
	wantOrder := []string{"mac", "firmware", "tunnels", "watts"}
	for i, w := range wantOrder {
		if fields[i].Key != w {
			t.Errorf("field %d = %q, want %q", i, fields[i].Key, w)
		}
	}
	attribution := map[string]string{
		"mac": root.ID, "firmware": root.ID, "tunnels": child.ID, "watts": "",
	}
	for _, f := range fields {
		if f.InheritedFrom != attribution[f.Key] {
			t.Errorf("%s inherited_from = %q, want %q", f.Key, f.InheritedFrom, attribution[f.Key])
		}
	}
	if !fields[0].Required {
		t.Error("required must survive two levels of inheritance")
	}

	// Appending is fine; rebinding an inherited key is not.
	if err := s.Bind(ctx, grandchild.ID, mac.ID, 99); !errors.Is(err, ErrKeyConflict) {
		t.Fatalf("rebinding an inherited key should conflict, got %v", err)
	}
	// Nor may an ancestor take a key a descendant already uses.
	if err := s.Bind(ctx, root.ID, pwr.ID, 99); !errors.Is(err, ErrKeyConflict) {
		t.Fatalf("binding a descendant's key on an ancestor should conflict, got %v", err)
	}
}

// Sibling branches are independent: the same key may appear in both.
func TestSiblingsMayUseTheSameKey(t *testing.T) {
	s, ctx := newStore(t)
	root, child := tree(t, s, ctx)
	sibling, err := s.CreateCategory(ctx, CreateCategoryInput{
		Code: "SW", Name: "企业交换机", ParentID: &root.ID,
	})
	if err != nil {
		t.Fatal(err)
	}
	ports, _ := s.CreateField(ctx, CreateFieldInput{Key: "ports", Label: "端口数", Type: model.FieldNumber})

	if err := s.Bind(ctx, child.ID, ports.ID, 10); err != nil {
		t.Fatal(err)
	}
	if err := s.Bind(ctx, sibling.ID, ports.ID, 10); err != nil {
		t.Errorf("two sibling branches may both use a key: %v", err)
	}
}
