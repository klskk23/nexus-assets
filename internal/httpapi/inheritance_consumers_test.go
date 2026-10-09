package httpapi

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/csv"
	"fmt"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"reflect"
	"slices"
	"strings"
	"testing"

	"github.com/klskk23/nexus-assets/internal/asset"
	"github.com/klskk23/nexus-assets/internal/importer"
	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/schema"
)

type inheritanceConsumersFixture struct {
	h       *harness
	printer *fakePrintService
	middle  model.Category
	leaf    model.Category
	live    model.FieldDefinition
	retired model.FieldDefinition
	vendor  model.FieldDefinition
	models  []model.ProductModel
	device  []model.FieldDefinition
	assets  []model.Asset
}

// One database and one three-level tree feed every consumer below. Both leaf
// assets retain an archived value, while their same-key model fields are distinct
// identities. Replacing effective resolution with ancestry/raw-key lookup breaks
// the shared expectations for schema, search, detail, files and printing.
func newInheritanceConsumersFixture(t *testing.T) inheritanceConsumersFixture {
	t.Helper()
	f := inheritanceConsumersFixture{printer: newFakePrintService(t)}
	f.h = newHarnessWithPrinting(t, f.printer.server.URL)
	h := f.h
	field := func(in schema.CreateFieldInput) model.FieldDefinition {
		t.Helper()
		got, err := h.schema.CreateField(h.ctx, in)
		if err != nil {
			t.Fatal(err)
		}
		return got
	}
	f.live = field(schema.CreateFieldInput{Key: "live_tag", Label: "Live tag", Type: model.FieldText, Searchable: true, CategoryIDs: []string{h.catID}})
	f.retired = field(schema.CreateFieldInput{Key: "retired_tag", Label: "Retired tag", Type: model.FieldText, Searchable: true, CategoryIDs: []string{h.catID}})
	selected := []string{f.live.ID, f.retired.ID}
	var err error
	f.middle, err = h.schema.CreateCategory(h.ctx, schema.CreateCategoryInput{Code: "MID", Name: "Middle", ParentID: &h.catID, InheritedFieldIDs: &selected})
	if err != nil {
		t.Fatal(err)
	}
	selected = []string{f.live.ID}
	f.leaf, err = h.schema.CreateCategory(h.ctx, schema.CreateCategoryInput{Code: "LEAF", Name: "Leaf", ParentID: &f.middle.ID, InheritedFieldIDs: &selected, PrintPresetIDs: []string{"preset-rt"}})
	if err != nil {
		t.Fatal(err)
	}
	vendor, err := h.schema.CreateVendor(h.ctx, "Consumer maker")
	if err != nil {
		t.Fatal(err)
	}
	f.vendor = field(schema.CreateFieldInput{Key: "vendor_tag", Label: "Vendor tag", Type: model.FieldText, VendorIDs: []string{vendor.ID}})
	for _, name := range []string{"Consumer One", "Consumer Two"} {
		m, err := h.schema.CreateModel(h.ctx, schema.CreateModelInput{Name: name, VendorID: vendor.ID})
		if err != nil {
			t.Fatal(err)
		}
		f.models = append(f.models, m)
		f.device = append(f.device, field(schema.CreateFieldInput{Key: "device_tag", Label: name + " tag", Type: model.FieldText, Searchable: true, ModelIDs: []string{m.ID}}))
	}
	save := func(categoryID string, modelID *string, attrs map[string]any) {
		t.Helper()
		a, err := h.assets.Save(h.ctx, asset.SaveInput{CategoryID: categoryID, ModelID: modelID, Status: model.StatusInStock, OwnerID: h.userID, ActorID: h.userID, Holder: model.Holder{Type: model.HolderTypeEntity, ID: h.locID}, Attrs: attrs})
		if err != nil {
			t.Fatal(err)
		}
		f.assets = append(f.assets, a)
	}
	save(h.catID, nil, map[string]any{"mac": "001A2B3C4D01", "live_tag": "shared-live"})
	save(f.middle.ID, nil, map[string]any{"live_tag": "shared-live", "retired_tag": "archived-token"})
	for i, m := range f.models {
		save(f.leaf.ID, &m.ID, map[string]any{"live_tag": "shared-live", "device_tag": fmt.Sprintf("device-%d", i), "vendor_tag": "maker-value"})
	}
	// Historical attrs stay on disk even though the leaf no longer selects the
	// parent's definition. This is fixture data, not an alternate resolver.
	if err := h.db.Write(h.ctx, func(ctx context.Context, tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `UPDATE assets SET attrs=json_set(attrs,'$.retired_tag','archived-token') WHERE category_id=?`, f.leaf.ID)
		return err
	}); err != nil {
		t.Fatal(err)
	}
	return f
}

func TestInheritanceConsumersShareOneEffectiveSet(t *testing.T) {
	f := newInheritanceConsumersFixture(t)
	for _, lang := range []string{"zh", "en"} {
		t.Run(lang, func(t *testing.T) {
			f.checkSchemaAndDetail(t, lang)
			f.checkSearchAndCounts(t, lang)
			f.checkTemplateAndImport(t, lang)
			f.checkRowsExportAndPrint(t, lang)
		})
	}
}

func (f inheritanceConsumersFixture) get(t *testing.T, lang, path string) *httptest.ResponseRecorder {
	t.Helper()
	rec := f.h.doLang(t, lang, http.MethodGet, path, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("GET %s: %d %s", path, rec.Code, rec.Body.String())
	}
	return rec
}

func (f inheritanceConsumersFixture) checkSchemaAndDetail(t *testing.T, lang string) {
	t.Helper()
	for i, m := range f.models {
		view := decode[struct {
			Fields []model.BoundField `json:"fields"`
		}](t, f.get(t, lang, "/api/categories/"+f.leaf.ID+"/schema?model_id="+m.ID))
		var ids []string
		for _, fd := range view.Fields {
			ids = append(ids, fd.ID)
		}
		want := []string{f.live.ID, f.vendor.ID, f.device[i].ID}
		slices.Sort(ids)
		slices.Sort(want)
		if !reflect.DeepEqual(ids, want) {
			t.Fatalf("model %s effective IDs=%v want=%v", m.ID, ids, want)
		}
		detail := decode[struct {
			Asset model.Asset `json:"asset"`
		}](t, f.get(t, lang, "/api/assets/"+f.assets[i+2].ID)).Asset
		if len(detail.Attrs) != 3 || detail.Attrs["live_tag"] != "shared-live" || detail.Attrs["device_tag"] != fmt.Sprintf("device-%d", i) || detail.Attrs["vendor_tag"] != "maker-value" {
			t.Fatalf("live detail=%+v", detail.Attrs)
		}
		if len(detail.ArchivedAttrs) != 1 || detail.ArchivedAttrs["retired_tag"] != "archived-token" {
			t.Fatalf("archived detail=%+v", detail.ArchivedAttrs)
		}
	}
}

func (f inheritanceConsumersFixture) checkSearchAndCounts(t *testing.T, lang string) {
	t.Helper()
	for _, tc := range []struct {
		query string
		ids   []string
	}{
		{"q=shared-live", []string{f.assets[0].ID, f.assets[1].ID, f.assets[2].ID, f.assets[3].ID}},
		{"q=archived-token", []string{f.assets[1].ID}},
		{"attr.retired_tag=archived-token", []string{f.assets[1].ID}},
		{"q=device-0", []string{f.assets[2].ID}},
	} {
		page := decode[assetListResponse](t, f.get(t, lang, "/api/assets?category_id="+f.h.catID+"&include_descendants=true&limit=50&"+tc.query))
		var got []string
		for _, a := range page.Items {
			got = append(got, a.ID)
		}
		slices.Sort(got)
		slices.Sort(tc.ids)
		if page.Total != len(tc.ids) || !reflect.DeepEqual(got, tc.ids) {
			t.Fatalf("%s total=%d ids=%v want=%v", tc.query, page.Total, got, tc.ids)
		}
	}
	for _, tc := range []struct {
		id    string
		count int
	}{{f.live.ID, 4}, {f.retired.ID, 2}, {f.vendor.ID, 2}, {f.device[0].ID, 1}, {f.device[1].ID, 1}} {
		got := decode[struct {
			Count int `json:"count"`
		}](t, f.get(t, lang, "/api/fields/"+tc.id+"/asset-count"))
		if got.Count != tc.count {
			t.Fatalf("field %s count=%d want=%d", tc.id, got.Count, tc.count)
		}
	}
}

func consumerCSV(t *testing.T, body string) [][]string {
	t.Helper()
	records, err := csv.NewReader(strings.NewReader(strings.TrimPrefix(body, "\ufeff"))).ReadAll()
	if err != nil {
		t.Fatal(err)
	}
	return records
}

func (f inheritanceConsumersFixture) checkTemplateAndImport(t *testing.T, lang string) {
	t.Helper()
	records := consumerCSV(t, f.get(t, lang, "/api/categories/"+f.leaf.ID+"/import-template.csv").Body.String())
	keys := records[1]
	for _, key := range []string{"live_tag", "device_tag", "vendor_tag"} {
		if count := len(slices.DeleteFunc(slices.Clone(keys), func(k string) bool { return k != key })); count != 1 {
			t.Fatalf("template key %s count=%d", key, count)
		}
	}
	if slices.Contains(keys, "retired_tag") || slices.Contains(keys, "mac") {
		t.Fatalf("template inherited unselected columns: %v", keys)
	}
	before := inheritanceHTTPState(t, f.h)
	var body bytes.Buffer
	form := multipart.NewWriter(&body)
	if err := form.WriteField("category_id", f.leaf.ID); err != nil {
		t.Fatal(err)
	}
	file, err := form.CreateFormFile("file", "consumers.csv")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := fmt.Fprint(file, "Model,Holder,Live,Device,Retired\nmodel,holder,live_tag,device_tag,retired_tag\nConsumer One,上海仓库,new,one,\nConsumer Two,上海仓库,new,two,\nConsumer One,上海仓库,new,one,archived-token\n,上海仓库,new,,\n"); err != nil {
		t.Fatal(err)
	}
	if err := form.Close(); err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodPost, "/api/import/preview", &body)
	req.Header.Set("Authorization", "Bearer "+f.h.token)
	req.Header.Set("Content-Type", form.FormDataContentType())
	req.Header.Set("Accept-Language", lang)
	rec := httptest.NewRecorder()
	f.h.router.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("preview=%d %s", rec.Code, rec.Body.String())
	}
	report := decode[importer.Report](t, rec)
	if report.Total != 4 || report.OK != 3 || report.Rows[0].Status != "ok" || report.Rows[1].Status != "ok" || report.Rows[2].Fields["retired_tag"] == "" || report.Rows[3].Status != "ok" {
		t.Fatalf("import report=%+v", report)
	}
	if inheritanceHTTPState(t, f.h) != before {
		t.Fatal("import preview changed shared fixture")
	}
}

func (f inheritanceConsumersFixture) checkRowsExportAndPrint(t *testing.T, lang string) {
	t.Helper()
	page := decode[rowPage](t, f.get(t, lang, "/api/rows?category_id="+f.leaf.ID))
	if page.Total != 2 || len(page.Rows) != 2 || slices.Contains(page.Columns, "retired_tag") || slices.Contains(page.Columns, "mac") {
		t.Fatalf("leaf rows=%+v", page)
	}
	for i, a := range f.assets[2:] {
		index := slices.IndexFunc(page.Rows, func(row map[string]string) bool { return row["sys_id"] == a.ID })
		if index < 0 {
			t.Fatalf("asset %s absent from rows", a.ID)
		}
		row := page.Rows[index]
		if len(row) != len(page.Columns) || row["live_tag"] != "shared-live" || row["device_tag"] != fmt.Sprintf("device-%d", i) || row["vendor_tag"] != "maker-value" {
			t.Fatalf("row=%+v", row)
		}
	}
	parent := decode[rowPage](t, f.get(t, lang, "/api/rows?category_id="+f.h.catID+"&include_descendants=true"))
	if parent.Total != 4 {
		t.Fatalf("parent rows total=%d", parent.Total)
	}
	for _, row := range parent.Rows {
		want := ""
		if row["sys_id"] == f.assets[1].ID {
			want = "archived-token"
		}
		if row["retired_tag"] != want {
			t.Fatalf("parent cell=%+v", row)
		}
	}
	records := consumerCSV(t, f.get(t, lang, "/api/export.csv?category_id="+f.leaf.ID).Body.String())
	if len(records) != 3 || slices.Contains(records[0], "Retired tag") {
		t.Fatalf("export=%v", records)
	}
	one := slices.Index(records[0], f.device[0].Label)
	two := slices.Index(records[0], f.device[1].Label)
	if one < 0 || two < 0 {
		t.Fatalf("export lost field identities: %v", records[0])
	}
	var cells []string
	for _, rec := range records[1:] {
		cells = append(cells, rec[one]+"/"+rec[two])
		if slices.Contains(rec, "archived-token") {
			t.Fatalf("archived value exported: %v", rec)
		}
	}
	slices.Sort(cells)
	if !reflect.DeepEqual(cells, []string{"/device-1", "device-0/"}) {
		t.Fatalf("export identity cells=%v", cells)
	}
	before := len(f.printer.requests)
	rec := f.h.doLang(t, lang, http.MethodPost, "/api/print", fmt.Sprintf(`{"ids":[%q,%q]}`, f.assets[2].ID, f.assets[3].ID))
	if rec.Code != http.StatusOK || len(f.printer.requests) != before+1 {
		t.Fatalf("print=%d %s", rec.Code, rec.Body.String())
	}
	printed := f.printer.requests[before]
	if !reflect.DeepEqual(printed.Columns, page.Columns) || len(printed.Rows) != len(page.Rows) {
		t.Fatalf("print differs from rows: %+v", printed)
	}
	for _, row := range printed.Rows {
		index := slices.IndexFunc(page.Rows, func(expected map[string]string) bool { return expected["sys_id"] == row["sys_id"] })
		if index < 0 || !reflect.DeepEqual(row, page.Rows[index]) {
			t.Fatalf("printed values differ from rows: %+v", row)
		}
	}
}
