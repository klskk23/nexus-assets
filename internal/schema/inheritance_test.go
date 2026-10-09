package schema

import (
	"context"
	"encoding/json"
	"reflect"
	"testing"

	"github.com/klskk23/nexus-assets/internal/model"
)

// These previews must exercise the same overlay as commits, without first
// writing a category or selections and rolling them back.
func TestInheritancePreviewUsesExplicitParentChoices(t *testing.T) {
	s, ctx := newStore(t)
	seedSnapshot(t, s, ctx)
	choices := []string{"c", "a", "a"}
	preview, err := s.PreviewCategory(ctx, "leaf", CategoryDraft{InheritedFieldIDs: &choices})
	if err != nil {
		t.Fatal(err)
	}
	if got := fieldIDs(preview.Fields); !reflect.DeepEqual(got, []string{"a", "c", "d"}) {
		t.Fatalf("final fields = %v", got)
	}
	if !reflect.DeepEqual(preview.SelectedFieldIDs, []string{"a", "c"}) {
		t.Fatalf("normalized selection = %v", preview.SelectedFieldIDs)
	}
	if len(preview.Candidates) != 2 || preview.Candidates[0].SourceCategoryID != "root" || preview.Candidates[1].SourceCategoryID != "child" {
		t.Fatalf("candidates must exclude own fields and retain original source: %+v", preview.Candidates)
	}
}

func TestInheritancePreviewDistinguishesOmittedEmptyAndNull(t *testing.T) {
	s, ctx := newStore(t)
	seedSnapshot(t, s, ctx)
	for _, tc := range []struct {
		name string
		ids  *[]string
		want []string
		bad  bool
	}{
		{name: "omitted", want: []string{"a", "c", "d"}},
		{name: "empty", ids: slicePointer([]string{}), want: []string{"d"}},
		{name: "null", ids: slicePointer(nil), bad: true},
		{name: "skip parent", ids: slicePointer([]string{"b"}), bad: true},
		{name: "own binding", ids: slicePointer([]string{"d"}), bad: true},
		{name: "unknown", ids: slicePointer([]string{"missing"}), bad: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			preview, err := s.PreviewCategory(ctx, "leaf", CategoryDraft{InheritedFieldIDs: tc.ids})
			if tc.bad {
				if err == nil {
					t.Fatal("invalid explicit selection accepted")
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			if got := fieldIDs(preview.Fields); !reflect.DeepEqual(got, tc.want) {
				t.Fatalf("fields = %v, want %v", got, tc.want)
			}
		})
	}
}

func TestInheritancePreviewIsReadOnlyAndPrunesOnlyLostSources(t *testing.T) {
	s, ctx := newStore(t)
	seedSnapshot(t, s, ctx)
	before := selectionState(t, s, ctx)
	empty := []string{}
	preview, err := s.PreviewCategory(ctx, "child", CategoryDraft{InheritedFieldIDs: &empty})
	if err != nil {
		t.Fatal(err)
	}
	if got := fieldIDs(preview.Fields); !reflect.DeepEqual(got, []string{"c"}) {
		t.Fatalf("child fields = %v", got)
	}
	want := []FieldDelta{
		{CategoryID: "child", FieldID: "a", Key: "tag", Change: "removed", BeforeSourceCategoryID: "root"},
		{CategoryID: "leaf", FieldID: "a", Key: "tag", Change: "removed", BeforeSourceCategoryID: "root"},
	}
	if !reflect.DeepEqual(preview.Changes, want) {
		t.Fatalf("changes = %+v, want %+v", preview.Changes, want)
	}
	if after := selectionState(t, s, ctx); before != after {
		t.Fatalf("preview wrote data: before=%s after=%s", before, after)
	}
}

func TestInheritancePreviewNewChildDefaultsEmptyAndRejectsRootChoices(t *testing.T) {
	s, ctx := newStore(t)
	seedSnapshot(t, s, ctx)
	parent := "child"
	parentPointer := &parent
	name := "New child"
	before := selectionState(t, s, ctx)
	preview, err := s.PreviewCategory(ctx, "", CategoryDraft{Code: "NEW", Name: &name, ParentID: &parentPointer})
	if err != nil {
		t.Fatal(err)
	}
	if len(preview.Fields) != 0 || len(preview.SelectedFieldIDs) != 0 || len(preview.Candidates) != 2 {
		t.Fatalf("new child should have only unselected candidates: %+v", preview)
	}
	if after := selectionState(t, s, ctx); before != after {
		t.Fatal("create preview persisted a category")
	}
	ids := []string{"a"}
	if _, err := s.PreviewCategory(ctx, "root", CategoryDraft{InheritedFieldIDs: &ids}); err == nil {
		t.Fatal("root accepted inherited choices")
	}
}

func TestInheritancePreviewReportsDisplayDependencyInFinalDraft(t *testing.T) {
	s, ctx := newStore(t)
	seedSnapshot(t, s, ctx)
	key := "tag"
	if _, err := s.UpdateCategory(ctx, "leaf", UpdateCategoryInput{DisplayKey: &key}); err != nil {
		t.Fatal(err)
	}
	empty := []string{}
	preview, err := s.PreviewCategory(ctx, "child", CategoryDraft{InheritedFieldIDs: &empty})
	if err != nil {
		t.Fatal(err)
	}
	if len(preview.Issues) != 1 || preview.Issues[0].CategoryID != "leaf" || preview.Issues[0].FieldKey != "tag" {
		t.Fatalf("lost descendant display dependency = %+v", preview.Issues)
	}
	clear := ""
	preview, err = s.PreviewCategory(ctx, "leaf", CategoryDraft{InheritedFieldIDs: &empty, DisplayKey: &clear})
	if err != nil || len(preview.Issues) != 0 {
		t.Fatalf("same-draft display repair must be accepted: issues=%+v err=%v", preview.Issues, err)
	}
}

func TestInheritancePreviewMovesUsingFieldIdentityNotKey(t *testing.T) {
	s, ctx := newStore(t)
	seedSnapshot(t, s, ctx)
	parent := "sibling"
	parentPointer := &parent
	preview, err := s.PreviewCategory(ctx, "leaf", CategoryDraft{ParentID: &parentPointer})
	if err != nil {
		t.Fatal(err)
	}
	if len(preview.SelectedFieldIDs) != 0 || len(preview.Candidates) != 1 || preview.Candidates[0].Field.ID != "e" {
		t.Fatalf("same key must not substitute field e for field c: %+v", preview)
	}
	if preview.Category.Path != "/root/sibling/leaf/" {
		t.Fatalf("moved path = %q", preview.Category.Path)
	}
	invalid := []string{"c"}
	if _, err := s.PreviewCategory(ctx, "leaf", CategoryDraft{ParentID: &parentPointer, InheritedFieldIDs: &invalid}); err == nil {
		t.Fatal("explicit old field outside the new parent's effective set must fail")
	}
}

func TestInheritancePreviewParentPresenceAndCycle(t *testing.T) {
	s, ctx := newStore(t)
	seedSnapshot(t, s, ctx)
	before := selectionState(t, s, ctx)
	var rootParent *string
	for _, tc := range []struct {
		name     string
		parent   **string
		wantPath string
		wantIDs  []string
	}{
		{name: "omitted", wantPath: "/root/child/", wantIDs: []string{"a"}},
		{name: "null", parent: &rootParent, wantPath: "/child/", wantIDs: []string{}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			preview, err := s.PreviewCategory(ctx, "child", CategoryDraft{ParentID: tc.parent})
			if err != nil {
				t.Fatal(err)
			}
			if preview.Category.Path != tc.wantPath || !reflect.DeepEqual(preview.SelectedFieldIDs, tc.wantIDs) {
				t.Fatalf("parent presence: path=%s selected=%v", preview.Category.Path, preview.SelectedFieldIDs)
			}
		})
	}
	for _, parent := range []string{"child", "leaf", "missing"} {
		parentPointer := &parent
		if _, err := s.PreviewCategory(ctx, "child", CategoryDraft{ParentID: &parentPointer}); err == nil {
			t.Fatalf("invalid parent %q accepted", parent)
		}
	}
	if after := selectionState(t, s, ctx); after != before {
		t.Fatal("parent preview changed persistent state")
	}
}

func TestInheritancePreviewReportsPopulatedSubtreeMove(t *testing.T) {
	s, ctx := newStore(t)
	seedSnapshot(t, s, ctx)
	seedAsset(t, s, ctx, "leaf", "asset-in-leaf", `{}`)
	var parentPointer *string
	before := selectionState(t, s, ctx)
	preview, err := s.PreviewCategory(ctx, "child", CategoryDraft{ParentID: &parentPointer})
	if err != nil {
		t.Fatal(err)
	}
	if len(preview.Issues) != 2 || preview.Issues[0].Code != "category_has_assets" || preview.Issues[0].CategoryID != "child" || preview.Issues[1].Code != "schema_effects_unavailable" {
		t.Fatalf("populated subtree move must be a blocking issue: %+v", preview.Issues)
	}
	parent := "root"
	parentPointer = &parent
	name := "Renamed child"
	preview, err = s.PreviewCategory(ctx, "child", CategoryDraft{Name: &name, ParentID: &parentPointer})
	if err != nil || len(preview.Issues) != 0 || preview.Category.Name != name {
		t.Fatalf("same-parent rename must remain valid: preview=%+v err=%v", preview, err)
	}
	if after := selectionState(t, s, ctx); after != before {
		t.Fatal("move preview wrote category state")
	}
}

func TestInheritancePreviewRejectsDeviceFieldSelection(t *testing.T) {
	s, ctx := newStore(t)
	seedSnapshot(t, s, ctx)
	device, err := s.CreateModel(ctx, CreateModelInput{Name: "Device"})
	if err != nil {
		t.Fatal(err)
	}
	field, err := s.CreateField(ctx, CreateFieldInput{Key: "device_only", Label: "Device only", Type: model.FieldText})
	if err != nil {
		t.Fatal(err)
	}
	if err := s.BindModel(ctx, device.ID, field.ID, 0); err != nil {
		t.Fatal(err)
	}
	ids := []string{field.ID}
	if _, err := s.PreviewCategory(ctx, "child", CategoryDraft{InheritedFieldIDs: &ids}); err == nil {
		t.Fatal("device binding accepted as a category inheritance candidate")
	}
	key := field.Key
	preview, err := s.PreviewCategory(ctx, "child", CategoryDraft{DisplayKey: &key})
	if err != nil || len(preview.Issues) != 1 || preview.Issues[0].FieldKey != key {
		t.Fatalf("device-only display key accepted: issues=%+v err=%v", preview.Issues, err)
	}
}

func TestInheritancePreviewRetainsIdentityButReportsChangedSource(t *testing.T) {
	s, ctx := newStore(t)
	seedSnapshot(t, s, ctx)
	other, err := s.CreateCategory(ctx, CreateCategoryInput{Code: "OTHER", Name: "Other"})
	if err != nil {
		t.Fatal(err)
	}
	if err := s.Bind(ctx, other.ID, "a", 0); err != nil {
		t.Fatal(err)
	}
	parent := &other.ID
	preview, err := s.PreviewCategory(ctx, "child", CategoryDraft{ParentID: &parent})
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(preview.SelectedFieldIDs, []string{"a"}) {
		t.Fatalf("same field identity must survive move: %v", preview.SelectedFieldIDs)
	}
	want := []FieldDelta{
		{CategoryID: "child", FieldID: "a", Key: "tag", Change: "source_changed", BeforeSourceCategoryID: "root", AfterSourceCategoryID: other.ID},
		{CategoryID: "leaf", FieldID: "a", Key: "tag", Change: "source_changed", BeforeSourceCategoryID: "root", AfterSourceCategoryID: other.ID},
	}
	if !reflect.DeepEqual(preview.Changes, want) {
		t.Fatalf("source change must reach descendants: got=%+v want=%+v", preview.Changes, want)
	}
}

func slicePointer(ids []string) *[]string { return &ids }

func fieldIDs(fields []model.BoundField) []string {
	ids := make([]string, len(fields))
	for i, f := range fields {
		ids[i] = f.ID
	}
	return ids
}

func selectionState(t *testing.T, s *Store, ctx context.Context) string {
	t.Helper()
	var rowsJSON []string
	for _, query := range []string{
		`SELECT json_object('id', id, 'name', name, 'parent', parent_id, 'path', path, 'display', display_key, 'updated', updated_at) FROM categories ORDER BY id`,
		`SELECT json_array(category_id, field_id) FROM category_field_selections ORDER BY category_id, field_id`,
	} {
		rows, err := s.db.ReadDB().QueryContext(ctx, query)
		if err != nil {
			t.Fatal(err)
		}
		for rows.Next() {
			var value string
			if err := rows.Scan(&value); err != nil {
				t.Fatal(err)
			}
			rowsJSON = append(rowsJSON, value)
		}
		if err := rows.Err(); err != nil {
			t.Fatal(err)
		}
		if err := rows.Close(); err != nil {
			t.Fatal(err)
		}
	}
	encoded, err := json.Marshal(rowsJSON)
	if err != nil {
		t.Fatal(err)
	}
	return string(encoded)
}
