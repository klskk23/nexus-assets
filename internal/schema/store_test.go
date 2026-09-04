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
	t.Cleanup(func() { _ = db.Close() })
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

// The display key is deliberately not inherited, unlike a bound field. A child
// category is usually exactly where a different numbering rule belongs, so
// silently adopting the parent's would be the wrong default.
func TestDisplayKeyIsNotInherited(t *testing.T) {
	s, ctx := newStore(t)
	root, child := tree(t, s, ctx)

	tag, err := s.CreateField(ctx, CreateFieldInput{
		Key: "tag", Label: "标签", Type: model.FieldText, IsUnique: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := s.Bind(ctx, root.ID, tag.ID, 10); err != nil {
		t.Fatal(err)
	}
	key := "tag"
	if _, err := s.UpdateCategory(ctx, root.ID, UpdateCategoryInput{DisplayKey: &key}); err != nil {
		t.Fatalf("set root display key: %v", err)
	}

	keys, err := s.DisplayKeys(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if keys[root.ID] != "tag" {
		t.Errorf("root display key = %q", keys[root.ID])
	}
	if keys[child.ID] != "" {
		t.Errorf("the child must not inherit the parent's display key, got %q", keys[child.ID])
	}

	// An inherited binding is still eligible, it just has to be chosen.
	if _, err := s.UpdateCategory(ctx, child.ID, UpdateCategoryInput{DisplayKey: &key}); err != nil {
		t.Fatalf("a key inherited from the parent must be selectable: %v", err)
	}
}

func TestBindRejectsKeyAlreadyOnTheChain(t *testing.T) {
	s, ctx := newStore(t)
	root, child := tree(t, s, ctx)

	mac, err := s.CreateField(ctx, CreateFieldInput{
		Key: "mac", Label: "基准 MAC", Type: model.FieldMAC, IsUnique: true, Required: true,
	})
	if err != nil {
		t.Fatalf("create field: %v", err)
	}
	if err := s.Bind(ctx, root.ID, mac.ID, 10); err != nil {
		t.Fatalf("bind on root: %v", err)
	}

	// A child may only append. Rebinding the same key must be refused, since
	// there is no override rule to resolve the ambiguity.
	err = s.Bind(ctx, child.ID, mac.ID, 10)
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

	mac, _ := s.CreateField(ctx, CreateFieldInput{
		Key: "mac", Label: "MAC", Type: model.FieldMAC, Required: true,
	})
	tun, _ := s.CreateField(ctx, CreateFieldInput{Key: "tunnels", Label: "隧道数", Type: model.FieldNumber})
	if err := s.Bind(ctx, root.ID, mac.ID, 10); err != nil {
		t.Fatal(err)
	}
	if err := s.Bind(ctx, child.ID, tun.ID, 20); err != nil {
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
	if err := s.Bind(ctx, root.ID, f.ID, 10); err != nil {
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
		CategoryIDs: []string{child.ID}, Name: "SDWAN-X100", Vendor: "Acme",
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

	if len(got.CategoryIDs) != 1 || got.CategoryIDs[0] != child.ID {
		t.Errorf("the association did not round-trip, got %v", got.CategoryIDs)
	}

	// Import resolves models by name rather than id.
	byName, err := s.ModelByName(ctx, "SDWAN-X100")
	if err != nil || byName.ID != m.ID {
		t.Errorf("ModelByName = %v, %v", byName.ID, err)
	}
	if _, err := s.ModelByName(ctx, "ghost"); !errors.Is(err, ErrNotFound) {
		t.Errorf("an unknown model name must not be auto-created, got %v", err)
	}
}

func TestListFieldsAndModelsReturnEverything(t *testing.T) {
	s, ctx := newStore(t)
	_, child := tree(t, s, ctx)
	if _, err := s.CreateField(ctx, CreateFieldInput{Key: "a", Label: "A", Type: model.FieldText}); err != nil {
		t.Fatal(err)
	}
	if _, err := s.CreateModel(ctx, CreateModelInput{CategoryIDs: []string{child.ID}, Name: "M1"}); err != nil {
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

// modelOn creates a product model registered under the given categories.
func modelOn(t *testing.T, s *Store, ctx context.Context, name string, categoryIDs ...string) model.ProductModel {
	t.Helper()
	m, err := s.CreateModel(ctx, CreateModelInput{
		Name: name, Vendor: "Dell", CategoryIDs: categoryIDs,
	})
	if err != nil {
		t.Fatalf("create model %s: %v", name, err)
	}
	return m
}

// A category's field set is both halves at once: what its own chain binds, and
// what the models registered on that chain bind (015, decision 101).
func TestEffectiveFieldsIncludesModelBoundFields(t *testing.T) {
	s, ctx := newStore(t)
	root, child := tree(t, s, ctx)
	dell := modelOn(t, s, ctx, "Latitude 5420", child.ID)

	mac, _ := s.CreateField(ctx, CreateFieldInput{
		Key: "mac", Label: "MAC", Type: model.FieldMAC, Required: true,
	})
	tag, _ := s.CreateField(ctx, CreateFieldInput{Key: "servicetag", Label: "ServiceTag", Type: model.FieldText})
	if err := s.Bind(ctx, root.ID, mac.ID, 10); err != nil {
		t.Fatal(err)
	}
	if err := s.BindModel(ctx, dell.ID, tag.ID, 20); err != nil {
		t.Fatalf("bind model: %v", err)
	}

	fields, err := s.EffectiveFields(ctx, child.ID)
	if err != nil {
		t.Fatalf("effective fields: %v", err)
	}
	byKey := map[string]model.BoundField{}
	for _, f := range fields {
		byKey[f.Key] = f
	}
	if len(fields) != 2 {
		t.Fatalf("got %d fields, want mac and servicetag", len(fields))
	}
	// A category field carries no models: that is what says it applies to every
	// asset here rather than to some of them.
	if len(byKey["mac"].ModelIDs) != 0 {
		t.Errorf("a category-bound field should carry no model ids, got %v", byKey["mac"].ModelIDs)
	}
	if got := byKey["servicetag"].ModelIDs; len(got) != 1 || got[0] != dell.ID {
		t.Errorf("servicetag should name the model it is bound to, got %v", got)
	}
}

// One field on several models is one column, not one per model -- otherwise the
// export would repeat it and the entry form would draw it twice.
func TestEffectiveFieldsMergesAFieldBoundToSeveralModels(t *testing.T) {
	s, ctx := newStore(t)
	_, child := tree(t, s, ctx)
	a := modelOn(t, s, ctx, "Latitude 5420", child.ID)
	b := modelOn(t, s, ctx, "OptiPlex 7090", child.ID)

	tag, _ := s.CreateField(ctx, CreateFieldInput{Key: "servicetag", Label: "ServiceTag", Type: model.FieldText})
	for _, m := range []model.ProductModel{a, b} {
		if err := s.BindModel(ctx, m.ID, tag.ID, 10); err != nil {
			t.Fatalf("bind %s: %v", m.Name, err)
		}
	}

	fields, err := s.EffectiveFields(ctx, child.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(fields) != 1 {
		t.Fatalf("got %d fields, want one merged entry", len(fields))
	}
	if len(fields[0].ModelIDs) != 2 {
		t.Errorf("the entry should name both models, got %v", fields[0].ModelIDs)
	}
}

// A model registered somewhere else contributes nothing here.
func TestEffectiveFieldsIgnoresModelsOutsideTheChain(t *testing.T) {
	s, ctx := newStore(t)
	root, child := tree(t, s, ctx)
	other, err := s.CreateCategory(ctx, CreateCategoryInput{Code: "SW", Name: "交换机"})
	if err != nil {
		t.Fatal(err)
	}
	elsewhere := modelOn(t, s, ctx, "Catalyst", other.ID)

	tag, _ := s.CreateField(ctx, CreateFieldInput{Key: "servicetag", Label: "ServiceTag", Type: model.FieldText})
	if err := s.BindModel(ctx, elsewhere.ID, tag.ID, 10); err != nil {
		t.Fatal(err)
	}

	for _, id := range []string{root.ID, child.ID} {
		fields, err := s.EffectiveFields(ctx, id)
		if err != nil {
			t.Fatal(err)
		}
		if len(fields) != 0 {
			t.Errorf("category %s picked up a field from a model registered elsewhere: %v", id, fields)
		}
	}
}

// The two binding modes are exclusive (decision 96).
func TestBindingModesAreExclusive(t *testing.T) {
	s, ctx := newStore(t)
	root, child := tree(t, s, ctx)
	dell := modelOn(t, s, ctx, "Latitude 5420", child.ID)

	byCategory, _ := s.CreateField(ctx, CreateFieldInput{Key: "mac", Label: "MAC", Type: model.FieldMAC})
	if err := s.Bind(ctx, root.ID, byCategory.ID, 10); err != nil {
		t.Fatal(err)
	}
	if err := s.BindModel(ctx, dell.ID, byCategory.ID, 10); !errors.Is(err, ErrBindingModeConflict) {
		t.Errorf("binding a category field to a model should be refused, got %v", err)
	}

	byModel, _ := s.CreateField(ctx, CreateFieldInput{Key: "servicetag", Label: "ServiceTag", Type: model.FieldText})
	if err := s.BindModel(ctx, dell.ID, byModel.ID, 10); err != nil {
		t.Fatal(err)
	}
	if err := s.Bind(ctx, child.ID, byModel.ID, 10); !errors.Is(err, ErrBindingModeConflict) {
		t.Errorf("binding a model field to a category should be refused, got %v", err)
	}
}

// Unbinding takes the field off the model and nothing else: the definition
// stays, and so does every value already stored under it.
func TestUnbindModelLeavesTheDefinitionAlone(t *testing.T) {
	s, ctx := newStore(t)
	_, child := tree(t, s, ctx)
	dell := modelOn(t, s, ctx, "Latitude 5420", child.ID)
	tag, _ := s.CreateField(ctx, CreateFieldInput{Key: "servicetag", Label: "ServiceTag", Type: model.FieldText})
	if err := s.BindModel(ctx, dell.ID, tag.ID, 10); err != nil {
		t.Fatal(err)
	}

	if err := s.UnbindModel(ctx, dell.ID, tag.ID); err != nil {
		t.Fatalf("unbind: %v", err)
	}
	fields, err := s.EffectiveFields(ctx, child.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(fields) != 0 {
		t.Errorf("the field should be off the category's set, got %v", fields)
	}
	if _, err := s.GetField(ctx, tag.ID); err != nil {
		t.Errorf("the definition itself should survive: %v", err)
	}
	// Unbinding what is not bound is a miss, not a silent success.
	if err := s.UnbindModel(ctx, dell.ID, tag.ID); !errors.Is(err, ErrNotFound) {
		t.Errorf("second unbind should report the binding is gone, got %v", err)
	}
}

// ModelsOfField is what tells the interface which models a field is for.
func TestModelsOfFieldNamesEveryBinding(t *testing.T) {
	s, ctx := newStore(t)
	_, child := tree(t, s, ctx)
	a := modelOn(t, s, ctx, "Latitude 5420", child.ID)
	b := modelOn(t, s, ctx, "OptiPlex 7090", child.ID)
	tag, _ := s.CreateField(ctx, CreateFieldInput{Key: "servicetag", Label: "ServiceTag", Type: model.FieldText})
	for _, m := range []model.ProductModel{a, b} {
		if err := s.BindModel(ctx, m.ID, tag.ID, 10); err != nil {
			t.Fatal(err)
		}
	}

	got, err := s.ModelsOfField(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(got[tag.ID]) != 2 {
		t.Errorf("the field should name both models, got %v", got[tag.ID])
	}
}

// A key already reachable by the assets this binding would cover is refused,
// whichever kind of binding put it there: attrs is a flat map, and two
// definitions cannot share one key.
func TestModelBindingRefusesAKeyTakenOnTheCategory(t *testing.T) {
	s, ctx := newStore(t)
	root, child := tree(t, s, ctx)
	dell := modelOn(t, s, ctx, "Latitude 5420", child.ID)

	onCategory, _ := s.CreateField(ctx, CreateFieldInput{Key: "sn", Label: "编号", Type: model.FieldText})
	if err := s.Bind(ctx, root.ID, onCategory.ID, 10); err != nil {
		t.Fatal(err)
	}
	// A different definition carrying the same key.
	clash, _ := s.CreateField(ctx, CreateFieldInput{Key: "sn", Label: "另一个编号", Type: model.FieldText})
	if err := s.BindModel(ctx, dell.ID, clash.ID, 10); !errors.Is(err, ErrKeyConflict) {
		t.Errorf("a key taken on the model's own category should be refused, got %v", err)
	}

	// And one taken by another field on the same model.
	other := modelOn(t, s, ctx, "OptiPlex 7090", child.ID)
	first, _ := s.CreateField(ctx, CreateFieldInput{Key: "tag", Label: "标签", Type: model.FieldText})
	second, _ := s.CreateField(ctx, CreateFieldInput{Key: "tag", Label: "另一个标签", Type: model.FieldText})
	if err := s.BindModel(ctx, other.ID, first.ID, 10); err != nil {
		t.Fatal(err)
	}
	if err := s.BindModel(ctx, other.ID, second.ID, 10); !errors.Is(err, ErrKeyConflict) {
		t.Errorf("a key taken on the same model should be refused, got %v", err)
	}
}

// Binding to something that does not exist is a miss, not a panic.
func TestModelBindingRefusesUnknownIDs(t *testing.T) {
	s, ctx := newStore(t)
	_, child := tree(t, s, ctx)
	dell := modelOn(t, s, ctx, "Latitude 5420", child.ID)
	tag, _ := s.CreateField(ctx, CreateFieldInput{Key: "servicetag", Label: "ServiceTag", Type: model.FieldText})

	if err := s.BindModel(ctx, dell.ID, "no-such-field", 10); !errors.Is(err, ErrNotFound) {
		t.Errorf("unknown field should be reported, got %v", err)
	}
	if err := s.BindModel(ctx, "no-such-model", tag.ID, 10); !errors.Is(err, ErrNotFound) {
		t.Errorf("unknown model should be reported, got %v", err)
	}
}

// ForModel is the narrowing that decides what one device sees.
func TestForModelNarrowsToTheDeviceInFront(t *testing.T) {
	dell, lenovo := "m-dell", "m-lenovo"
	fields := []model.BoundField{
		{FieldDefinition: model.FieldDefinition{ID: "f1", Key: "mac"}},
		{FieldDefinition: model.FieldDefinition{ID: "f2", Key: "servicetag"}, ModelIDs: []string{dell}},
	}

	keys := func(in []model.BoundField) []string {
		out := make([]string, 0, len(in))
		for _, f := range in {
			out = append(out, f.Key)
		}
		return out
	}
	if got := keys(ForModel(fields, &dell)); strings.Join(got, ",") != "mac,servicetag" {
		t.Errorf("a Dell sees both, got %v", got)
	}
	if got := keys(ForModel(fields, &lenovo)); strings.Join(got, ",") != "mac" {
		t.Errorf("a Lenovo sees only the category field, got %v", got)
	}
	if got := keys(ForModel(fields, nil)); strings.Join(got, ",") != "mac" {
		t.Errorf("a device with no model sees only category fields, got %v", got)
	}
}

// The count a required model binding shows is this model's devices and no
// others -- the same promise the category side makes, aimed narrower.
func TestModelRequiredImpactCountsThisModelOnly(t *testing.T) {
	s, ctx := newStore(t)
	_, child := tree(t, s, ctx)
	dell := modelOn(t, s, ctx, "Latitude 5420", child.ID)

	n, err := s.ModelRequiredImpact(ctx, dell.ID)
	if err != nil {
		t.Fatalf("impact: %v", err)
	}
	if n != 0 {
		t.Errorf("a model with no devices should count zero, got %d", n)
	}
}

// The numbering field must apply to every asset in the category, and a model
// field applies to some of them (decision 100). The refusal has its own reason:
// saying "unbound" would send somebody looking for a binding already there.
func TestDisplayKeyRefusesModelBoundFields(t *testing.T) {
	s, ctx := newStore(t)
	_, child := tree(t, s, ctx)
	dell := modelOn(t, s, ctx, "Latitude 5420", child.ID)

	tag, _ := s.CreateField(ctx, CreateFieldInput{
		Key: "servicetag", Label: "ServiceTag", Type: model.FieldText, IsUnique: true,
	})
	if err := s.BindModel(ctx, dell.ID, tag.ID, 10); err != nil {
		t.Fatal(err)
	}

	key := "servicetag"
	_, err := s.UpdateCategory(ctx, child.ID, UpdateCategoryInput{DisplayKey: &key})
	if !errors.Is(err, ErrDisplayKeyNotCategoryField) {
		t.Fatalf("a model field must not become the numbering field, got %v", err)
	}

	// A key bound nowhere still reports the older, different reason.
	missing := "nothing"
	_, err = s.UpdateCategory(ctx, child.ID, UpdateCategoryInput{DisplayKey: &missing})
	if !errors.Is(err, ErrDisplayKeyInvalid) {
		t.Errorf("an unbound key should still be reported as unbound, got %v", err)
	}
}

// Creating a field and binding it to models in one transaction, the way
// creating and binding to categories already worked. A refused binding must
// still take the field down with it: half a result is not worth keeping.
func TestCreateFieldBindsModelsInTheSameTransaction(t *testing.T) {
	s, ctx := newStore(t)
	_, child := tree(t, s, ctx)
	dell := modelOn(t, s, ctx, "Latitude 5420", child.ID)

	f, err := s.CreateField(ctx, CreateFieldInput{
		Key: "servicetag", Label: "ServiceTag", Type: model.FieldText,
		ModelIDs: []string{dell.ID}, Required: true,
	})
	if err != nil {
		t.Fatalf("create bound to a model: %v", err)
	}
	onModels, err := s.ModelsOfField(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if got := onModels[f.ID]; len(got) != 1 || got[0] != dell.ID {
		t.Errorf("field should be bound to the model, got %v", got)
	}

	// A model that is not there refuses the binding, and the field goes with it.
	if _, err := s.CreateField(ctx, CreateFieldInput{
		Key: "rack", Label: "机柜", Type: model.FieldText, ModelIDs: []string{"missing"},
	}); err == nil {
		t.Fatal("binding to a model that does not exist should be refused")
	}
	all, err := s.ListFields(ctx)
	if err != nil {
		t.Fatal(err)
	}
	for _, x := range all {
		if x.Key == "rack" {
			t.Error("a refused binding must leave no field behind")
		}
	}
}

// Required is the field's own flag now (018): it reaches every binding, and
// changing it is one edit rather than one per category the field is on.
func TestRequiredBelongsToTheFieldAndReachesEveryBinding(t *testing.T) {
	s, ctx := newStore(t)
	root, _ := tree(t, s, ctx)
	other, err := s.CreateCategory(ctx, CreateCategoryInput{Code: "PRN", Name: "打印机"})
	if err != nil {
		t.Fatal(err)
	}

	rack, err := s.CreateField(ctx, CreateFieldInput{
		Key: "rack", Label: "机柜", Type: model.FieldText, Required: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := s.Bind(ctx, root.ID, rack.ID, 10); err != nil {
		t.Fatal(err)
	}
	if err := s.Bind(ctx, other.ID, rack.ID, 10); err != nil {
		t.Fatal(err)
	}

	for _, c := range []model.Category{root, other} {
		fields, err := s.EffectiveFields(ctx, c.ID)
		if err != nil {
			t.Fatal(err)
		}
		found := false
		for _, f := range fields {
			if f.Key == "rack" {
				found = true
				if !f.Required {
					t.Errorf("rack should be required on %s too", c.Name)
				}
			}
		}
		if !found {
			t.Fatalf("rack missing from %s", c.Name)
		}
	}

	// And turning it off is one edit, not one per binding.
	no := false
	if _, err := s.UpdateField(ctx, rack.ID, UpdateFieldInput{Required: &no}); err != nil {
		t.Fatal(err)
	}
	fields, err := s.EffectiveFields(ctx, other.ID)
	if err != nil {
		t.Fatal(err)
	}
	for _, f := range fields {
		if f.Key == "rack" && f.Required {
			t.Error("clearing the field's flag should clear it everywhere")
		}
	}
}
