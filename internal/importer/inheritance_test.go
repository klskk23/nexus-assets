package importer

import (
	"context"
	"database/sql"
	"encoding/csv"
	"strings"
	"testing"

	"github.com/klskk23/nexus-assets/internal/asset"
	"github.com/klskk23/nexus-assets/internal/i18n"
	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/schema"
)

func saveConsumerAsset(t *testing.T, f *fixture, categoryID string, modelID *string, attrs map[string]any) model.Asset {
	t.Helper()
	a, err := f.assets.Save(f.ctx, asset.SaveInput{CategoryID: categoryID, ModelID: modelID, Status: model.StatusInStock, OwnerID: f.userID, ActorID: f.userID, Holder: model.Holder{Type: model.HolderTypeEntity, ID: f.locID}, Attrs: attrs})
	if err != nil {
		t.Fatal(err)
	}
	return a
}

func TestInheritanceOutputParentColumnsLeaveUnselectedDescendantEmpty(t *testing.T) {
	f := newFixture(t)
	child, err := f.schema.CreateCategory(f.ctx, schema.CreateCategoryInput{Code: "CH", Name: "Child", ParentID: &f.catID})
	if err != nil {
		t.Fatal(err)
	}
	parent := saveConsumerAsset(t, f, f.catID, nil, map[string]any{"mac": "001A2B3C4D5E", "firmware": "live"})
	archived := saveConsumerAsset(t, f, child.ID, nil, map[string]any{})
	if err = f.svc.db.Write(f.ctx, func(ctx context.Context, tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `UPDATE assets SET attrs=json_set(attrs,'$.firmware','archived') WHERE id=?`, archived.ID)
		return err
	}); err != nil {
		t.Fatal(err)
	}
	filter := asset.ListFilter{CategoryID: f.catID, IncludeDescendants: true}
	page, err := f.svc.Rows(f.ctx, i18n.EN, filter)
	if err != nil {
		t.Fatal(err)
	}
	for _, row := range page.Rows {
		want := ""
		if row["sys_id"] == parent.ID {
			want = "live"
		}
		if row["firmware"] != want {
			t.Errorf("rows asset=%s firmware=%q want=%q", row["sys_id"], row["firmware"], want)
		}
	}
	body, err := f.svc.Export(f.ctx, i18n.EN, filter, []string{"firmware"})
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(body), "archived") {
		t.Errorf("export leaked archived value: %s", body)
	}
	files, err := f.svc.ExportSelected(f.ctx, i18n.EN, []string{parent.ID, archived.ID})
	if err != nil || len(files) != 2 {
		t.Fatalf("split export=%+v err=%v", files, err)
	}
	for _, file := range files {
		if file.CategoryID == child.ID && strings.Contains(string(file.Body), "固件版本") {
			t.Errorf("child export inherited a parent column: %s", file.Body)
		}
	}
	keys, _, err := f.svc.Columns(f.ctx, i18n.EN, child.ID)
	if err != nil {
		t.Fatal(err)
	}
	for _, key := range keys {
		if key == "firmware" {
			t.Error("template contains unselected parent field")
		}
	}
	report, err := f.svc.Preview(f.ctx, i18n.EN, child.ID, f.userID, strings.NewReader("Holder,Firmware\nholder,firmware\n上海仓库,archived\n"))
	if err != nil || report.OK != 0 || len(report.Rows) != 1 || report.Rows[0].Fields["firmware"] == "" {
		t.Fatalf("inapplicable import=%+v err=%v", report, err)
	}
}

func TestInheritanceImportResolvesSameKeyPerRowsModel(t *testing.T) {
	f := newFixture(t)
	for _, name := range []string{"One", "Two"} {
		m, err := f.schema.CreateModel(f.ctx, schema.CreateModelInput{Name: name})
		if err != nil {
			t.Fatal(err)
		}
		if _, err := f.schema.CreateField(f.ctx, schema.CreateFieldInput{Key: "device_tag", Label: name + " tag", Type: model.FieldText, ModelIDs: []string{m.ID}}); err != nil {
			t.Fatal(err)
		}
	}
	file := "Model,Holder,MAC,Tag\nmodel,holder,mac,device_tag\n" +
		"One,上海仓库,001A2B3C4D01,one-value\n" +
		"Two,上海仓库,001A2B3C4D02,two-value\n" +
		",上海仓库,001A2B3C4D03,not-applicable\n" +
		",上海仓库,001A2B3C4D04,\n"
	for _, lang := range []i18n.Lang{i18n.ZH, i18n.EN} {
		report, err := f.svc.Preview(f.ctx, lang, f.catID, f.userID, strings.NewReader(file))
		if err != nil {
			t.Fatal(err)
		}
		if report.Total != 4 || report.OK != 3 || report.Rows[0].Status != "ok" || report.Rows[1].Status != "ok" || report.Rows[2].Fields["device_tag"] == "" || report.Rows[3].Status != "ok" {
			t.Fatalf("model-specific import=%+v", report)
		}
		if count := f.count(t); count != 0 {
			t.Fatalf("preview persisted %d assets", count)
		}
	}
}

func TestInheritanceOutputSameKeyModelIdentitiesDoNotOverwriteCells(t *testing.T) {
	f := newFixture(t)
	var ids []string
	for _, name := range []string{"One", "Two"} {
		m, err := f.schema.CreateModel(f.ctx, schema.CreateModelInput{Name: name})
		if err != nil {
			t.Fatal(err)
		}
		ids = append(ids, m.ID)
		if _, err = f.schema.CreateField(f.ctx, schema.CreateFieldInput{Key: "device_tag", Label: name + " tag", Type: model.FieldText, ModelIDs: []string{m.ID}}); err != nil {
			t.Fatal(err)
		}
	}
	a := saveConsumerAsset(t, f, f.catID, &ids[0], map[string]any{"mac": "001A2B3C4D5E", "device_tag": "one-value"})
	b := saveConsumerAsset(t, f, f.catID, &ids[1], map[string]any{"mac": "001A2B3C4D5F", "device_tag": "two-value"})
	page, err := f.svc.Rows(f.ctx, i18n.EN, asset.ListFilter{CategoryID: f.catID})
	if err != nil {
		t.Fatal(err)
	}
	count := 0
	for _, key := range page.Columns {
		if key == "device_tag" {
			count++
		}
	}
	if count != 1 {
		t.Errorf("duplicate tabular key count=%d", count)
	}
	for _, row := range page.Rows {
		want := map[string]string{a.ID: "one-value", b.ID: "two-value"}[row["sys_id"]]
		if row["device_tag"] != want {
			t.Errorf("device cell=%q want=%q", row["device_tag"], want)
		}
	}
	keys, _, err := f.svc.Columns(f.ctx, i18n.EN, f.catID)
	if err != nil {
		t.Fatal(err)
	}
	count = 0
	for _, key := range keys {
		if key == "device_tag" {
			count++
		}
	}
	if count != 1 {
		t.Errorf("duplicate template key count=%d", count)
	}
	body, err := f.svc.Export(f.ctx, i18n.EN, asset.ListFilter{CategoryID: f.catID}, []string{"device_tag"})
	if err != nil {
		t.Fatal(err)
	}
	records, err := csv.NewReader(strings.NewReader(strings.TrimPrefix(string(body), bom))).ReadAll()
	if err != nil {
		t.Fatal(err)
	}
	if len(records[0]) != 11 {
		t.Fatalf("CSV retains separate definition labels, got %v", records[0])
	}
	for _, rec := range records[1:] {
		if (rec[9] == "") == (rec[10] == "") {
			t.Errorf("CSV identity cells not isolated: %v", rec)
		}
	}
}
