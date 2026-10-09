package httpapi

import (
	"context"
	"database/sql"
	"fmt"
	"net/http"
	"reflect"
	"strings"
	"testing"

	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/schema"
)

// Parent presence and direct cycles already have coverage in inheritance_test.
// This matrix checks the destructive move's complete final draft and descendants.
func TestInheritanceHTTPMoveKeepsIdentityIntersectionAndNewSource(t *testing.T) {
	h := newHarness(t)
	oldParent, newParent, child, leaf, a, b, c, replacement := moveHTTPFixture(t, h)
	before := inheritanceHTTPState(t, h)
	body := fmt.Sprintf(`{"parent_id":%q}`, newParent.ID)
	rec := h.post(t, "/api/categories/"+child.ID+"/preview", body)
	requireInheritanceStatus(t, rec, 200)
	preview := decode[inheritanceHTTPPreview](t, rec)
	if preview.Issues.Total != 0 || !preview.RequiresConfirmation || preview.Token == "" || !reflect.DeepEqual(preview.Inheritance.Selected, []string{b.ID}) {
		t.Fatalf("move preview=%+v", preview)
	}
	if preview.Impact.Total != 4 || preview.Impact.Removed != 2 || preview.Impact.Categories != 2 || preview.Impact.Assets != 0 {
		t.Fatalf("move impact=%+v", preview.Impact)
	}
	for _, delta := range preview.Impact.Items {
		if delta.FieldID == b.ID && (delta.Change != "source_changed" || delta.BeforeSourceCategoryID != oldParent.ID || delta.AfterSourceCategoryID != newParent.ID) {
			t.Fatalf("lost source transition: %+v", delta)
		}
	}
	if inheritanceHTTPState(t, h) != before {
		t.Fatal("move preview wrote state")
	}
	requireInheritanceStatus(t, h.patch(t, "/api/categories/"+child.ID, body), 409)
	if inheritanceHTTPState(t, h) != before {
		t.Fatal("unconfirmed move wrote state")
	}
	// A same-key replacement is not the original field identity.
	illegal := fmt.Sprintf(`{"parent_id":%q,"inherited_field_ids":[%q,%q]}`, newParent.ID, a.ID, b.ID)
	rec = h.post(t, "/api/categories/"+child.ID+"/preview", illegal)
	requireInheritanceStatus(t, rec, 400)
	if decode[Envelope](t, rec).Error.Fields["inherited_field_ids"] == "" {
		t.Fatal("invalid move selection not located")
	}
	body = fmt.Sprintf(`{"parent_id":%q,"confirmation_token":%q}`, newParent.ID, preview.Token)
	requireInheritanceStatus(t, h.patch(t, "/api/categories/"+child.ID, body), 200)
	for _, id := range []string{child.ID, leaf.ID} {
		cat, err := h.schema.GetCategory(h.ctx, id)
		if err != nil {
			t.Fatal(err)
		}
		if !strings.HasPrefix(cat.Path, newParent.Path+child.ID+"/") {
			t.Fatalf("descendant path=%s", cat.Path)
		}
		fields, err := h.schema.EffectiveFields(h.ctx, id)
		if err != nil || len(fields) != 1 || fields[0].ID != b.ID || fields[0].InheritedFrom != newParent.ID || fields[0].ID == c.ID || fields[0].ID == replacement.ID {
			t.Fatalf("move fields=%+v err=%v", fields, err)
		}
	}
}

func TestInheritanceHTTPMoveChecksDescendantAssetsAndCycles(t *testing.T) {
	for _, kind := range []string{"own-assets", "descendant-assets", "self-cycle", "descendant-cycle"} {
		t.Run(kind, func(t *testing.T) {
			h := newHarness(t)
			old := countCategory(t, h, "OLD", nil, nil)
			target := countCategory(t, h, "TARGET", nil, nil)
			child := countCategory(t, h, "CH", &old.ID, nil)
			leaf := countCategory(t, h, "LEAF", &child.ID, nil)
			parent := target.ID
			switch kind {
			case "own-assets":
				saveCountAsset(t, h, child.ID, nil, nil)
			case "descendant-assets":
				saveCountAsset(t, h, leaf.ID, nil, nil)
			case "self-cycle":
				parent = child.ID
			case "descendant-cycle":
				parent = leaf.ID
			}
			before := inheritanceHTTPState(t, h)
			body := fmt.Sprintf(`{"parent_id":%q,"inherited_field_ids":[]}`, parent)
			rec := h.post(t, "/api/categories/"+child.ID+"/preview", body)
			if strings.Contains(kind, "assets") {
				requireInheritanceStatus(t, rec, 200)
				preview := decode[inheritanceHTTPPreview](t, rec)
				if preview.Issues.Total != 1 || preview.Issues.Items[0].Code != "category_has_assets" || preview.Token != "" {
					t.Fatalf("asset move preview=%+v", preview)
				}
				requireInheritanceStatus(t, h.patch(t, "/api/categories/"+child.ID, body), 409)
			} else {
				requireInheritanceStatus(t, rec, 400)
				requireInheritanceStatus(t, h.patch(t, "/api/categories/"+child.ID, body), 400)
			}
			if inheritanceHTTPState(t, h) != before {
				t.Fatal("refused move changed state")
			}
		})
	}
}

func TestInheritanceHTTPMoveDescendantDisplayBlocksWholeDraft(t *testing.T) {
	h := newHarness(t)
	_, target, child, leaf, a, _, _, _ := moveHTTPFixture(t, h)
	if _, err := h.schema.UpdateCategory(h.ctx, leaf.ID, schema.UpdateCategoryInput{DisplayKey: &a.Key}); err != nil {
		t.Fatal(err)
	}
	before := inheritanceHTTPState(t, h)
	body := fmt.Sprintf(`{"parent_id":%q,"name":"Moved","display_key":""}`, target.ID)
	for _, lang := range []string{"zh", "en"} {
		rec := h.doLang(t, lang, http.MethodPost, "/api/categories/"+child.ID+"/preview", body)
		requireInheritanceStatus(t, rec, 200)
		preview := decode[inheritanceHTTPPreview](t, rec)
		if preview.Issues.Total != 1 || preview.Issues.Items[0].CategoryID != leaf.ID || preview.Issues.Items[0].FieldKey != a.Key || preview.Token != "" {
			t.Fatalf("descendant display issue=%+v", preview)
		}
		rec = h.doLang(t, lang, http.MethodPatch, "/api/categories/"+child.ID, body)
		requireInheritanceStatus(t, rec, 422)
	}
	if inheritanceHTTPState(t, h) != before {
		t.Fatal("blocked move changed name, path, display or selections")
	}
}

func TestInheritanceHTTPMoveRollbackIncludesDescendantPathsAndSelections(t *testing.T) {
	h := newHarness(t)
	_, target, child, _, _, _, _, _ := moveHTTPFixture(t, h)
	body := fmt.Sprintf(`{"parent_id":%q,"name":"Moved"}`, target.ID)
	rec := h.post(t, "/api/categories/"+child.ID+"/preview", body)
	requireInheritanceStatus(t, rec, 200)
	preview := decode[inheritanceHTTPPreview](t, rec)
	before := inheritanceHTTPState(t, h)
	if err := h.db.Write(h.ctx, func(ctx context.Context, tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `CREATE TRIGGER reject_move_selection BEFORE INSERT ON category_field_selections BEGIN SELECT RAISE(ABORT,'blocked'); END`)
		return err
	}); err != nil {
		t.Fatal(err)
	}
	body = fmt.Sprintf(`{"parent_id":%q,"name":"Moved","confirmation_token":%q}`, target.ID, preview.Token)
	requireInheritanceStatus(t, h.patch(t, "/api/categories/"+child.ID, body), 500)
	if inheritanceHTTPState(t, h) != before {
		t.Fatal("failed move partially persisted")
	}
}

func TestInheritanceHTTPMoveCannotBypassSameChainKeyGuard(t *testing.T) {
	h := newHarness(t)
	target := countCategory(t, h, "TARGET", nil, nil)
	child := countCategory(t, h, "CH", nil, nil)
	for _, id := range []string{target.ID, child.ID} {
		if _, err := h.schema.CreateField(h.ctx, schema.CreateFieldInput{Key: "duplicate", Label: "Duplicate", Type: model.FieldText, CategoryIDs: []string{id}}); err != nil {
			t.Fatal(err)
		}
	}
	before := inheritanceHTTPState(t, h)
	rec := h.patch(t, "/api/categories/"+child.ID, fmt.Sprintf(`{"parent_id":%q,"inherited_field_ids":[]}`, target.ID))
	requireInheritanceStatus(t, rec, 409)
	if inheritanceHTTPState(t, h) != before {
		t.Fatal("key-conflicting move changed state")
	}
}

func moveHTTPFixture(t *testing.T, h *harness) (oldParent, newParent, child, leaf model.Category, a, b, c, replacement model.FieldDefinition) {
	t.Helper()
	oldParent = countCategory(t, h, "OLD", nil, nil)
	newParent = countCategory(t, h, "NEW", nil, nil)
	makeField := func(key string, ids ...string) model.FieldDefinition {
		f, err := h.schema.CreateField(h.ctx, schema.CreateFieldInput{Key: key, Label: key, Type: model.FieldText, IsUnique: key == "shared", CategoryIDs: ids})
		if err != nil {
			t.Fatal(err)
		}
		return f
	}
	a = makeField("old", oldParent.ID)
	b = makeField("shared", oldParent.ID, newParent.ID)
	c = makeField("new", newParent.ID)
	replacement = makeField("old", newParent.ID)
	selected := []string{a.ID, b.ID}
	child = countCategory(t, h, "CH", &oldParent.ID, &selected)
	leaf = countCategory(t, h, "LEAF", &child.ID, &selected)
	return
}
