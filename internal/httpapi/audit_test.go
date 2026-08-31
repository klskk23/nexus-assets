package httpapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/klskk23/nexus-assets/internal/audit"
)

// Every metadata change must leave a trace. Changing one serial-number rule
// renumbers a whole warehouse, so "who changed the configuration" has to be
// answerable after the fact.
func TestEveryMetadataMutationIsAudited(t *testing.T) {
	h := newHarness(t)

	steps := []struct {
		name   string
		do     func() *httptest.ResponseRecorder
		target audit.TargetType
		action audit.Action
	}{
		{
			name: "create a category",
			do: func() *httptest.ResponseRecorder {
				return h.post(t, "/api/categories", `{"code":"SW","name":"交换机"}`)
			},
			target: audit.TargetCategory, action: audit.ActionCreate,
		},
		{
			name: "create a field",
			do: func() *httptest.ResponseRecorder {
				return h.post(t, "/api/fields", `{"key":"ports","label":"端口数","type":"number"}`)
			},
			target: audit.TargetField, action: audit.ActionCreate,
		},
		{
			name: "create a holder",
			do: func() *httptest.ResponseRecorder {
				return h.post(t, "/api/holders", `{"type":"company","name":"XX 集团"}`)
			},
			target: audit.TargetHolder, action: audit.ActionCreate,
		},
		{
			name: "create a user",
			do: func() *httptest.ResponseRecorder {
				return h.post(t, "/api/users", `{"email":"zhang@example.com","name":"张三","password":"correct-horse"}`)
			},
			target: audit.TargetUser, action: audit.ActionCreate,
		},
	}

	for _, step := range steps {
		t.Run(step.name, func(t *testing.T) {
			rec := step.do()
			if rec.Code != http.StatusCreated && rec.Code != http.StatusNoContent {
				t.Fatalf("%s returned %d: %s", step.name, rec.Code, rec.Body.String())
			}
			page := decode[audit.Page](t, h.get(t, "/api/audit?target_type="+string(step.target)))
			if page.Total == 0 {
				t.Fatalf("no audit entry for %s", step.name)
			}
			e := page.Items[0]
			if e.Action != step.action {
				t.Errorf("action = %q, want %q", e.Action, step.action)
			}
			if e.ActorName == "" {
				t.Error("the entry must name who did it")
			}
			if e.After == nil {
				t.Error("a creation should record the resulting state")
			}
		})
	}
}

func TestUpdatingAFieldTemplateRecordsBothSides(t *testing.T) {
	h := newHarness(t)

	newRule := `category.code + \"-\" + hex2dec(attrs.mac)`
	if rec := h.patch(t, "/api/fields/"+h.snFieldID,
		`{"options":{"template":"`+newRule+`"}}`); rec.Code != http.StatusOK {
		t.Fatalf("update: %s", rec.Body.String())
	}

	page := decode[audit.Page](t, h.get(t, "/api/audit?target_type=field"))
	if page.Total == 0 {
		t.Fatal("the rule change was not audited")
	}
	e := page.Items[0]
	if e.Action != audit.ActionUpdate {
		t.Errorf("action = %q", e.Action)
	}
	// Knowing what the rule said before is what makes the entry useful.
	if e.Before == nil || e.After == nil {
		t.Fatalf("an update must record both sides: before=%s after=%s", e.Before, e.After)
	}
	if !contains(string(e.Before), "hex2dec") {
		t.Errorf("before = %s", e.Before)
	}
	if !contains(string(e.After), "category.code") {
		t.Errorf("after = %s", e.After)
	}
}

func TestAuditEndpointFiltersAndPaginates(t *testing.T) {
	h := newHarness(t)
	for i := 0; i < 3; i++ {
		if rec := h.post(t, "/api/holders",
			`{"type":"company","name":"客户`+string(rune('A'+i))+`"}`); rec.Code != http.StatusCreated {
			t.Fatal(rec.Body.String())
		}
	}
	if rec := h.post(t, "/api/fields", `{"key":"note2","label":"备注2","type":"text"}`); rec.Code != http.StatusCreated {
		t.Fatal(rec.Body.String())
	}

	holders := decode[audit.Page](t, h.get(t, "/api/audit?target_type=holder"))
	if holders.Total != 3 {
		t.Errorf("holder entries = %d, want 3", holders.Total)
	}
	fields := decode[audit.Page](t, h.get(t, "/api/audit?target_type=field"))
	if fields.Total != 1 {
		t.Errorf("field entries = %d, want 1", fields.Total)
	}

	paged := decode[audit.Page](t, h.get(t, "/api/audit?target_type=holder&limit=2"))
	if len(paged.Items) != 2 || paged.Total != 3 {
		t.Errorf("paging: %d items of %d total", len(paged.Items), paged.Total)
	}

	rec := h.get(t, "/api/audit?from=not-a-time")
	if rec.Code != http.StatusUnprocessableEntity {
		t.Errorf("a malformed time should be rejected, got %d", rec.Code)
	}
}

// Deleting a holder that assets still use must be refused, and the refusal has
// to say which assets are in the way.
func TestDeletingAHeldHolderIsRefusedWithBlockers(t *testing.T) {
	h := newHarness(t)
	h.seed(t, 0, 2)

	// The seeded warehouse is also the default stock point, and that refusal
	// fires first. Move the devices somewhere else so the blocking-assets
	// refusal is the one under test.
	created := h.do(t, http.MethodPost, "/api/holders", `{"type":"location","name":"备用仓库"}`)
	var spare struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(created.Body.Bytes(), &spare); err != nil {
		t.Fatal(err)
	}
	page := h.do(t, http.MethodGet, "/api/assets?limit=2", "")
	var list struct {
		Items []struct {
			ID string `json:"id"`
		} `json:"items"`
	}
	if err := json.Unmarshal(page.Body.Bytes(), &list); err != nil {
		t.Fatal(err)
	}
	ids := make([]string, 0, len(list.Items))
	for _, it := range list.Items {
		ids = append(ids, `"`+it.ID+`"`)
	}
	if rec := h.do(t, http.MethodPost, "/api/transfers",
		`{"asset_ids":[`+strings.Join(ids, ",")+`],"to_holder_type":"entity","to_holder_id":"`+spare.ID+`"}`); rec.Code != http.StatusOK && rec.Code != http.StatusCreated {
		t.Fatalf("move the devices: %d %s", rec.Code, rec.Body)
	}

	rec := h.do(t, http.MethodDelete, "/api/holders/"+spare.ID, "")
	if rec.Code != http.StatusConflict {
		t.Fatalf("want 409, got %d: %s", rec.Code, rec.Body.String())
	}
	body := rec.Body.String()
	if !contains(body, CodeReferenceBlocked) {
		t.Errorf("code should be %s, got %s", CodeReferenceBlocked, body)
	}
	if !contains(body, "blockers") {
		t.Errorf("the response should carry the blocking assets, got %s", body)
	}
	if !contains(body, "持有") {
		t.Errorf("the message should say why, got %s", body)
	}
}

func TestDeletingAnAssetNeedsTheMatchingNumber(t *testing.T) {
	h := newHarness(t)
	h.seed(t, 0, 1)
	id := h.firstAssetID(t)
	sn := decode[assetListResponse](t, h.get(t, "/api/assets")).Items[0].DisplayName

	if rec := h.do(t, http.MethodDelete, "/api/assets/"+id, ""); rec.Code != http.StatusBadRequest {
		t.Errorf("no confirmation at all should be refused, got %d", rec.Code)
	}
	if rec := h.do(t, http.MethodDelete, "/api/assets/"+id+"?confirm=wrong", ""); rec.Code != http.StatusUnprocessableEntity {
		t.Errorf("a mismatched confirmation should be refused, got %d", rec.Code)
	}
	if got := decode[assetListResponse](t, h.get(t, "/api/assets")).Total; got != 1 {
		t.Fatalf("the asset must survive a refused delete, total = %d", got)
	}

	if rec := h.do(t, http.MethodDelete, "/api/assets/"+id+"?confirm="+sn, ""); rec.Code != http.StatusNoContent {
		t.Fatalf("the right confirmation should delete, got %d", rec.Code)
	}
	if got := decode[assetListResponse](t, h.get(t, "/api/assets")).Total; got != 0 {
		t.Errorf("the asset should be gone, total = %d", got)
	}
}
