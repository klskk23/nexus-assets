package schema

import (
	"errors"
	"slices"
	"testing"

	"github.com/klskk23/nexus-assets/internal/i18n"
	"github.com/klskk23/nexus-assets/internal/model"
)

// Binding a group writes exactly the rows binding its members would have, and
// nothing anywhere records that a group was involved.
func TestBindingAGroupLeavesNoTraceOfTheGroup(t *testing.T) {
	s, ctx := newStore(t)
	root, _ := tree(t, s, ctx)

	fw, _ := s.CreateField(ctx, CreateFieldInput{Key: "firmware", Label: "固件", Type: model.FieldText})
	tun, _ := s.CreateField(ctx, CreateFieldInput{Key: "tunnels", Label: "隧道数", Type: model.FieldNumber})
	g, err := s.CreateGroup(ctx, "  网络参数  ", []string{fw.ID, tun.ID, fw.ID})
	if err != nil {
		t.Fatal(err)
	}
	if g.Name != "网络参数" {
		t.Errorf("name = %q, should be trimmed", g.Name)
	}
	if len(g.FieldIDs) != 2 {
		t.Errorf("members should be deduplicated, got %v", g.FieldIDs)
	}

	if err := s.BindGroup(ctx, BindToCategory, root.ID, g.ID); err != nil {
		t.Fatalf("bind group: %v", err)
	}
	fields, err := s.EffectiveFields(ctx, root.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got := boundKeys(fields); !slices.Equal(got, []string{"firmware", "tunnels"}) {
		t.Errorf("both members should be bound, in member order, got %v", got)
	}

	// Deleting the group leaves them: there is no record of where they came
	// from, which is exactly what "a shortcut, not a structure" means.
	if err := s.DeleteGroup(ctx, g.ID); err != nil {
		t.Fatal(err)
	}
	fields, err = s.EffectiveFields(ctx, root.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(fields) != 2 {
		t.Errorf("deleting the group must not unbind anything, got %v", boundKeys(fields))
	}
}

// One member refused refuses the group, and nothing is written -- not even the
// members that were legal on their own.
func TestGroupBindingIsAllOrNothing(t *testing.T) {
	s, ctx := newStore(t)
	root, _ := tree(t, s, ctx)
	dell := vendorNamed(t, s, ctx, "Dell")
	m, err := s.CreateModel(ctx, CreateModelInput{
		Name: "R640", VendorID: dell, CategoryIDs: []string{root.ID},
	})
	if err != nil {
		t.Fatal(err)
	}

	fw, _ := s.CreateField(ctx, CreateFieldInput{Key: "firmware", Label: "固件", Type: model.FieldText})
	tun, _ := s.CreateField(ctx, CreateFieldInput{Key: "tunnels", Label: "隧道数", Type: model.FieldNumber})
	if err := s.Bind(ctx, root.ID, fw.ID, 10); err != nil {
		t.Fatal(err)
	}
	g, err := s.CreateGroup(ctx, "网络参数", []string{fw.ID, tun.ID})
	if err != nil {
		t.Fatal(err)
	}

	err = s.BindGroup(ctx, BindToModel, m.ID, g.ID)
	if !errors.Is(err, ErrBindingModeConflict) {
		t.Fatalf("the category-bound member should refuse the group, got %v", err)
	}
	if !i18n.HasKey(err, i18n.KeyGroupBindRefused) {
		t.Errorf("the refusal should name the group and the member: %v", err)
	}

	// tunnels was legal by itself and must still be unbound.
	byModel, err := s.ModelBindingsByModel(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(byModel[m.ID]) != 0 {
		t.Errorf("a refused group writes nothing, got %v", byModel[m.ID])
	}

	// The vendor target refuses for the same reason, through the same path.
	if err := s.BindGroup(ctx, BindToVendor, dell, g.ID); !errors.Is(err, ErrBindingModeConflict) {
		t.Errorf("the vendor target should refuse it too, got %v", err)
	}
}

// Group CRUD, plus the two answers the field page needs.
func TestGroupCrudAndMembership(t *testing.T) {
	s, ctx := newStore(t)
	fw, _ := s.CreateField(ctx, CreateFieldInput{Key: "firmware", Label: "固件", Type: model.FieldText})
	tun, _ := s.CreateField(ctx, CreateFieldInput{Key: "tunnels", Label: "隧道数", Type: model.FieldNumber})

	if _, err := s.CreateGroup(ctx, "   ", nil); !errors.Is(err, ErrGroupInvalid) {
		t.Errorf("a nameless group should be refused, got %v", err)
	}
	if _, err := s.CreateGroup(ctx, "幽灵", []string{"missing"}); !errors.Is(err, ErrNotFound) {
		t.Errorf("a member that does not exist is not found, got %v", err)
	}

	g, err := s.CreateGroup(ctx, "网络参数", []string{fw.ID})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.CreateGroup(ctx, "网络参数", nil); !errors.Is(err, ErrGroupInvalid) {
		t.Errorf("a duplicate name should be refused, got %v", err)
	}

	other, err := s.CreateGroup(ctx, "维保参数", []string{fw.ID})
	if err != nil {
		t.Fatal(err)
	}

	// Members are replaced wholesale, not merged.
	name := "网络与隧道"
	members := []string{tun.ID}
	got, err := s.UpdateGroup(ctx, g.ID, &name, &members)
	if err != nil {
		t.Fatal(err)
	}
	if got.Name != name || !slices.Equal(got.FieldIDs, []string{tun.ID}) {
		t.Errorf("update = %+v, want the name and the new member list", got)
	}
	blank := "  "
	if _, err := s.UpdateGroup(ctx, g.ID, &blank, nil); !errors.Is(err, ErrGroupInvalid) {
		t.Errorf("renaming to nothing should be refused, got %v", err)
	}
	if _, err := s.UpdateGroup(ctx, "missing", &name, nil); !errors.Is(err, ErrNotFound) {
		t.Errorf("updating what is not there is not found, got %v", err)
	}

	list, err := s.ListGroups(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 2 {
		t.Fatalf("want both groups, got %v", list)
	}

	// A field may be in several groups; that is what the group filter reads.
	inGroups, err := s.GroupsOfField(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if !slices.Contains(inGroups[fw.ID], other.ID) {
		t.Errorf("firmware should still be in the other group, got %v", inGroups[fw.ID])
	}

	if err := s.DeleteGroup(ctx, g.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := s.GetGroup(ctx, g.ID); !errors.Is(err, ErrNotFound) {
		t.Errorf("want ErrNotFound after delete, got %v", err)
	}
	if err := s.DeleteGroup(ctx, "missing"); !errors.Is(err, ErrNotFound) {
		t.Errorf("deleting what is not there is not found, got %v", err)
	}
	if err := s.BindGroup(ctx, BindToCategory, "nowhere", "missing"); !errors.Is(err, ErrNotFound) {
		t.Errorf("binding a group that is not there is not found, got %v", err)
	}
}
