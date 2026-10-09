package schema

import (
	"context"
	"database/sql"
	"testing"

	"github.com/klskk23/nexus-assets/internal/model"
)

// Removing an input must report the remaining computed consumer, not silently
// select the input or remove the consumer from the draft.
func TestInheritancePreviewReportsComputedDependency(t *testing.T) {
	s, ctx := newStore(t)
	seedSnapshot(t, s, ctx)
	seedPreviewComputed(t, s, ctx, "root", "computed", "derived", `attrs.tag + attrs.note`)
	choices := []string{"computed"}
	before := selectionState(t, s, ctx)
	preview, err := s.PreviewCategory(ctx, "child", CategoryDraft{InheritedFieldIDs: &choices})
	if err != nil {
		t.Fatal(err)
	}
	if len(preview.Issues) != 1 || preview.Issues[0].CategoryID != "child" || preview.Issues[0].FieldID != "computed" {
		t.Fatalf("missing computed inputs must identify the consumer: %+v", preview.Issues)
	}
	if len(preview.SelectedFieldIDs) != 1 || preview.SelectedFieldIDs[0] != "computed" {
		t.Fatalf("preview silently repaired selection: %v", preview.SelectedFieldIDs)
	}
	if after := selectionState(t, s, ctx); after != before {
		t.Fatal("dependency preview changed persistent state")
	}
	choices = []string{"a", "b", "computed"}
	preview, err = s.PreviewCategory(ctx, "child", CategoryDraft{InheritedFieldIDs: &choices})
	if err != nil || len(preview.Issues) != 1 {
		t.Fatalf("optional input must retain the required-input guard: issues=%+v err=%v", preview.Issues, err)
	}
	if err := s.db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `UPDATE field_definitions SET required = 1 WHERE id = 'b'`)
		return err
	}); err != nil {
		t.Fatal(err)
	}
	preview, err = s.PreviewCategory(ctx, "child", CategoryDraft{InheritedFieldIDs: &choices})
	if err != nil || len(preview.Issues) != 0 {
		t.Fatalf("complete required dependency selection rejected: issues=%+v err=%v", preview.Issues, err)
	}
}

func TestInheritancePreviewChecksDescendantComputedDependency(t *testing.T) {
	s, ctx := newStore(t)
	seedSnapshot(t, s, ctx)
	seedPreviewComputed(t, s, ctx, "leaf", "computed", "derived", `attrs.tag`)
	empty := []string{}
	preview, err := s.PreviewCategory(ctx, "child", CategoryDraft{InheritedFieldIDs: &empty})
	if err != nil {
		t.Fatal(err)
	}
	if len(preview.Issues) != 1 || preview.Issues[0].CategoryID != "leaf" || preview.Issues[0].FieldID != "computed" {
		t.Fatalf("lost descendant input not reported: %+v", preview.Issues)
	}
}

func TestInheritancePreviewAllowsRemovingCompleteComputedChain(t *testing.T) {
	s, ctx := newStore(t)
	seedSnapshot(t, s, ctx)
	seedPreviewComputed(t, s, ctx, "root", "computed", "derived", `attrs.tag`)
	selectFixtureFields(t, s, ctx, "child", "computed")
	selectFixtureFields(t, s, ctx, "leaf", "computed")
	empty := []string{}
	preview, err := s.PreviewCategory(ctx, "child", CategoryDraft{InheritedFieldIDs: &empty})
	if err != nil || len(preview.Issues) != 0 {
		t.Fatalf("removed consumers must not block input removal: issues=%+v err=%v", preview.Issues, err)
	}
}

func TestInheritancePreviewDisplayUsesOnlyFinalCategoryFields(t *testing.T) {
	s, ctx := newStore(t)
	seedSnapshot(t, s, ctx)
	for _, tc := range []struct {
		name      string
		key       string
		ids       []string
		wantIssue bool
	}{
		{name: "non-unique own", key: "ports", ids: []string{}},
		{name: "selected inherited", key: "tag", ids: []string{"a"}},
		{name: "unselected ancestor", key: "tag", ids: []string{}, wantIssue: true},
		{name: "unknown", key: "missing", ids: []string{"a"}, wantIssue: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			preview, err := s.PreviewCategory(ctx, "child", CategoryDraft{DisplayKey: &tc.key, InheritedFieldIDs: &tc.ids})
			if err != nil {
				t.Fatal(err)
			}
			if got := len(preview.Issues) != 0; got != tc.wantIssue {
				t.Fatalf("display issues = %+v, want issue %v", preview.Issues, tc.wantIssue)
			}
		})
	}
}

func TestInheritancePreviewDoesNotValidateUnrelatedBranch(t *testing.T) {
	s, ctx := newStore(t)
	seedSnapshot(t, s, ctx)
	// A legacy defect in another branch belongs to verify, not this draft.
	if err := s.db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `UPDATE categories SET display_key = 'missing' WHERE id = 'sibling'`)
		return err
	}); err != nil {
		t.Fatal(err)
	}
	empty := []string{}
	preview, err := s.PreviewCategory(ctx, "child", CategoryDraft{InheritedFieldIDs: &empty})
	if err != nil || len(preview.Issues) != 0 {
		t.Fatalf("unrelated branch blocked draft: issues=%+v err=%v", preview.Issues, err)
	}
}

func TestInheritancePreviewIgnoresUnrelatedBrokenSelection(t *testing.T) {
	s, ctx := newStore(t)
	seedSnapshot(t, s, ctx)
	if err := s.db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `INSERT INTO category_field_selections (category_id, field_id) VALUES ('sibling', 'd')`)
		return err
	}); err != nil {
		t.Fatal(err)
	}
	empty := []string{}
	preview, err := s.PreviewCategory(ctx, "child", CategoryDraft{InheritedFieldIDs: &empty})
	if err != nil || len(preview.Issues) != 0 || len(preview.Changes) != 2 {
		t.Fatalf("unrelated broken selection blocked draft: preview=%+v err=%v", preview, err)
	}
}

func TestInheritancePreviewChecksDeviceComputedWithoutAssets(t *testing.T) {
	for _, target := range []string{"model", "vendor"} {
		t.Run(target, func(t *testing.T) {
			s, ctx := newStore(t)
			seedSnapshot(t, s, ctx)
			vendorID := vendorNamed(t, s, ctx, "Acme")
			device, err := s.CreateModel(ctx, CreateModelInput{Name: "Device", VendorID: vendorID})
			if err != nil {
				t.Fatal(err)
			}
			computed, err := s.CreateField(ctx, CreateFieldInput{Key: "device_label", Label: "Device label", Type: model.FieldComputed, Options: model.FieldOptions{Template: `attrs.tag`}})
			if err != nil {
				t.Fatal(err)
			}
			if target == "vendor" {
				err = s.BindVendor(ctx, vendorID, computed.ID, 0)
			} else {
				err = s.BindModel(ctx, device.ID, computed.ID, 0)
			}
			if err != nil {
				t.Fatal(err)
			}
			empty := []string{}
			preview, err := s.PreviewCategory(ctx, "child", CategoryDraft{InheritedFieldIDs: &empty})
			if err != nil {
				t.Fatal(err)
			}
			if len(preview.Issues) != 2 {
				t.Fatalf("device consumer must be checked for child and leaf without assets: %+v", preview.Issues)
			}
			for i, id := range []string{"child", "leaf"} {
				if preview.Issues[i].CategoryID != id || preview.Issues[i].FieldID != computed.ID {
					t.Fatalf("wrong device dependency issue: %+v", preview.Issues[i])
				}
			}
			choices := []string{"a"}
			preview, err = s.PreviewCategory(ctx, "child", CategoryDraft{InheritedFieldIDs: &choices})
			if err != nil || len(preview.Issues) != 0 {
				t.Fatalf("retained category input rejected: issues=%+v err=%v", preview.Issues, err)
			}
		})
	}
}

func TestInheritancePreviewKeepsDisjointModelDependenciesSeparate(t *testing.T) {
	s, ctx := newStore(t)
	seedSnapshot(t, s, ctx)
	first, err := s.CreateModel(ctx, CreateModelInput{Name: "First"})
	if err != nil {
		t.Fatal(err)
	}
	second, err := s.CreateModel(ctx, CreateModelInput{Name: "Second"})
	if err != nil {
		t.Fatal(err)
	}
	consumer, err := s.CreateField(ctx, CreateFieldInput{Key: "device_label", Label: "Device label", Type: model.FieldComputed, Options: model.FieldOptions{Template: `attrs.device_input`}})
	if err != nil {
		t.Fatal(err)
	}
	input, err := s.CreateField(ctx, CreateFieldInput{Key: "device_input", Label: "Input", Type: model.FieldText, Required: true})
	if err != nil {
		t.Fatal(err)
	}
	if err := s.BindModel(ctx, first.ID, consumer.ID, 0); err != nil {
		t.Fatal(err)
	}
	if err := s.BindModel(ctx, second.ID, input.ID, 0); err != nil {
		t.Fatal(err)
	}
	preview, err := s.PreviewCategory(ctx, "leaf", CategoryDraft{})
	if err != nil || len(preview.Issues) != 1 || preview.Issues[0].FieldID != consumer.ID {
		t.Fatalf("another model's input satisfied a missing dependency: issues=%+v err=%v", preview.Issues, err)
	}
	ownInput, err := s.CreateField(ctx, CreateFieldInput{Key: "device_input", Label: "Own input", Type: model.FieldText, Required: true})
	if err != nil {
		t.Fatal(err)
	}
	if err := s.BindModel(ctx, first.ID, ownInput.ID, 1); err != nil {
		t.Fatal(err)
	}
	preview, err = s.PreviewCategory(ctx, "leaf", CategoryDraft{})
	if err != nil || len(preview.Issues) != 0 {
		t.Fatalf("disjoint fields with the same key were mixed: issues=%+v err=%v", preview.Issues, err)
	}
}

func TestInheritancePreviewChecksTransitiveComputedDependencies(t *testing.T) {
	for _, tc := range []struct {
		name       string
		inner      string
		ids        []string
		wantIssues int
	}{
		{name: "complete", inner: `attrs.tag`, ids: []string{"a", "inner", "outer"}},
		{name: "missing input", inner: `attrs.tag`, ids: []string{"inner", "outer"}, wantIssues: 2},
		{name: "cycle", inner: `attrs.outer`, ids: []string{"inner", "outer"}, wantIssues: 2},
		{name: "invalid expression", inner: `attrs[category.code]`, ids: []string{"inner", "outer"}, wantIssues: 2},
	} {
		t.Run(tc.name, func(t *testing.T) {
			s, ctx := newStore(t)
			seedSnapshot(t, s, ctx)
			seedPreviewComputed(t, s, ctx, "root", "inner", "inner", tc.inner)
			seedPreviewComputed(t, s, ctx, "root", "outer", "outer", `attrs.inner`)
			preview, err := s.PreviewCategory(ctx, "child", CategoryDraft{InheritedFieldIDs: &tc.ids})
			if err != nil || len(preview.Issues) != tc.wantIssues {
				t.Fatalf("transitive dependency issues=%+v err=%v, want %d issues", preview.Issues, err, tc.wantIssues)
			}
		})
	}
}

func seedPreviewComputed(t *testing.T, s *Store, ctx context.Context, categoryID, fieldID, key, expression string) {
	t.Helper()
	if err := s.db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		if _, err := tx.ExecContext(ctx, `INSERT INTO field_definitions
			(id, key, label, type, options, is_unique, searchable, required, created_at, updated_at)
			VALUES (?, ?, ?, 'computed', json_object('template', ?), 0, 0, 0, '2026-10-08T00:00:00Z', '2026-10-08T00:00:00Z')`,
			fieldID, key, key, expression); err != nil {
			return err
		}
		_, err := tx.ExecContext(ctx, `INSERT INTO category_fields (category_id, field_id, sort) VALUES (?, ?, 30)`, categoryID, fieldID)
		return err
	}); err != nil {
		t.Fatal(err)
	}
}
