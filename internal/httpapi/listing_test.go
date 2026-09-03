package httpapi

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"
)

// TestListsAnswerBothWays pins the rule the whole round rests on: these lists
// are read as a table (one page, searched) and as a lookup (every row, for a
// dropdown), and the shape follows the question.
//
// The array form is not legacy politeness. The label printer parses
// /api/categories as an array, and every dropdown in the interface wants the
// whole set -- a paged dropdown silently hides the option somebody is looking
// for.
func TestListsAnswerBothWays(t *testing.T) {
	h := newHarness(t)

	for _, path := range []string{"/api/categories", "/api/models", "/api/statuses", "/api/holders", "/api/users"} {
		body := h.get(t, path).Body.Bytes()
		if len(body) == 0 || body[0] != '[' {
			t.Errorf("GET %s with no paging parameters must stay an array, got %s", path, truncate(body))
		}

		paged := h.get(t, path+"?limit=1").Body.Bytes()
		if len(paged) == 0 || paged[0] != '{' {
			t.Errorf("GET %s?limit=1 should answer with an envelope, got %s", path, truncate(paged))
		}
		var page struct {
			Items  []json.RawMessage `json:"items"`
			Total  int               `json:"total"`
			Offset int               `json:"offset"`
			Limit  int               `json:"limit"`
		}
		if err := json.Unmarshal(paged, &page); err != nil {
			t.Fatalf("%s: %v", path, err)
		}
		if page.Limit != 1 || len(page.Items) > 1 {
			t.Errorf("%s: limit was not honoured: %d items, limit %d", path, len(page.Items), page.Limit)
		}
	}
}

// The search box means the same thing everywhere: case-insensitive, anywhere
// in the fields that page says it searches.
func TestSearchNarrowsEveryList(t *testing.T) {
	h := newHarness(t)

	// The harness's category is "SDWAN 路由器" with code "RT".
	hit := h.get(t, "/api/categories?q=sdwan").Body.String()
	if !strings.Contains(hit, "SDWAN") {
		t.Errorf("search should match regardless of case: %s", hit)
	}
	miss := h.get(t, "/api/categories?q=没有这个东西").Body.String()
	if strings.Contains(miss, "SDWAN") {
		t.Errorf("a search that matches nothing should return nothing: %s", miss)
	}
	// A search alone is enough to get the envelope: the page needs the total
	// to say "3 of 47" and to decide whether a pager is warranted at all.
	if miss[0] != '{' {
		t.Errorf("a search should answer with an envelope, got %s", miss)
	}

	// Holders search their note as well as their name -- "货架 A1" is how
	// somebody finds the warehouse they mean.
	rec := h.do(t, http.MethodPost, "/api/holders", `{"type":"location","name":"北京仓库","note":"货架 B1-B9"}`)
	if rec.Code != http.StatusCreated {
		t.Fatal(rec.Body.String())
	}
	if got := h.get(t, "/api/holders?q=B1-B9").Body.String(); !strings.Contains(got, "北京仓库") {
		t.Errorf("a holder's note is searched too: %s", got)
	}
}

// The account list has two filters beside its search, and they are filters
// rather than search terms: "启用" must not match somebody's name.
func TestAccountFilters(t *testing.T) {
	h := newHarness(t)
	rec := h.do(t, http.MethodPost, "/api/users",
		`{"email":"clerk@example.com","name":"仓管","password":"correct-horse","role_id":"role-user"}`)
	if rec.Code != http.StatusCreated {
		t.Fatal(rec.Body.String())
	}

	byRole := h.get(t, "/api/users?role_id=role-user&limit=50").Body.String()
	if !strings.Contains(byRole, "clerk@example.com") || strings.Contains(byRole, "admin@example.com") {
		t.Errorf("filtering by role should leave only that role: %s", byRole)
	}
	byStatus := h.get(t, "/api/users?status=disabled&limit=50").Body.String()
	if strings.Contains(byStatus, "clerk@example.com") {
		t.Errorf("nobody is disabled yet: %s", byStatus)
	}
}

// The holder list has the two filters its page offers, and they are filters
// rather than search terms: a location named "公司总部" must not answer "type
// is company".
func TestHolderFilters(t *testing.T) {
	h := newHarness(t)
	for _, body := range []string{
		`{"type":"company","name":"公司总部"}`,
		`{"type":"location","name":"公司总部仓库"}`,
	} {
		if rec := h.do(t, http.MethodPost, "/api/holders", body); rec.Code != http.StatusCreated {
			t.Fatal(rec.Body.String())
		}
	}

	byType := h.get(t, "/api/holders?type=company&limit=50").Body.String()
	if !strings.Contains(byType, "公司总部\"") || strings.Contains(byType, "公司总部仓库") {
		t.Errorf("filtering by type should leave only companies: %s", byType)
	}

	stock := h.get(t, "/api/holders?is_default_stock=true&limit=50").Body.String()
	if strings.Contains(stock, "公司总部仓库") {
		t.Errorf("neither holder is the default stock point: %s", stock)
	}
}

// The audit log's search is over the actor and the object's id. Not the
// object's name: the table records what changed, not what it was called.
func TestAuditSearch(t *testing.T) {
	h := newHarness(t)
	rec := h.do(t, http.MethodPost, "/api/holders", `{"type":"location","name":"广州仓库"}`)
	if rec.Code != http.StatusCreated {
		t.Fatal(rec.Body.String())
	}
	var created struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &created); err != nil {
		t.Fatal(err)
	}

	byActor := h.get(t, "/api/audit?q=管理").Body.String()
	if !strings.Contains(byActor, created.ID) {
		t.Errorf("the log should be searchable by who made the change: %s", truncate([]byte(byActor)))
	}
	byTarget := h.get(t, "/api/audit?q="+created.ID).Body.String()
	if !strings.Contains(byTarget, created.ID) {
		t.Errorf("the log should be searchable by the object's id: %s", truncate([]byte(byTarget)))
	}
	miss := h.get(t, "/api/audit?q=没有这个东西").Body.String()
	if strings.Contains(miss, created.ID) {
		t.Errorf("a search that matches nothing should return nothing: %s", truncate([]byte(miss)))
	}
}

func truncate(b []byte) string {
	if len(b) > 80 {
		return string(b[:80]) + "…"
	}
	return string(b)
}
