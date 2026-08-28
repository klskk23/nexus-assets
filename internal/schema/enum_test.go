package schema

import (
	"testing"

	"github.com/klskk23/nexus-assets/internal/model"
)

// Retiring an option must not erase what existing devices already record.
func TestRemovedEnumOptionIsKeptAndFlagged(t *testing.T) {
	s, ctx := newStore(t)

	f, err := s.CreateField(ctx, CreateFieldInput{
		Key: "firmware", Label: "固件版本", Type: model.FieldEnum,
		Options: model.FieldOptions{Choices: []model.EnumChoice{
			{Value: "v190", Label: "1.9.0"},
			{Value: "v213", Label: "2.1.3"},
		}},
	})
	if err != nil {
		t.Fatal(err)
	}

	retired := model.FieldOptions{
		Choices:    f.Options.Choices,
		Deprecated: []string{"v190"},
	}
	updated, err := s.UpdateField(ctx, f.ID, UpdateFieldInput{Options: &retired})
	if err != nil {
		t.Fatalf("retire an option: %v", err)
	}

	// Still a known choice, so an existing asset holding it still renders.
	if !ChoiceExists(updated.Options, "v190") {
		t.Error("a retired option must remain among the choices")
	}
	if !IsDeprecatedChoice(updated.Options, "v190") {
		t.Error("it should report as deprecated")
	}
	if IsDeprecatedChoice(updated.Options, "v213") {
		t.Error("the current option must not be flagged")
	}
}

// Dropping the choice outright is refused: the stored value would become
// meaningless with no way to display it.
func TestDeprecatingAValueThatIsNotAChoiceIsRefused(t *testing.T) {
	s, ctx := newStore(t)
	f, err := s.CreateField(ctx, CreateFieldInput{
		Key: "tier", Label: "档次", Type: model.FieldEnum,
		Options: model.FieldOptions{Choices: []model.EnumChoice{{Value: "a", Label: "A"}}},
	})
	if err != nil {
		t.Fatal(err)
	}
	bad := model.FieldOptions{
		Choices:    []model.EnumChoice{{Value: "a", Label: "A"}},
		Deprecated: []string{"ghost"},
	}
	if _, err := s.UpdateField(ctx, f.ID, UpdateFieldInput{Options: &bad}); err == nil {
		t.Fatal("deprecating a value that is not a choice must be refused")
	}
}
