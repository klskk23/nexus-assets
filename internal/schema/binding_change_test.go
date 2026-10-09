package schema

import (
	"context"
	"database/sql"
	"errors"
	"testing"

	"github.com/klskk23/nexus-assets/internal/model"
)

// A path-based dependency check incorrectly accepts an unselected ancestor input.
func TestCategoryBindUsesSelectedDependencies(t *testing.T) {
	s, ctx := newStore(t)
	seedSnapshot(t, s, ctx)
	requireBindingNote(t, s, ctx)
	f, err := s.CreateField(ctx, CreateFieldInput{Key: "derived", Label: "Derived", Type: model.FieldComputed, Options: model.FieldOptions{Template: `attrs.note`}})
	if err != nil {
		t.Fatal(err)
	}
	if err := s.Bind(ctx, "child", f.ID, 30); !errors.Is(err, ErrDependenciesUnmet) {
		t.Fatalf("unselected ancestor input accepted: %v", err)
	}
	fields, err := s.EffectiveFields(ctx, "child")
	if err != nil || len(fields) != 2 {
		t.Fatalf("failed binding persisted: %+v %v", fields, err)
	}
}

// Validating a group member before all members exist makes ordering observable.
func TestCategoryGroupBindingValidatesFinalSet(t *testing.T) {
	for _, create := range []bool{false, true} {
		for _, reversed := range []bool{false, true} {
			t.Run(fmtBindingCase(create, reversed), func(t *testing.T) {
				s, ctx := newStore(t)
				root, _ := tree(t, s, ctx)
				input, err := s.CreateField(ctx, CreateFieldInput{Key: "input", Label: "Input", Type: model.FieldText, Required: true})
				if err != nil {
					t.Fatal(err)
				}
				computed, err := s.CreateField(ctx, CreateFieldInput{Key: "derived", Label: "Derived", Type: model.FieldComputed, Options: model.FieldOptions{Template: `attrs.input`}})
				if err != nil {
					t.Fatal(err)
				}
				ids := []string{computed.ID, input.ID}
				if reversed {
					ids = []string{input.ID, computed.ID}
				}
				in := CreateGroupInput{Name: "Pair", FieldIDs: ids}
				if create {
					in.CategoryIDs = []string{root.ID}
				}
				g, err := s.CreateGroup(ctx, in)
				if err != nil {
					t.Fatal(err)
				}
				if !create {
					if err := s.BindGroup(ctx, BindToCategory, root.ID, g.ID); err != nil {
						t.Fatal(err)
					}
				}
				fields, err := s.EffectiveFields(ctx, root.ID)
				if err != nil || len(fields) != 2 || fields[0].ID != ids[0] {
					t.Fatalf("wrong final group: %+v %v", fields, err)
				}
			})
		}
	}
}

func fmtBindingCase(create, reversed bool) string {
	name := "existing"
	if create {
		name = "create"
	}
	if reversed {
		name += "/input-first"
	} else {
		name += "/computed-first"
	}
	return name
}

func TestCategoryBindingFailsClosedWithoutEffects(t *testing.T) {
	for _, entry := range []string{"bind", "create-field", "bind-group", "create-group"} {
		t.Run(entry, func(t *testing.T) {
			s, ctx := newStore(t)
			seedSnapshot(t, s, ctx)
			seedAsset(t, s, ctx, "child", "asset", `{}`)
			in := CreateFieldInput{Key: "new_field", Label: "New field", Type: model.FieldText}
			if entry == "create-field" {
				in.CategoryIDs = []string{"child"}
				if _, err := s.CreateField(ctx, in); !errors.Is(err, ErrSchemaEffectsUnavailable) {
					t.Fatalf("missing effects accepted: %v", err)
				}
				var count int
				if err := s.db.ReadDB().QueryRowContext(ctx, `SELECT count(*) FROM field_definitions WHERE key='new_field'`).Scan(&count); err != nil || count != 0 {
					t.Fatalf("field survived rollback: %d %v", count, err)
				}
				return
			}
			f, err := s.CreateField(ctx, in)
			if err != nil {
				t.Fatal(err)
			}
			switch entry {
			case "bind":
				err = s.Bind(ctx, "child", f.ID, 0)
			case "bind-group":
				g, e := s.CreateGroup(ctx, CreateGroupInput{Name: "Group", FieldIDs: []string{f.ID}})
				if e != nil {
					t.Fatal(e)
				}
				err = s.BindGroup(ctx, BindToCategory, "child", g.ID)
			case "create-group":
				_, err = s.CreateGroup(ctx, CreateGroupInput{Name: "Group", FieldIDs: []string{f.ID}, GroupTargets: GroupTargets{CategoryIDs: []string{"child"}}})
			}
			if !errors.Is(err, ErrSchemaEffectsUnavailable) {
				t.Fatalf("missing effects accepted: %v", err)
			}
			var count int
			if err := s.db.ReadDB().QueryRowContext(ctx, `SELECT count(*) FROM category_fields WHERE field_id=?`, f.ID).Scan(&count); err != nil || count != 0 {
				t.Fatalf("binding survived rollback: %d %v", count, err)
			}
		})
	}
}

func TestUnbindRequiresConfirmationBeforeWrites(t *testing.T) {
	s, ctx := newStore(t)
	seedSnapshot(t, s, ctx)
	before := selectionState(t, s, ctx)
	if err := s.Unbind(ctx, "root", "a"); !errors.Is(err, ErrConfirmationRequired) {
		t.Fatalf("destructive unbind without confirmation: %v", err)
	}
	if selectionState(t, s, ctx) != before {
		t.Fatal("rejected unbind changed selections")
	}
	var count int
	if err := s.db.ReadDB().QueryRowContext(ctx, `SELECT count(*) FROM category_fields WHERE category_id='root' AND field_id='a'`).Scan(&count); err != nil || count != 1 {
		t.Fatalf("rejected unbind removed source: %d %v", count, err)
	}
}

func TestCategoryBindRejectsMissingInputInCreateField(t *testing.T) {
	s, ctx := newStore(t)
	seedSnapshot(t, s, ctx)
	requireBindingNote(t, s, ctx)
	_, err := s.CreateField(ctx, CreateFieldInput{Key: "derived", Label: "Derived", Type: model.FieldComputed, Options: model.FieldOptions{Template: `attrs.note`}, CategoryIDs: []string{"child"}})
	if !errors.Is(err, ErrDependenciesUnmet) {
		t.Fatalf("created invalid bound computed field: %v", err)
	}
}

func TestUnbindPreviewConfirmPrunesOnlyItsSource(t *testing.T) {
	s, ctx := newStore(t)
	seedSnapshot(t, s, ctx)
	before := selectionState(t, s, ctx)
	preview, err := s.PreviewUnbind(ctx, "root", "a")
	if err != nil || len(preview.Issues) != 0 || !preview.RequiresConfirmation || preview.ConfirmationToken == "" || len(preview.Changes) != 3 {
		t.Fatalf("wrong unbind preview: %+v %v", preview, err)
	}
	if selectionState(t, s, ctx) != before {
		t.Fatal("preview mutated selections")
	}
	if err := s.UnbindConfirmed(ctx, "root", "a", "invalid"); !errors.Is(err, ErrImpactStale) {
		t.Fatalf("invalid token accepted: %v", err)
	}
	if err := s.UnbindConfirmed(ctx, "root", "a", preview.ConfirmationToken); err != nil {
		t.Fatal(err)
	}
	for _, id := range []string{"root", "child", "leaf"} {
		fields, err := s.EffectiveFields(ctx, id)
		if err != nil {
			t.Fatal(err)
		}
		for _, f := range fields {
			if f.ID == "a" {
				t.Fatalf("source survives on %s", id)
			}
		}
	}
	if err := s.Unbind(ctx, "root", "a"); err != nil {
		t.Fatalf("no-op no longer idempotent: %v", err)
	}
	if err := s.Bind(ctx, "root", "a", 10); err != nil {
		t.Fatal(err)
	}
	fields, err := s.EffectiveFields(ctx, "leaf")
	if err != nil {
		t.Fatal(err)
	}
	for _, f := range fields {
		if f.ID == "a" {
			t.Fatal("restoring source resurrected selections")
		}
	}
}

func TestUnbindPreviewBlocksDescendantDisplayAndDeviceConsumer(t *testing.T) {
	for _, kind := range []string{"display", "model", "vendor"} {
		t.Run(kind, func(t *testing.T) {
			s, ctx := newStore(t)
			seedSnapshot(t, s, ctx)
			if kind == "display" {
				setBindingDisplay(t, s, ctx, "leaf", "tag")
			} else {
				vendor := vendorNamed(t, s, ctx, "Vendor")
				device, err := s.CreateModel(ctx, CreateModelInput{Name: "Device", VendorID: vendor})
				if err != nil {
					t.Fatal(err)
				}
				f, err := s.CreateField(ctx, CreateFieldInput{Key: "device_derived", Label: "Derived", Type: model.FieldComputed, Options: model.FieldOptions{Template: `attrs.tag`}})
				if err != nil {
					t.Fatal(err)
				}
				if kind == "model" {
					err = s.BindModel(ctx, device.ID, f.ID, 10)
				} else {
					err = s.BindVendor(ctx, vendor, f.ID, 10)
				}
				if err != nil {
					t.Fatal(err)
				}
			}
			before := selectionState(t, s, ctx)
			preview, err := s.PreviewUnbind(ctx, "root", "a")
			if err != nil || len(preview.Issues) == 0 || preview.ConfirmationToken != "" {
				t.Fatalf("dependency accepted: %+v %v", preview, err)
			}
			if err := s.Unbind(ctx, "root", "a"); !errors.Is(err, ErrFieldDependedOn) {
				t.Fatalf("guard lost: %v", err)
			}
			if selectionState(t, s, ctx) != before {
				t.Fatal("blocked unbind pruned selections")
			}
		})
	}
}

func TestUnbindRejectsStaleSchemaConfirmation(t *testing.T) {
	for _, change := range []string{"binding", "selection", "definition"} {
		t.Run(change, func(t *testing.T) {
			s, ctx := newStore(t)
			seedSnapshot(t, s, ctx)
			preview, err := s.PreviewUnbind(ctx, "root", "a")
			if err != nil {
				t.Fatal(err)
			}
			err = s.db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
				query := `UPDATE category_fields SET sort=sort+1 WHERE category_id='root' AND field_id='b'`
				if change == "selection" {
					query = `DELETE FROM category_field_selections WHERE category_id='leaf' AND field_id='a'`
				}
				if change == "definition" {
					query = `UPDATE field_definitions SET label='Changed' WHERE id='a'`
				}
				_, err := tx.ExecContext(ctx, query)
				return err
			})
			if err != nil {
				t.Fatal(err)
			}
			before := selectionState(t, s, ctx)
			if err := s.UnbindConfirmed(ctx, "root", "a", preview.ConfirmationToken); !errors.Is(err, ErrImpactStale) {
				t.Fatalf("stale confirmation accepted: %v", err)
			}
			if selectionState(t, s, ctx) != before {
				t.Fatal("stale unbind changed selections")
			}
		})
	}
}

func TestUnbindStaleConfirmationPrecedesNewDependencyIssues(t *testing.T) {
	for _, kind := range []string{"display", "computed"} {
		t.Run(kind, func(t *testing.T) {
			s, ctx := newStore(t)
			seedSnapshot(t, s, ctx)
			preview, err := s.PreviewUnbind(ctx, "root", "a")
			if err != nil || preview.ConfirmationToken == "" {
				t.Fatalf("initial confirmation: %+v %v", preview, err)
			}
			if kind == "display" {
				setBindingDisplay(t, s, ctx, "leaf", "tag")
			} else {
				seedPreviewComputed(t, s, ctx, "leaf", "derived", "derived", `attrs.tag`)
			}
			before := selectionState(t, s, ctx)
			err = s.UnbindConfirmed(ctx, "root", "a", preview.ConfirmationToken)
			if !errors.Is(err, ErrImpactStale) {
				t.Fatalf("stale token with new dependency issue=%v, want impact_stale", err)
			}
			if selectionState(t, s, ctx) != before {
				t.Fatal("stale unbind changed state")
			}
			if err := s.Unbind(ctx, "root", "a"); !errors.Is(err, ErrFieldDependedOn) {
				t.Fatalf("fresh unsigned dependency check lost: %v", err)
			}
		})
	}
}

func confirmedUnbind(t *testing.T, s *Store, ctx context.Context, categoryID, fieldID string) error {
	t.Helper()
	preview, err := s.PreviewUnbind(ctx, categoryID, fieldID)
	if err != nil {
		return err
	}
	return s.UnbindConfirmed(ctx, categoryID, fieldID, preview.ConfirmationToken)
}

func TestBindingRootsCoverEachCategoryOnce(t *testing.T) {
	s, ctx := newStore(t)
	seedSnapshot(t, s, ctx)
	snapshot, err := s.Snapshot(ctx)
	if err != nil {
		t.Fatal(err)
	}
	roots := bindingRoots(snapshot, []string{"child", "root", "leaf", "child"})
	if len(roots) != 1 || roots[0] != "root" {
		t.Fatalf("overlapping binding roots: %v", roots)
	}
}

func requireBindingNote(t *testing.T, s *Store, ctx context.Context) {
	t.Helper()
	if err := s.db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `UPDATE field_definitions SET required=1 WHERE id='b'`)
		return err
	}); err != nil {
		t.Fatal(err)
	}
}

func setBindingDisplay(t *testing.T, s *Store, ctx context.Context, id, key string) {
	t.Helper()
	if err := s.db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `UPDATE categories SET display_key=? WHERE id=?`, key, id)
		return err
	}); err != nil {
		t.Fatal(err)
	}
}
