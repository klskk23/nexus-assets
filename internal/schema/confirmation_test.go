package schema

import (
	"context"
	"database/sql"
	"errors"
	"reflect"
	"testing"
)

// A valid confirmation must authorize exactly the previewed final draft, not
// merely the same count of changes. Replanning must happen before the first write.
func TestCategoryConfirmationBindsDraftAndSchema(t *testing.T) {
	for _, scenario := range []string{"valid", "missing", "forged", "draft", "schema", "restart"} {
		t.Run(scenario, func(t *testing.T) {
			s, ctx := newStore(t)
			seedSnapshot(t, s, ctx)
			ids := []string{}
			name := "Confirmed child"
			draft := CategoryDraft{Name: &name, InheritedFieldIDs: &ids}
			preview, err := s.PreviewCategory(ctx, "child", draft)
			if err != nil {
				t.Fatal(err)
			}
			if preview.ConfirmationToken == "" || !preview.RequiresConfirmation {
				t.Fatalf("withdrawal was not confirmable: %+v", preview)
			}
			token := preview.ConfirmationToken
			switch scenario {
			case "missing":
				token = ""
			case "forged":
				token = "forged"
			case "draft":
				name = "Different name"
			case "schema":
				if err := s.db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
					_, err := tx.ExecContext(ctx, `UPDATE field_definitions SET label = 'Changed label' WHERE id = 'a'`)
					return err
				}); err != nil {
					t.Fatal(err)
				}
			case "restart":
				s.confirmationKey = newConfirmationKey()
			}
			before := selectionState(t, s, ctx)
			old, err := s.GetCategory(ctx, "child")
			if err != nil {
				t.Fatal(err)
			}
			_, err = s.UpdateCategory(ctx, "child", UpdateCategoryInput{Name: &name, InheritedFieldIDs: &ids, ConfirmationToken: token})
			if scenario == "valid" {
				if err != nil {
					t.Fatal(err)
				}
				for _, id := range []string{"child", "leaf"} {
					fields, err := s.EffectiveFields(ctx, id)
					if err != nil {
						t.Fatal(err)
					}
					for _, f := range fields {
						if f.ID == "a" {
							t.Fatalf("withdrawn field survived on %s", id)
						}
					}
				}
				return
			}
			want := ErrImpactStale
			if scenario == "missing" {
				want = ErrConfirmationRequired
			}
			if !errors.Is(err, want) {
				t.Fatalf("error = %v, want %v", err, want)
			}
			after, err := s.GetCategory(ctx, "child")
			if err != nil {
				t.Fatal(err)
			}
			if before != selectionState(t, s, ctx) || !reflect.DeepEqual(old, after) {
				t.Fatal("rejected confirmation wrote metadata")
			}
		})
	}
}

func TestCategoryConfirmationCanonicalSelections(t *testing.T) {
	s, ctx := newStore(t)
	seedSnapshot(t, s, ctx)
	// Removing a while adding b still requires confirmation. Duplicate selections
	// and their order do not create a different operation.
	first, second := []string{"b", "b"}, []string{"b"}
	p, err := s.PreviewCategory(ctx, "child", CategoryDraft{InheritedFieldIDs: &first})
	if err != nil {
		t.Fatal(err)
	}
	if p.ConfirmationToken == "" {
		t.Fatal("missing confirmation")
	}
	p2, err := s.PreviewCategory(ctx, "child", CategoryDraft{InheritedFieldIDs: &second})
	if err != nil || p2.ConfirmationToken != p.ConfirmationToken {
		t.Fatalf("noncanonical selections: %v", err)
	}
	if _, err := s.UpdateCategory(ctx, "child", UpdateCategoryInput{InheritedFieldIDs: &second, ConfirmationToken: p.ConfirmationToken}); err != nil {
		t.Fatal(err)
	}
}

func TestCategoryConfirmationNotIssuedForIssuesOrRename(t *testing.T) {
	s, ctx := newStore(t)
	seedSnapshot(t, s, ctx)
	ids, key := []string{}, "tag"
	p, err := s.PreviewCategory(ctx, "child", CategoryDraft{InheritedFieldIDs: &ids, DisplayKey: &key})
	if err != nil {
		t.Fatal(err)
	}
	if len(p.Issues) == 0 || p.ConfirmationToken != "" {
		t.Fatalf("invalid draft signed: %+v", p)
	}
	name := "Rename"
	p, err = s.PreviewCategory(ctx, "child", CategoryDraft{Name: &name})
	if err != nil || p.RequiresConfirmation || p.ConfirmationToken != "" {
		t.Fatalf("rename needs confirmation: %+v %v", p, err)
	}
	if _, err := s.UpdateCategory(ctx, "child", UpdateCategoryInput{Name: &name}); err != nil {
		t.Fatal(err)
	}
}
