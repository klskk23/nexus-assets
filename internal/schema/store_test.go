package schema

import (
	"context"
	"errors"
	"path/filepath"
	"strings"
	"testing"

	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/store"
)

func newStore(t *testing.T) (*Store, context.Context) {
	t.Helper()
	ctx := context.Background()
	db, err := store.Open(filepath.Join(t.TempDir(), "s.db"))
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	if err := db.Migrate(ctx); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	return New(db), ctx
}

// tree builds 网络设备 > SDWAN 路由器 and returns both ids.
func tree(t *testing.T, s *Store, ctx context.Context) (root, child model.Category) {
	t.Helper()
	root, err := s.CreateCategory(ctx, CreateCategoryInput{Code: "NET", Name: "网络设备"})
	if err != nil {
		t.Fatalf("create root: %v", err)
	}
	child, err = s.CreateCategory(ctx, CreateCategoryInput{
		Code: "RT", Name: "SDWAN 路由器", ParentID: &root.ID,
		SNTemplate: "{{ .attrs.mac | hex2dec }}",
	})
	if err != nil {
		t.Fatalf("create child: %v", err)
	}
	return root, child
}

func TestCreateCategoryBuildsMaterialisedPath(t *testing.T) {
	s, ctx := newStore(t)
	root, child := tree(t, s, ctx)

	if root.Path != "/"+root.ID+"/" {
		t.Errorf("root path = %q", root.Path)
	}
	if child.Path != root.Path+child.ID+"/" {
		t.Errorf("child path = %q, should extend the parent's", child.Path)
	}
	if !IsDescendantOf(child.Path, root.Path) {
		t.Error("subtree prefix matching should hold for a real inserted row")
	}
}

func TestGetCategoryNotFound(t *testing.T) {
	s, ctx := newStore(t)
	if _, err := s.GetCategory(ctx, "missing"); !errors.Is(err, ErrNotFound) {
		t.Errorf("expected ErrNotFound, got %v", err)
	}
}

func TestListCategoriesOrdersByPath(t *testing.T) {
	s, ctx := newStore(t)
	root, child := tree(t, s, ctx)
	got, err := s.ListCategories(ctx)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(got) != 2 || got[0].ID != root.ID || got[1].ID != child.ID {
		t.Errorf("path ordering should yield a depth-first tree order, got %+v", got)
	}
}

func TestSNTemplateInheritance(t *testing.T) {
	s, ctx := newStore(t)
	root, child := tree(t, s, ctx)

	templates, err := s.SNTemplates(ctx)
	if err != nil {
		t.Fatalf("templates: %v", err)
	}
	tmpl, from := ResolveSNTemplate(child.Path, templates)
	if from != child.ID {
		t.Errorf("child defines its own template, from = %q", from)
	}

	// Move the rule up to the root and clear it on the child.
	empty := ""
	if _, err := s.UpdateCategory(ctx, child.ID, UpdateCategoryInput{SNTemplate: &empty}); err != nil {
		t.Fatalf("clear child template: %v", err)
	}
	rootTmpl := "{{ .attrs.mac | hex2dec | pad 16 }}"
	if _, err := s.UpdateCategory(ctx, root.ID, UpdateCategoryInput{SNTemplate: &rootTmpl}); err != nil {
		t.Fatalf("set root template: %v", err)
	}
	templates, _ = s.SNTemplates(ctx)
	tmpl, from = ResolveSNTemplate(child.Path, templates)
	if from != root.ID || tmpl != rootTmpl {
		t.Errorf("the child should now inherit the root rule, got %q from %q", tmpl, from)
	}
}

func TestBindRejectsKeyAlreadyOnTheChain(t *testing.T) {
	s, ctx := newStore(t)
	root, child := tree(t, s, ctx)

	mac, err := s.CreateField(ctx, CreateFieldInput{
		Key: "mac", Label: "基准 MAC", Type: model.FieldMAC, IsUnique: true,
	})
	if err != nil {
		t.Fatalf("create field: %v", err)
	}
	if err := s.Bind(ctx, root.ID, mac.ID, true, 10); err != nil {
		t.Fatalf("bind on root: %v", err)
	}

	// A child may only append. Rebinding the same key must be refused, since
	// there is no override rule to resolve the ambiguity.
	err = s.Bind(ctx, child.ID, mac.ID, false, 10)
	if !errors.Is(err, ErrKeyConflict) {
		t.Fatalf("expected ErrKeyConflict, got %v", err)
	}
	if !strings.Contains(err.Error(), "mac") {
		t.Errorf("error should name the key, got: %v", err)
	}
}

func TestEffectiveFieldsUnionsTheChain(t *testing.T) {
	s, ctx := newStore(t)
	root, child := tree(t, s, ctx)

	mac, _ := s.CreateField(ctx, CreateFieldInput{Key: "mac", Label: "MAC", Type: model.FieldMAC})
	tun, _ := s.CreateField(ctx, CreateFieldInput{Key: "tunnels", Label: "隧道数", Type: model.FieldNumber})
	if err := s.Bind(ctx, root.ID, mac.ID, true, 10); err != nil {
		t.Fatal(err)
	}
	if err := s.Bind(ctx, child.ID, tun.ID, false, 20); err != nil {
		t.Fatal(err)
	}

	fields, err := s.EffectiveFields(ctx, child.ID)
	if err != nil {
		t.Fatalf("effective fields: %v", err)
	}
	if len(fields) != 2 {
		t.Fatalf("got %d fields, want 2", len(fields))
	}
	byKey := map[string]model.BoundField{}
	for _, f := range fields {
		byKey[f.Key] = f
	}
	if byKey["mac"].InheritedFrom != root.ID {
		t.Errorf("mac should be attributed to the root, got %q", byKey["mac"].InheritedFrom)
	}
	if byKey["tunnels"].InheritedFrom != "" {
		t.Errorf("the child's own binding should not be marked inherited")
	}
	if !byKey["mac"].Required {
		t.Error("required should survive inheritance")
	}
}

func TestUnbindLeavesTheDefinitionAlone(t *testing.T) {
	s, ctx := newStore(t)
	root, _ := tree(t, s, ctx)
	f, _ := s.CreateField(ctx, CreateFieldInput{Key: "firmware", Label: "固件", Type: model.FieldText})
	if err := s.Bind(ctx, root.ID, f.ID, false, 10); err != nil {
		t.Fatal(err)
	}
	if err := s.Unbind(ctx, root.ID, f.ID); err != nil {
		t.Fatalf("unbind: %v", err)
	}
	fields, _ := s.EffectiveFields(ctx, root.ID)
	if len(fields) != 0 {
		t.Errorf("unbound field should leave the effective set, got %+v", fields)
	}
	// The definition itself stays in the global library, so rebinding restores it.
	if _, err := s.GetField(ctx, f.ID); err != nil {
		t.Errorf("unbinding must not delete the definition: %v", err)
	}
}

func TestArchiveFieldRemovesItFromTheActiveSet(t *testing.T) {
	s, ctx := newStore(t)
	root, _ := tree(t, s, ctx)
	f, _ := s.CreateField(ctx, CreateFieldInput{Key: "legacy", Label: "旧字段", Type: model.FieldText})
	if err := s.Bind(ctx, root.ID, f.ID, false, 10); err != nil {
		t.Fatal(err)
	}
	yes := true
	if _, err := s.UpdateField(ctx, f.ID, UpdateFieldInput{Archive: &yes}); err != nil {
		t.Fatalf("archive: %v", err)
	}
	fields, _ := s.EffectiveFields(ctx, root.ID)
	if len(ActiveFields(fields)) != 0 {
		t.Error("an archived field must drop out of the active set")
	}
	if len(fields) != 1 {
		t.Error("but the binding itself is still there, so stored values keep their meaning")
	}
}

func TestCreateFieldRejectsInvalidTemplate(t *testing.T) {
	s, ctx := newStore(t)
	_, err := s.CreateField(ctx, CreateFieldInput{
		Key: "bad", Label: "坏规则", Type: model.FieldComputed,
		Options: model.FieldOptions{Template: "{{ if .attrs.mac }}x{{ end }}"},
	})
	if err == nil {
		t.Fatal("a template with control flow must be refused at definition time")
	}
}

func TestModelDefaultsRoundTrip(t *testing.T) {
	s, ctx := newStore(t)
	_, child := tree(t, s, ctx)
	m, err := s.CreateModel(ctx, CreateModelInput{
		CategoryID: child.ID, Name: "SDWAN-X100", Vendor: "Acme",
		AttrDefaults: map[string]any{"ports": float64(8)},
	})
	if err != nil {
		t.Fatalf("create model: %v", err)
	}
	got, err := s.GetModel(ctx, m.ID)
	if err != nil {
		t.Fatalf("get model: %v", err)
	}
	if got.AttrDefaults["ports"] != float64(8) {
		t.Errorf("defaults did not round-trip, got %#v", got.AttrDefaults)
	}

	// Import resolves models by name rather than id.
	byName, err := s.ModelByName(ctx, child.ID, "SDWAN-X100")
	if err != nil || byName.ID != m.ID {
		t.Errorf("ModelByName = %v, %v", byName.ID, err)
	}
	if _, err := s.ModelByName(ctx, child.ID, "ghost"); !errors.Is(err, ErrNotFound) {
		t.Errorf("an unknown model name must not be auto-created, got %v", err)
	}
}

func TestListFieldsAndModelsReturnEverything(t *testing.T) {
	s, ctx := newStore(t)
	_, child := tree(t, s, ctx)
	if _, err := s.CreateField(ctx, CreateFieldInput{Key: "a", Label: "A", Type: model.FieldText}); err != nil {
		t.Fatal(err)
	}
	if _, err := s.CreateModel(ctx, CreateModelInput{CategoryID: child.ID, Name: "M1"}); err != nil {
		t.Fatal(err)
	}
	fields, err := s.ListFields(ctx)
	if err != nil || len(fields) != 1 {
		t.Errorf("ListFields = %d, %v", len(fields), err)
	}
	models, err := s.ListModels(ctx)
	if err != nil || len(models) != 1 {
		t.Errorf("ListModels = %d, %v", len(models), err)
	}
}
