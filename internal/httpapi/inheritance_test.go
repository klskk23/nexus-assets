package httpapi

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"

	"github.com/klskk23/nexus-assets/internal/authz"
	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/schema"
)

// The HTTP contract must preserve choices and presets rather than silently
// accepting JSON members that never reach the domain write.
func TestInheritanceHTTPCreateAndUpdateCompleteDraft(t *testing.T) {
	h := newHarness(t)
	mac := inheritanceMAC(t, h)
	body := fmt.Sprintf(`{"code":"CH","name":"Child","parent_id":%q,"inherited_field_ids":[%q,%q],"display_key":"mac","print_preset_ids":["small"]}`, h.catID, mac, mac)
	rec := h.post(t, "/api/categories", body)
	requireInheritanceStatus(t, rec, http.StatusCreated)
	cat := decode[model.Category](t, rec)
	if cat.DisplayKey != "mac" || !reflect.DeepEqual(cat.PrintPresetIDs, []string{"small"}) {
		t.Fatalf("incomplete create: %+v", cat)
	}
	fields, err := h.schema.EffectiveFields(h.ctx, cat.ID)
	if err != nil || len(fields) != 1 || fields[0].ID != mac {
		t.Fatalf("created fields=%+v err=%v", fields, err)
	}
	rec = h.patch(t, "/api/categories/"+cat.ID, `{"name":"Renamed","print_preset_ids":["large"]}`)
	requireInheritanceStatus(t, rec, http.StatusOK)
	preview, err := h.schema.PreviewCategory(h.ctx, cat.ID, schema.CategoryDraft{})
	if err != nil || !reflect.DeepEqual(preview.SelectedFieldIDs, []string{mac}) || preview.Category.Name != "Renamed" || !reflect.DeepEqual(preview.Category.PrintPresetIDs, []string{"large"}) {
		t.Fatalf("omitted selection lost: %+v err=%v", preview, err)
	}
	rec = h.patch(t, "/api/categories/"+cat.ID, fmt.Sprintf(`{"inherited_field_ids":[%q,%q],"display_key":"sn"}`, mac, h.snFieldID))
	requireInheritanceStatus(t, rec, http.StatusOK)
	fields, err = h.schema.EffectiveFields(h.ctx, cat.ID)
	if err != nil || len(fields) != 2 {
		t.Fatalf("updated fields=%+v err=%v", fields, err)
	}
}

type inheritanceHTTPPreview struct {
	Category    model.Category `json:"category"`
	Inheritance struct {
		ParentID   *string                           `json:"parent_id"`
		Selected   []string                          `json:"selected_field_ids"`
		Candidates Page[schema.InheritanceCandidate] `json:"candidates"`
	} `json:"inheritance"`
	Fields []model.BoundField `json:"fields"`
	Impact struct {
		Page[schema.FieldDelta]
		Added      int `json:"added_count"`
		Removed    int `json:"removed_count"`
		Categories int `json:"category_count"`
		Assets     int `json:"asset_count"`
	} `json:"impact"`
	Issues Page[struct {
		Code       string `json:"code"`
		Message    string `json:"message"`
		CategoryID string `json:"category_id"`
		FieldKey   string `json:"field_key"`
	}] `json:"issues"`
	RequiresConfirmation bool   `json:"requires_confirmation"`
	Token                string `json:"confirmation_token"`
}

func TestInheritanceHTTPPreviewIsReadOnlyAndPagesIndependently(t *testing.T) {
	h := newHarness(t)
	mac := inheritanceMAC(t, h)
	before := inheritanceHTTPState(t, h)
	rec := h.post(t, "/api/categories/preview?candidates_offset=1&candidates_limit=1&impact_limit=1", fmt.Sprintf(`{"code":"CH","name":"Child","parent_id":%q,"inherited_field_ids":[%q,%q],"display_key":"sn","print_preset_ids":["label"]}`, h.catID, mac, h.snFieldID))
	requireInheritanceStatus(t, rec, http.StatusOK)
	p := decode[inheritanceHTTPPreview](t, rec)
	if p.Inheritance.Candidates.Total != 2 || p.Inheritance.Candidates.Offset != 1 || p.Inheritance.Candidates.Limit != 1 || len(p.Inheritance.Candidates.Items) != 1 || p.Inheritance.Candidates.Items[0].Field.ID != h.snFieldID || p.Inheritance.Candidates.Items[0].SourceCategoryID != h.catID || !p.Inheritance.Candidates.Items[0].Selected {
		t.Fatalf("candidates=%+v", p.Inheritance)
	}
	if len(p.Inheritance.Selected) != 2 || len(p.Fields) != 2 || p.Impact.Total != 2 || len(p.Impact.Items) != 1 || p.Impact.Added != 2 || p.Impact.Categories != 1 || p.Impact.Assets != 0 || p.Issues.Items == nil || p.RequiresConfirmation || p.Token != "" {
		t.Fatalf("preview=%+v", p)
	}
	rec = h.post(t, "/api/categories/"+h.catID+"/preview?candidates_limit=999&impact_offset=999&issues_limit=-1", `{}`)
	requireInheritanceStatus(t, rec, http.StatusOK)
	p = decode[inheritanceHTTPPreview](t, rec)
	if p.Category.ID != h.catID || len(p.Fields) != 2 || p.Inheritance.Selected == nil || p.Inheritance.Candidates.Items == nil || p.Inheritance.Candidates.Limit != 200 || p.Impact.Items == nil || p.Issues.Limit != 50 {
		t.Fatalf("current preview=%+v", p)
	}
	if got := inheritanceHTTPState(t, h); got != before {
		t.Fatal("preview changed stored data or audit")
	}
}

func TestInheritanceHTTPPresenceAndRefusals(t *testing.T) {
	h := newHarness(t)
	child, err := h.schema.CreateCategory(h.ctx, schema.CreateCategoryInput{Code: "CH", Name: "Child", ParentID: &h.catID})
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		name, method, path, body string
		status                   int
		field                    string
	}{
		{"create omitted", http.MethodPost, "/api/categories", fmt.Sprintf(`{"code":"A","name":"A","parent_id":%q}`, h.catID), 201, ""},
		{"create empty", http.MethodPost, "/api/categories", fmt.Sprintf(`{"code":"B","name":"B","parent_id":%q,"inherited_field_ids":[]}`, h.catID), 201, ""},
		{"create null", http.MethodPost, "/api/categories", `{"code":"N","name":"N","inherited_field_ids":null}`, 400, "inherited_field_ids"},
		{"patch null", http.MethodPatch, "/api/categories/" + child.ID, `{"inherited_field_ids":null}`, 400, "inherited_field_ids"},
		{"preview null", http.MethodPost, "/api/categories/" + child.ID + "/preview", `{"inherited_field_ids":null}`, 400, "inherited_field_ids"},
		{"preview malformed", http.MethodPost, "/api/categories/preview", `{`, 400, ""},
		{"preview wrong array", http.MethodPost, "/api/categories/preview", `{"inherited_field_ids":[1]}`, 400, "inherited_field_ids"},
		{"preview null member", http.MethodPost, "/api/categories/preview", `{"inherited_field_ids":[null]}`, 400, "inherited_field_ids"},
		{"preview parent shape", http.MethodPost, "/api/categories/preview", `{"parent_id":[]}`, 400, "parent_id"},
		{"missing target", http.MethodPost, "/api/categories/missing/preview", `{}`, 404, ""},
		{"missing parent", http.MethodPost, "/api/categories/preview", `{"parent_id":"missing"}`, 404, ""},
		{"root selection", http.MethodPost, "/api/categories/preview", fmt.Sprintf(`{"inherited_field_ids":[%q]}`, h.snFieldID), 400, "inherited_field_ids"},
		{"parent cycle", http.MethodPatch, "/api/categories/" + h.catID, fmt.Sprintf(`{"parent_id":%q}`, child.ID), 400, "parent_id"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			before := inheritanceHTTPState(t, h)
			rec := h.do(t, tc.method, tc.path, tc.body)
			requireInheritanceStatus(t, rec, tc.status)
			if tc.status >= 400 {
				e := decode[Envelope](t, rec)
				if e.Error.Code == "" || e.Error.Message == "" || (tc.field != "" && e.Error.Fields[tc.field] == "") {
					t.Fatalf("error not located: %+v", e)
				}
				if inheritanceHTTPState(t, h) != before {
					t.Fatal("rejected request changed state")
				}
			} else {
				cat := decode[model.Category](t, rec)
				fields, err := h.schema.EffectiveFields(h.ctx, cat.ID)
				if err != nil || len(fields) != 0 {
					t.Fatalf("implicitly inherited: %+v err=%v", fields, err)
				}
			}
		})
	}
	// Omitted parent retains it; explicit null removes it; a string restores it.
	for _, body := range []string{`{"name":"Renamed"}`, `{"parent_id":null}`, fmt.Sprintf(`{"parent_id":%q,"inherited_field_ids":[]}`, h.catID)} {
		rec := h.patch(t, "/api/categories/"+child.ID, body)
		requireInheritanceStatus(t, rec, 200)
		cat := decode[model.Category](t, rec)
		if strings.Contains(body, "null") {
			if cat.ParentID != nil {
				t.Fatal("null did not move to root")
			}
		} else if cat.ParentID == nil || *cat.ParentID != h.catID {
			t.Fatal("omitted/string parent not preserved")
		}
	}
}

func TestInheritanceHTTPPreviewIssuesUseRequestLanguage(t *testing.T) {
	h := newHarness(t)
	child, err := h.schema.CreateCategory(h.ctx, schema.CreateCategoryInput{Code: "CH", Name: "Child", ParentID: &h.catID})
	if err != nil {
		t.Fatal(err)
	}
	before := inheritanceHTTPState(t, h)
	for _, tc := range []struct{ lang, fragment string }{{"en", "effective"}, {"zh", "有效"}} {
		rec := h.doLang(t, tc.lang, http.MethodPost, "/api/categories/"+child.ID+"/preview", `{"display_key":"mac"}`)
		requireInheritanceStatus(t, rec, 200)
		p := decode[inheritanceHTTPPreview](t, rec)
		if p.Issues.Total != 1 || p.Issues.Items[0].Code != "display_key_unbound" || p.Issues.Items[0].CategoryID != child.ID || p.Issues.Items[0].FieldKey != "mac" || !strings.Contains(p.Issues.Items[0].Message, tc.fragment) || p.Token != "" {
			t.Fatalf("localized preview=%+v", p)
		}
	}
	if inheritanceHTTPState(t, h) != before {
		t.Fatal("invalid preview wrote data")
	}
}

func TestInheritanceHTTPPreviewReadPermissionDoesNotGrantWrites(t *testing.T) {
	h := newHarness(t)
	token := h.asRole(t, authz.UserRoleID)
	before := inheritanceHTTPState(t, h)
	for _, path := range []string{"/api/categories/preview", "/api/categories/" + h.catID + "/preview"} {
		requireInheritanceStatus(t, h.doAs(t, token, http.MethodPost, path, `{}`), 200)
		rec := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(`{}`))
		req.Header.Set("Content-Type", "application/json")
		h.router.ServeHTTP(rec, req)
		requireInheritanceStatus(t, rec, 401)
	}
	requireInheritanceStatus(t, h.doAs(t, token, http.MethodPost, "/api/categories", `{"code":"NO","name":"No"}`), 403)
	requireInheritanceStatus(t, h.doAs(t, token, http.MethodPatch, "/api/categories/"+h.catID, `{"name":"No"}`), 403)
	if inheritanceHTTPState(t, h) != before {
		t.Fatal("read or forbidden request changed state")
	}
}

func TestInheritanceHTTPWriteRefusalsAreLocalizedAndAtomic(t *testing.T) {
	h := newHarness(t)
	mac := inheritanceMAC(t, h)
	ids := []string{mac}
	child, err := h.schema.CreateCategory(h.ctx, schema.CreateCategoryInput{Code: "CH", Name: "Child", ParentID: &h.catID, InheritedFieldIDs: &ids})
	if err != nil {
		t.Fatal(err)
	}
	h.seed(t, 1, 1)
	field, err := h.schema.CreateField(h.ctx, schema.CreateFieldInput{Key: "extra", Label: "Extra", Type: model.FieldText})
	if err != nil {
		t.Fatal(err)
	}
	// Exercise confirmation and validation on an asset-bearing child. The
	// complete harness now supplies real effects rather than the initial stub.
	if err := h.schema.Bind(h.ctx, h.catID, field.ID, 30); err != nil {
		t.Fatal(err)
	}
	if err := h.db.Write(h.ctx, func(ctx context.Context, tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `UPDATE assets SET category_id = ?`, child.ID)
		return err
	}); err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		name, body, code, field, en, zh string
		status                          int
	}{
		{"confirmation", `{"inherited_field_ids":[]}`, "confirmation_required", "", "confirm", "确认", 409},
		{"display", `{"display_key":"extra"}`, "validation_failed", "display_key", "effective", "有效", 422},
		{"invalid", `{"inherited_field_ids":["unknown"]}`, "validation_failed", "inherited_field_ids", "immediate parent", "直接父", 400},
	} {
		t.Run(tc.name, func(t *testing.T) {
			before := inheritanceHTTPState(t, h)
			for _, lang := range []string{"en", "zh"} {
				rec := h.doLang(t, lang, http.MethodPatch, "/api/categories/"+child.ID, tc.body)
				requireInheritanceStatus(t, rec, tc.status)
				e := decode[Envelope](t, rec).Error
				fragment := tc.en
				if lang == "zh" {
					fragment = tc.zh
				}
				if e.Code != tc.code || !strings.Contains(e.Message, fragment) || (tc.field != "" && e.Fields[tc.field] == "") {
					t.Fatalf("refusal=%+v", e)
				}
			}
			if inheritanceHTTPState(t, h) != before {
				t.Fatal("refused write changed data or audit")
			}
		})
	}
	// Static addition is now supported; assert the actual version effect rather
	// than retaining the temporary unavailable expectation from T015.
	var assetID string
	var version int
	if err := h.db.ReadDB().QueryRowContext(h.ctx, `SELECT id, version FROM assets WHERE category_id = ?`, child.ID).Scan(&assetID, &version); err != nil {
		t.Fatal(err)
	}
	requireInheritanceStatus(t, h.patch(t, "/api/categories/"+child.ID, fmt.Sprintf(`{"inherited_field_ids":[%q,%q]}`, mac, field.ID)), 200)
	var updatedVersion int
	if err := h.db.ReadDB().QueryRowContext(h.ctx, `SELECT version FROM assets WHERE id = ?`, assetID).Scan(&updatedVersion); err != nil || updatedVersion != version+1 {
		t.Fatalf("addition version = %d, %v; want %d", updatedVersion, err, version+1)
	}
	// With no asset effects, a withdrawal still cannot bypass confirmation.
	empty, err := h.schema.CreateCategory(h.ctx, schema.CreateCategoryInput{Code: "EMPTY", Name: "Empty", ParentID: &h.catID, InheritedFieldIDs: &ids})
	if err != nil {
		t.Fatal(err)
	}
	before := inheritanceHTTPState(t, h)
	rec := h.patch(t, "/api/categories/"+empty.ID, `{"inherited_field_ids":[]}`)
	requireInheritanceStatus(t, rec, 409)
	if decode[Envelope](t, rec).Error.Code != "confirmation_required" || inheritanceHTTPState(t, h) != before {
		t.Fatal("missing confirmation not refused atomically")
	}
}

// Paging must not change the complete withdrawal counts or hide a dependency
// outside the page. Grandchildren retain the original source, not their parent.
func TestInheritanceHTTPPreviewKeepsCompleteDescendantImpact(t *testing.T) {
	h := newHarness(t)
	mac := inheritanceMAC(t, h)
	ids := []string{mac, h.snFieldID}
	key := "sn"
	child, err := h.schema.CreateCategory(h.ctx, schema.CreateCategoryInput{Code: "CH", Name: "Child", ParentID: &h.catID, InheritedFieldIDs: &ids, DisplayKey: key})
	if err != nil {
		t.Fatal(err)
	}
	leaf, err := h.schema.CreateCategory(h.ctx, schema.CreateCategoryInput{Code: "LF", Name: "Leaf", ParentID: &child.ID, InheritedFieldIDs: &ids, DisplayKey: key})
	if err != nil {
		t.Fatal(err)
	}
	before := inheritanceHTTPState(t, h)
	rec := h.post(t, "/api/categories/"+leaf.ID+"/preview", `{}`)
	requireInheritanceStatus(t, rec, 200)
	p := decode[inheritanceHTTPPreview](t, rec)
	if p.Inheritance.Candidates.Total != 2 {
		t.Fatalf("candidates=%+v", p.Inheritance)
	}
	for _, candidate := range p.Inheritance.Candidates.Items {
		if candidate.SourceCategoryID != h.catID || !candidate.Selected {
			t.Fatalf("source drifted: %+v", candidate)
		}
	}
	rec = h.post(t, "/api/categories/"+child.ID+"/preview?impact_offset=1&impact_limit=1&issues_offset=1&issues_limit=1", `{"inherited_field_ids":[]}`)
	requireInheritanceStatus(t, rec, 200)
	p = decode[inheritanceHTTPPreview](t, rec)
	if p.Impact.Total != 4 || p.Impact.Removed != 4 || p.Impact.Categories != 2 || len(p.Impact.Items) != 1 || p.Impact.Offset != 1 || p.Issues.Total != 2 || len(p.Issues.Items) != 1 || p.Issues.Offset != 1 || !p.RequiresConfirmation || p.Token != "" {
		t.Fatalf("paged impact=%+v", p)
	}
	if inheritanceHTTPState(t, h) != before {
		t.Fatal("withdrawal preview changed data")
	}
}

func TestInheritanceHTTPWritesAuditOnceAndPreviewNeverDoes(t *testing.T) {
	h := newHarness(t)
	rec := h.post(t, "/api/categories", `{"code":"AUD","name":"Before","inherited_field_ids":[],"print_preset_ids":["small"]}`)
	requireInheritanceStatus(t, rec, 201)
	cat := decode[model.Category](t, rec)
	rec = h.patch(t, "/api/categories/"+cat.ID, `{"name":"After","print_preset_ids":["large"]}`)
	requireInheritanceStatus(t, rec, 200)
	for _, action := range []string{"create", "update"} {
		var count int
		var after string
		if err := h.db.ReadDB().QueryRowContext(h.ctx, `SELECT count(*), after FROM audit_log WHERE target_type = 'category' AND target_id = ? AND action = ?`, cat.ID, action).Scan(&count, &after); err != nil {
			t.Fatal(err)
		}
		if count != 1 {
			t.Fatalf("%s audit count=%d", action, count)
		}
		var stored model.Category
		if err := json.Unmarshal([]byte(after), &stored); err != nil {
			t.Fatal(err)
		}
		want := "Before"
		if action == "update" {
			want = "After"
		}
		if stored.ID != cat.ID || stored.Name != want {
			t.Fatalf("audit after=%+v", stored)
		}
	}
	before := inheritanceHTTPState(t, h)
	rec = h.post(t, "/api/categories/"+cat.ID+"/preview", `{"name":"Unsaved"}`)
	requireInheritanceStatus(t, rec, 200)
	if inheritanceHTTPState(t, h) != before {
		t.Fatal("preview produced audit or domain writes")
	}
}

func inheritanceMAC(t *testing.T, h *harness) string {
	t.Helper()
	for _, f := range listFields(t, h) {
		if f["key"] == "mac" {
			return f["id"].(string)
		}
	}
	t.Fatal("fixture MAC missing")
	return ""
}

func requireInheritanceStatus(t *testing.T, rec *httptest.ResponseRecorder, want int) {
	t.Helper()
	if rec.Code != want {
		t.Fatalf("status=%d want=%d body=%s", rec.Code, want, rec.Body.String())
	}
}

// Snapshot all domain tables, including indexes and audit, without reading any
// non-test database. A preview must not write even when its issues are empty.
func inheritanceHTTPState(t *testing.T, h *harness) string {
	t.Helper()
	tables, err := h.db.ReadDB().QueryContext(h.ctx, `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`)
	if err != nil {
		t.Fatal(err)
	}
	var names []string
	for tables.Next() {
		var name string
		if err := tables.Scan(&name); err != nil {
			t.Fatal(err)
		}
		names = append(names, name)
	}
	if err := tables.Err(); err != nil {
		t.Fatal(err)
	}
	if err := tables.Close(); err != nil {
		t.Fatal(err)
	}
	state := map[string][]string{}
	for _, name := range names {
		rows, err := h.db.ReadDB().QueryContext(h.ctx, `SELECT * FROM "`+strings.ReplaceAll(name, `"`, `""`)+`" ORDER BY rowid`)
		if err != nil {
			t.Fatal(err)
		}
		cols, err := rows.Columns()
		if err != nil {
			t.Fatal(err)
		}
		for rows.Next() {
			values := make([]any, len(cols))
			ptrs := make([]any, len(cols))
			for i := range values {
				ptrs[i] = &values[i]
			}
			if err := rows.Scan(ptrs...); err != nil {
				t.Fatal(err)
			}
			b, err := json.Marshal(values)
			if err != nil {
				t.Fatal(err)
			}
			state[name] = append(state[name], string(b))
		}
		if err := rows.Err(); err != nil {
			t.Fatal(err)
		}
		if err := rows.Close(); err != nil {
			t.Fatal(err)
		}
	}
	b, err := json.Marshal(state)
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}
