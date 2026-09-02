package httpapi

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/klskk23/nexus-assets/internal/asset"
	"github.com/klskk23/nexus-assets/internal/audit"
	"github.com/klskk23/nexus-assets/internal/auth"
	"github.com/klskk23/nexus-assets/internal/config"
	"github.com/klskk23/nexus-assets/internal/holder"
	"github.com/klskk23/nexus-assets/internal/i18n"
	"github.com/klskk23/nexus-assets/internal/importer"
	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/schema"
	"github.com/klskk23/nexus-assets/internal/store"
	"github.com/klskk23/nexus-assets/internal/transfer"
)

type harness struct {
	router    *gin.Engine
	db        *store.Store
	schema    *schema.Store
	token     string
	assets    *asset.Service
	catID     string
	locID     string
	userID    string
	snFieldID string
	ctx       context.Context
}

func newHarness(t *testing.T) *harness { return newHarnessWith(t, config.Config{}) }

// newHarnessWithConfigKey arms the key that lives in the configuration file.
func newHarnessWithConfigKey(t *testing.T, secret, email string) *harness {
	t.Helper()
	return newHarnessWith(t, config.Config{AdminAPIKey: secret, AdminEmail: email})
}

// newHarnessWithPrinting points the server at a stand-in print service.
func newHarnessWithPrinting(t *testing.T, printURL string) *harness {
	t.Helper()
	return newHarnessWith(t, config.Config{PrinterURL: printURL})
}

// newHarnessWith builds the server with the parts of the configuration a test
// cares about; the rest is filled in here.
func newHarnessWith(t *testing.T, over config.Config) *harness {
	t.Helper()
	gin.SetMode(gin.TestMode)
	ctx := context.Background()

	db, err := store.OpenCounting(filepath.Join(t.TempDir(), "n.db"))
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	if err := db.Migrate(ctx); err != nil {
		t.Fatalf("migrate: %v", err)
	}

	sch := schema.New(db)
	hs := holder.New(db)
	us := auth.NewStore(db)
	svc := asset.NewService(db, sch)

	u, err := us.Create(ctx, auth.CreateInput{
		Email: "admin@example.com", Name: "管理员",
		AuthType: model.AuthLocal, Password: "correct-horse",
	})
	if err != nil {
		t.Fatalf("create user: %v", err)
	}
	loc, err := hs.Create(ctx, holder.CreateInput{Type: model.EntityLocation, Name: "上海仓库"})
	if err != nil {
		t.Fatalf("create location: %v", err)
	}
	// Marked so the return action has somewhere to send devices back to.
	if err := hs.SetDefaultStock(ctx, loc.ID); err != nil {
		t.Fatalf("set default stock: %v", err)
	}
	root, err := sch.CreateCategory(ctx, schema.CreateCategoryInput{
		Code: "RT", Name: "SDWAN 路由器",
	})
	if err != nil {
		t.Fatalf("create category: %v", err)
	}
	mac, err := sch.CreateField(ctx, schema.CreateFieldInput{
		Key: "mac", Label: "基准 MAC", Type: model.FieldMAC, IsUnique: true,
	})
	if err != nil {
		t.Fatalf("create field: %v", err)
	}
	if err := sch.Bind(ctx, root.ID, mac.ID, true, 10); err != nil {
		t.Fatalf("bind: %v", err)
	}
	sn, err := sch.CreateField(ctx, schema.CreateFieldInput{
		Key: "sn", Label: "设备编号", Type: model.FieldComputed, IsUnique: true,
		Options: model.FieldOptions{Template: "hex2dec(attrs.mac)"},
	})
	if err != nil {
		t.Fatalf("create sn field: %v", err)
	}
	if err := sch.Bind(ctx, root.ID, sn.ID, false, 20); err != nil {
		t.Fatalf("bind sn: %v", err)
	}
	displayKey := "sn"
	if _, err := sch.UpdateCategory(ctx, root.ID, schema.UpdateCategoryInput{DisplayKey: &displayKey}); err != nil {
		t.Fatalf("set display key: %v", err)
	}

	cfg := &over
	cfg.JWTSecret, cfg.JWTTTL = []byte("test"), time.Hour
	issuer := auth.NewIssuer(cfg.JWTSecret, cfg.JWTTTL)
	tok, err := issuer.Issue(u.ID, u.Email, u.Name, 0)
	if err != nil {
		t.Fatalf("issue token: %v", err)
	}

	srv := NewServer(cfg, db, issuer, us, sch, hs, svc, transfer.New(db, hs),
		importer.New(db, sch, hs, us, svc), audit.New(db), nil,
		auth.NewSessions(db, 720*time.Hour), auth.NewKeys(db), nil)
	return &harness{
		router: srv.Router(), db: db, schema: sch, token: tok, assets: svc,
		catID: root.ID, locID: loc.ID, userID: u.ID, snFieldID: sn.ID, ctx: ctx,
	}
}

func (h *harness) seed(t *testing.T, from, n int) {
	t.Helper()
	for i := from; i < from+n; i++ {
		_, err := h.assets.Save(h.ctx, asset.SaveInput{
			CategoryID: h.catID, Status: model.StatusInStock, OwnerID: h.userID,
			Holder:  model.Holder{Type: model.HolderTypeEntity, ID: h.locID},
			Attrs:   map[string]any{"mac": fmt.Sprintf("001A2B3C%04X", i)},
			ActorID: h.userID,
		})
		if err != nil {
			if fe, ok := err.(asset.FieldErrors); ok {
				t.Fatalf("seed %d: %v", i, fe.In(i18n.ZH))
			}
			t.Fatalf("seed %d: %v", i, err)
		}
	}
}

func (h *harness) do(t *testing.T, method, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	return h.doLang(t, "", method, path, body)
}

// doLang sends the request with an Accept-Language header, which is how the
// server decides what language to answer in.
func (h *harness) doLang(t *testing.T, lang, method, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	var req *http.Request
	if body == "" {
		req = httptest.NewRequest(method, path, nil)
	} else {
		req = httptest.NewRequest(method, path, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
	}
	req.Header.Set("Authorization", "Bearer "+h.token)
	if lang != "" {
		req.Header.Set("Accept-Language", lang)
	}
	rec := httptest.NewRecorder()
	h.router.ServeHTTP(rec, req)
	return rec
}

func (h *harness) patch(t *testing.T, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	return h.do(t, http.MethodPatch, path, body)
}

func (h *harness) get(t *testing.T, path string) *httptest.ResponseRecorder {
	t.Helper()
	return h.do(t, http.MethodGet, path, "")
}

// firstAssetID returns the id of the earliest seeded asset.
func (h *harness) firstAssetID(t *testing.T) string {
	t.Helper()
	res, err := h.assets.List(h.ctx, asset.ListFilter{Limit: 1})
	if err != nil || len(res.Items) == 0 {
		t.Fatalf("no seeded asset: %v", err)
	}
	return res.Items[0].ID
}

// TestAssetListIssuesConstantQueryCount is the N+1 guard the constitution asks
// for (principle IV).
//
// Rendering a page needs holder, owner and model names. The naive shape looks
// them up per row, which is invisible at three assets and painful at fifty. The
// list therefore batches each kind into one query, and this test fails the
// moment someone reintroduces a per-row lookup.
func TestAssetListIssuesConstantQueryCount(t *testing.T) {
	h := newHarness(t)

	h.seed(t, 0, 3)
	count := store.ResetQueryCount()
	if rec := h.get(t, "/api/assets?limit=50"); rec.Code != http.StatusOK {
		t.Fatalf("status %d: %s", rec.Code, rec.Body.String())
	}
	small := count()

	h.seed(t, 3, 47) // 50 rows in total
	count = store.ResetQueryCount()
	rec := h.get(t, "/api/assets?limit=50")
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d: %s", rec.Code, rec.Body.String())
	}
	large := count()

	t.Logf("queries: %d for 3 rows, %d for 50 rows", small, large)
	if large != small {
		t.Errorf("query count grew from %d to %d when the page went from 3 to 50 rows; "+
			"something is looking a name up per row", small, large)
	}
}

// TestMoveCategoryWithAssetsIsRefused pins the JSON handling behind the guard.
//
// An explicit null must mean "move to the root" and a missing key must mean
// "leave the parent alone". Conflating them once made this request a silent
// no-op that still answered 200.
func TestMoveCategoryWithAssetsIsRefused(t *testing.T) {
	h := newHarness(t)
	h.seed(t, 0, 1)

	child, err := h.schema.CreateCategory(h.ctx, schema.CreateCategoryInput{
		Code: "SUB", Name: "子类", ParentID: &h.catID,
	})
	if err != nil {
		t.Fatalf("create child: %v", err)
	}

	// The populated category may not move. Somewhere else to move it to,
	// because asking for the parent it already has is not a move.
	dest, err := h.schema.CreateCategory(h.ctx, schema.CreateCategoryInput{Code: "DST", Name: "别处"})
	if err != nil {
		t.Fatalf("create destination: %v", err)
	}
	rec := h.patch(t, "/api/categories/"+h.catID, `{"parent_id":"`+dest.ID+`"}`)
	if rec.Code != http.StatusConflict {
		t.Fatalf("moving a populated category should be refused, got %d: %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), CodeCategoryHasAssets) {
		t.Errorf("expected %s, got %s", CodeCategoryHasAssets, rec.Body.String())
	}

	// An empty one may.
	rec = h.patch(t, "/api/categories/"+child.ID, `{"parent_id":null}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("an empty category should move, got %d: %s", rec.Code, rec.Body.String())
	}
	moved, err := h.schema.GetCategory(h.ctx, child.ID)
	if err != nil {
		t.Fatal(err)
	}
	if moved.ParentID != nil {
		t.Errorf("explicit null should detach the category, parent is still %v", *moved.ParentID)
	}

	// A request that never mentions the parent must leave it alone.
	name := "改名"
	rec = h.patch(t, "/api/categories/"+child.ID, `{"name":"`+name+`"}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("rename should succeed, got %d: %s", rec.Code, rec.Body.String())
	}
}

// assetIDs returns every seeded asset's id, oldest first.
func (h *harness) assetIDs(t *testing.T) []string {
	t.Helper()
	res, err := h.assets.List(h.ctx, asset.ListFilter{Limit: 100})
	if err != nil {
		t.Fatalf("list assets: %v", err)
	}
	out := make([]string, 0, len(res.Items))
	for _, a := range res.Items {
		out = append(out, a.ID)
	}
	return out
}
