package httpapi

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"reflect"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/klskk23/nexus-assets/internal/asset"
	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/schema"
)

// Only the second row changes schema. Neither preview nor commit may downgrade
// the batch refusal to row validation or retain the otherwise-valid first row.
func TestImportSchemaStaleHTTP(t *testing.T) {
	for _, operation := range []string{"preview", "commit"} {
		for _, tc := range []struct{ lang, message string }{
			{"zh-CN", "字段配置已变化，请刷新后重试"},
			{"en", "Field configuration changed. Refresh and try again."},
		} {
			t.Run(operation+"/"+tc.lang, func(t *testing.T) {
				h := newHarness(t)
				product, err := h.schema.CreateModel(h.ctx, schema.CreateModelInput{Name: "Router"})
				if err != nil {
					t.Fatal(err)
				}
				before := schemaStaleAssetTables(t, h)
				var body bytes.Buffer
				form := multipart.NewWriter(&body)
				if err := form.WriteField("category_id", h.catID); err != nil {
					t.Fatal(err)
				}
				file, err := form.CreateFormFile("file", "assets.csv")
				if err != nil {
					t.Fatal(err)
				}
				if _, err := fmt.Fprint(file, "Model,Vendor,Holder,Note,MAC\nmodel,vendor,holder,note,mac\n,,上海仓库,first,001A2B3C4D5E\nRouter,,上海仓库,second,001A2B3C4D5F\n"); err != nil {
					t.Fatal(err)
				}
				if err := form.Close(); err != nil {
					t.Fatal(err)
				}
				req := httptest.NewRequest(http.MethodPost, "/api/import/"+operation, &body)
				req.Header.Set("Content-Type", form.FormDataContentType())
				req.Header.Set("Accept-Language", tc.lang)
				w := schemaStaleRequest(t, h, req, func(ctx context.Context, conn *sql.Conn) error {
					_, err := conn.ExecContext(ctx, `UPDATE product_models SET name = 'Changed model context' WHERE id = ?`, product.ID)
					return err
				})
				assertSchemaStaleResponse(t, w, tc.message)
				if after := schemaStaleAssetTables(t, h); !reflect.DeepEqual(before, after) {
					t.Errorf("stale import left partial asset writes:\nbefore=%v\nafter=%v", before, after)
				}
			})
		}
	}
}

// A schema change between Prepare and Persist must reject both new assets and
// edits, even when the asset version itself has not changed.
func TestAssetSaveSchemaStaleHTTP(t *testing.T) {
	for _, operation := range []string{"create", "edit"} {
		for _, tc := range []struct{ lang, message string }{
			{"zh-CN", "字段配置已变化，请刷新后重试"},
			{"en", "Field configuration changed. Refresh and try again."},
		} {
			t.Run(operation+"/"+tc.lang, func(t *testing.T) {
				h := newHarness(t)
				method, path, version := http.MethodPost, "/api/assets", 0
				if operation == "edit" {
					a, err := h.assets.Save(h.ctx, asset.SaveInput{
						CategoryID: h.catID, Status: model.StatusInStock, OwnerID: h.userID,
						Holder: model.Holder{Type: model.HolderTypeEntity, ID: h.locID},
						Attrs:  map[string]any{"mac": "001A2B3C4D5E"}, ActorID: h.userID,
					})
					if err != nil {
						t.Fatal(err)
					}
					method, path, version = http.MethodPatch, "/api/assets/"+a.ID, a.Version
				}
				before := schemaStaleAssetTables(t, h)
				body := fmt.Sprintf(`{"category_id":%q,"status":"in_stock","owner_id":%q,"holder_type":"entity","holder_id":%q,"version":%d,"attrs":{"mac":"001A2B3C4D5F"},"note":"must not persist"}`, h.catID, h.userID, h.locID, version)
				req := httptest.NewRequest(method, path, strings.NewReader(body))
				req.Header.Set("Content-Type", "application/json")
				req.Header.Set("Accept-Language", tc.lang)
				w := schemaStaleRequest(t, h, req, func(ctx context.Context, conn *sql.Conn) error {
					_, err := conn.ExecContext(ctx, `UPDATE categories SET name = 'Changed schema context' WHERE id = ?`, h.catID)
					return err
				})
				assertSchemaStaleResponse(t, w, tc.message)
				if after := schemaStaleAssetTables(t, h); !reflect.DeepEqual(before, after) {
					t.Errorf("stale save changed assets, indexes or events:\nbefore=%v\nafter=%v", before, after)
				}
			})
		}
	}
}

func schemaStaleRequest(t *testing.T, h *harness, req *http.Request, mutate func(context.Context, *sql.Conn) error) *httptest.ResponseRecorder {
	t.Helper()
	ctx, cancel := context.WithTimeout(h.ctx, 10*time.Second)
	defer cancel()
	db := h.db.WriteDBForTest()
	conn, err := db.Conn(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		if err := conn.Close(); err != nil && !errors.Is(err, sql.ErrConnDone) {
			t.Errorf("close write barrier: %v", err)
		}
	}()
	waits := db.Stats().WaitCount
	req = req.WithContext(ctx)
	req.Header.Set("Authorization", "Bearer "+h.token)
	done := make(chan *httptest.ResponseRecorder, 1)
	go func() {
		w := httptest.NewRecorder()
		h.router.ServeHTTP(w, req)
		done <- w
	}()
	// The only writer is occupied without holding a SQLite transaction. Once
	// BEGIN waits for that connection, preparation has finished and a competing
	// schema write can commit through the held connection before Persist runs.
	for db.Stats().WaitCount == waits {
		select {
		case w := <-done:
			t.Fatalf("request finished before transaction barrier: %d %s", w.Code, w.Body.String())
		case <-ctx.Done():
			t.Fatal("request never reached transaction barrier")
		default:
			runtime.Gosched()
		}
	}
	if err := mutate(ctx, conn); err != nil {
		t.Fatal(err)
	}
	if err := conn.Close(); err != nil {
		t.Fatal(err)
	}
	select {
	case w := <-done:
		return w
	case <-ctx.Done():
		t.Fatal("request did not complete after releasing the write connection")
		return nil
	}
}

func schemaStaleAssetTables(t *testing.T, h *harness) map[string][]string {
	t.Helper()
	out := map[string][]string{}
	for _, table := range []string{"assets", "asset_unique_values", "asset_search_values", "asset_transfers"} {
		rows, err := h.db.ReadDB().QueryContext(h.ctx, `SELECT * FROM `+table+` ORDER BY rowid`)
		if err != nil {
			t.Fatal(err)
		}
		columns, err := rows.Columns()
		if err != nil {
			rows.Close()
			t.Fatal(err)
		}
		for rows.Next() {
			values := make([]any, len(columns))
			pointers := make([]any, len(columns))
			for i := range values {
				pointers[i] = &values[i]
			}
			if err := rows.Scan(pointers...); err != nil {
				rows.Close()
				t.Fatal(err)
			}
			encoded, err := json.Marshal(values)
			if err != nil {
				rows.Close()
				t.Fatal(err)
			}
			out[table] = append(out[table], string(encoded))
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			t.Fatal(err)
		}
		if err := rows.Close(); err != nil {
			t.Fatal(err)
		}
	}
	return out
}

func TestFailErrSchemaStaleLocalized(t *testing.T) {
	for _, tc := range []struct{ lang, message string }{
		{"zh-CN", "字段配置已变化，请刷新后重试"},
		{"en", "Field configuration changed. Refresh and try again."},
	} {
		t.Run(tc.lang, func(t *testing.T) {
			w := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(w)
			c.Request = httptest.NewRequest(http.MethodPost, "/api/assets", nil)
			c.Request.Header.Set("Accept-Language", tc.lang)
			FailErr(c, fmt.Errorf("persist prepared asset: %w", asset.ErrSchemaStale))
			assertSchemaStaleResponse(t, w, tc.message)
		})
	}
}

func assertSchemaStaleResponse(t *testing.T, w *httptest.ResponseRecorder, message string) {
	t.Helper()
	var env Envelope
	if err := json.Unmarshal(w.Body.Bytes(), &env); err != nil {
		t.Fatalf("decode response: %v; body=%s", err, w.Body.String())
	}
	if w.Code != http.StatusConflict || env.Error.Code != "schema_stale" || env.Error.Message != message {
		t.Errorf("response = %d %s; want 409 schema_stale %q", w.Code, w.Body.String(), message)
	}
}
