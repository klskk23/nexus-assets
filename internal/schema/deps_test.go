package schema

import (
	"errors"
	"strings"
	"testing"

	"github.com/klskk23/nexus-assets/internal/model"
)

func computed(key, label, tmpl string) model.FieldDefinition {
	return model.FieldDefinition{
		Key: key, Label: label, Type: model.FieldComputed,
		Options: model.FieldOptions{Template: tmpl},
	}
}

func TestDependencyClosureFollowsExpressionKeysTransitively(t *testing.T) {
	lib := map[string]model.FieldDefinition{
		"label":     computed("label", "标签", `category.code + "-" + str(attrs.sn)`),
		"sn":        computed("sn", "编号", `hex2dec(attrs.mac)`),
		"mac":       {Key: "mac", Label: "MAC", Type: model.FieldMAC},
		"unrelated": {Key: "unrelated", Label: "无关", Type: model.FieldText},
	}

	got, err := DependencyClosure("label", lib)
	if err != nil {
		t.Fatalf("closure: %v", err)
	}
	// mac is reached only through sn: one level of checking would miss it, and
	// the binding would look satisfiable when it is not.
	want := []string{"mac", "sn"}
	if strings.Join(got, ",") != strings.Join(want, ",") {
		t.Errorf("closure = %v, want %v", got, want)
	}
}

func TestDependencyClosureReportsACycleRatherThanLooping(t *testing.T) {
	lib := map[string]model.FieldDefinition{
		"a": computed("a", "A", "attrs.b"),
		"b": computed("b", "B", "attrs.a"),
	}
	_, err := DependencyClosure("a", lib)
	if err == nil {
		t.Fatal("a cycle must be reported, not walked forever")
	}
	if !strings.Contains(err.Error(), "循环依赖") {
		t.Errorf("the error should say it is a cycle, got %v", err)
	}
}

func TestDependencyClosureOfAStaticKeyIsEmpty(t *testing.T) {
	lib := map[string]model.FieldDefinition{"mac": {Key: "mac", Type: model.FieldMAC}}
	got, err := DependencyClosure("mac", lib)
	if err != nil || len(got) != 0 {
		t.Errorf("a static key reads nothing, got %v %v", got, err)
	}
}

// The gate that stops a category from reaching a state where a bound field can
// never be evaluated.
func TestBindGateRefusesUnmetDependencies(t *testing.T) {
	s, ctx := newStore(t)
	root, _ := tree(t, s, ctx)

	sn, err := s.CreateField(ctx, CreateFieldInput{
		Key: "sn", Label: "设备编号", Type: model.FieldComputed, IsUnique: true,
		Options: model.FieldOptions{Template: "hex2dec(attrs.mac)"},
	})
	if err != nil {
		t.Fatal(err)
	}

	// 1. The input does not exist in the library at all.
	err = s.Bind(ctx, root.ID, sn.ID, 10)
	if !errors.Is(err, ErrDependenciesUnmet) {
		t.Fatalf("want ErrDependenciesUnmet, got %v", err)
	}
	if !strings.Contains(err.Error(), "不存在") {
		t.Errorf("the refusal should say the key is unknown, got %v", err)
	}

	// Optional to begin with, so the gate has something to refuse below.
	mac, err := s.CreateField(ctx, CreateFieldInput{
		Key: "mac", Label: "基准 MAC", Type: model.FieldMAC, IsUnique: true,
	})
	if err != nil {
		t.Fatal(err)
	}

	// 2. It exists but is not bound here.
	err = s.Bind(ctx, root.ID, sn.ID, 10)
	if !errors.Is(err, ErrDependenciesUnmet) || !strings.Contains(err.Error(), "尚未绑定") {
		t.Fatalf("an unbound input should be named as such, got %v", err)
	}

	// 3. Bound but optional: an empty value would fail to evaluate, and a failed
	//    evaluation rolls the whole save back.
	if err := s.Bind(ctx, root.ID, mac.ID, 5); err != nil {
		t.Fatal(err)
	}
	err = s.Bind(ctx, root.ID, sn.ID, 10)
	if !errors.Is(err, ErrDependenciesUnmet) || !strings.Contains(err.Error(), "必填") {
		t.Fatalf("an optional input should be named as such, got %v", err)
	}

	// 4. Required: now it binds. The flag is the field's own (018), so this is
	//    one edit rather than a re-bind per category.
	yes := true
	if _, err := s.UpdateField(ctx, mac.ID, UpdateFieldInput{Required: &yes}); err != nil {
		t.Fatal(err)
	}
	if err := s.Bind(ctx, root.ID, sn.ID, 10); err != nil {
		t.Fatalf("with the input bound and required, the bind must succeed: %v", err)
	}
}

// An input bound on an ancestor counts: the effective field set is what matters,
// not where the binding physically lives.
func TestBindGateAcceptsAnInheritedInput(t *testing.T) {
	s, ctx := newStore(t)
	root, child := tree(t, s, ctx)

	mac, err := s.CreateField(ctx, CreateFieldInput{
		Key: "mac", Label: "基准 MAC", Type: model.FieldMAC, IsUnique: true, Required: true,
	})
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
	if err := s.Bind(ctx, root.ID, mac.ID, 10); err != nil {
		t.Fatal(err)
	}
	if err := s.Bind(ctx, child.ID, sn.ID, 20); err != nil {
		t.Fatalf("an inherited input should satisfy the gate: %v", err)
	}
}

// The mirror of the bind gate. Its absence was a live hole: unbinding an input
// left every asset in the category permanently unsaveable, with an error
// pointing at the expression key rather than at the unbind that caused it.
func TestUnbindGateRefusesWhileSomethingReadsTheField(t *testing.T) {
	s, ctx := newStore(t)
	root, child := tree(t, s, ctx)

	mac, _ := s.CreateField(ctx, CreateFieldInput{
		Key: "mac", Label: "基准 MAC", Type: model.FieldMAC, IsUnique: true, Required: true,
	})
	sn, _ := s.CreateField(ctx, CreateFieldInput{
		Key: "sn", Label: "设备编号", Type: model.FieldComputed, IsUnique: true,
		Options: model.FieldOptions{Template: "hex2dec(attrs.mac)"},
	})
	if err := s.Bind(ctx, root.ID, mac.ID, 10); err != nil {
		t.Fatal(err)
	}
	// Bound on the child, reading a field bound on the parent: the reach of the
	// check has to be the subtree, not just the category itself.
	if err := s.Bind(ctx, child.ID, sn.ID, 20); err != nil {
		t.Fatal(err)
	}

	err := s.Unbind(ctx, root.ID, mac.ID)
	if !errors.Is(err, ErrFieldDependedOn) {
		t.Fatalf("want ErrFieldDependedOn, got %v", err)
	}
	if !strings.Contains(err.Error(), "设备编号") {
		t.Errorf("the refusal should name what reads it, got %v", err)
	}

	// Remove the reader first and the input comes free.
	if err := s.Unbind(ctx, child.ID, sn.ID); err != nil {
		t.Fatalf("unbinding the reader itself must be allowed: %v", err)
	}
	if err := s.Unbind(ctx, root.ID, mac.ID); err != nil {
		t.Fatalf("with nothing reading it, the input should unbind: %v", err)
	}
}

func TestUnbindGateRefusesWhileTheFieldIsADisplayKey(t *testing.T) {
	s, ctx := newStore(t)
	root, _ := tree(t, s, ctx)

	tag, _ := s.CreateField(ctx, CreateFieldInput{
		Key: "tag", Label: "资产标签", Type: model.FieldText, IsUnique: true,
	})
	if err := s.Bind(ctx, root.ID, tag.ID, 10); err != nil {
		t.Fatal(err)
	}
	key := "tag"
	if _, err := s.UpdateCategory(ctx, root.ID, UpdateCategoryInput{DisplayKey: &key}); err != nil {
		t.Fatal(err)
	}

	err := s.Unbind(ctx, root.ID, tag.ID)
	if !errors.Is(err, ErrFieldDependedOn) {
		t.Fatalf("want ErrFieldDependedOn, got %v", err)
	}
	if !strings.Contains(err.Error(), "显示编号") {
		t.Errorf("the refusal should say it is the display key, got %v", err)
	}
}

// The bind gate only runs at bind time, so editing a template afterwards was
// the way around it.
func TestTemplateEditIsReCheckedAgainstEveryBoundCategory(t *testing.T) {
	s, ctx := newStore(t)
	root, _ := tree(t, s, ctx)

	mac, _ := s.CreateField(ctx, CreateFieldInput{
		Key: "mac", Label: "基准 MAC", Type: model.FieldMAC, IsUnique: true, Required: true,
	})
	fw, _ := s.CreateField(ctx, CreateFieldInput{
		Key: "firmware", Label: "固件版本", Type: model.FieldText,
	})
	sn, _ := s.CreateField(ctx, CreateFieldInput{
		Key: "sn", Label: "设备编号", Type: model.FieldComputed, IsUnique: true,
		Options: model.FieldOptions{Template: "hex2dec(attrs.mac)"},
	})
	for _, id := range []string{mac.ID, fw.ID, sn.ID} {
		if err := s.Bind(ctx, root.ID, id, 10); err != nil {
			t.Fatal(err)
		}
	}

	opts := model.FieldOptions{Template: "upper(attrs.firmware)"}
	_, err := s.UpdateField(ctx, sn.ID, UpdateFieldInput{Options: &opts})
	if !errors.Is(err, ErrDependenciesUnmet) {
		t.Fatalf("want ErrDependenciesUnmet, got %v", err)
	}
	if !strings.Contains(err.Error(), "网络设备") {
		t.Errorf("the refusal should name the category it breaks, got %v", err)
	}

	// The rejected edit must not have been written.
	after, err := s.GetField(ctx, sn.ID)
	if err != nil {
		t.Fatal(err)
	}
	if after.Options.Template != "hex2dec(attrs.mac)" {
		t.Errorf("the template was changed despite the refusal: %q", after.Options.Template)
	}

	// A label-only edit does not re-run the gate.
	label := "设备序号"
	if _, err := s.UpdateField(ctx, sn.ID, UpdateFieldInput{Label: &label}); err != nil {
		t.Errorf("renaming must stay unaffected by the dependency gate: %v", err)
	}
}
