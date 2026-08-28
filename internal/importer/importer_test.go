package importer

import (
	"context"
	"path/filepath"
	"strings"
	"testing"

	"github.com/klskk23/nexus-assets/internal/asset"
	"github.com/klskk23/nexus-assets/internal/auth"
	"github.com/klskk23/nexus-assets/internal/holder"
	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/schema"
	"github.com/klskk23/nexus-assets/internal/store"
)

type fixture struct {
	svc    *Service
	assets *asset.Service
	schema *schema.Store
	ctx    context.Context

	userID, locID, catID, modelName string
}

func newFixture(t *testing.T) *fixture {
	t.Helper()
	ctx := context.Background()

	db, err := store.Open(filepath.Join(t.TempDir(), "i.db"))
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
	as := asset.NewService(db, sch)

	u, err := us.Create(ctx, auth.CreateInput{
		Email: "admin@example.com", Name: "管理员", AuthType: model.AuthLocal, Password: "correct-horse",
	})
	if err != nil {
		t.Fatal(err)
	}
	loc, err := hs.Create(ctx, holder.CreateInput{Type: model.EntityLocation, Name: "上海仓库"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := hs.Create(ctx, holder.CreateInput{Type: model.EntityCompany, Name: "XX 集团"}); err != nil {
		t.Fatal(err)
	}

	cat, err := sch.CreateCategory(ctx, schema.CreateCategoryInput{
		Code: "RT", Name: "SDWAN 路由器",
	})
	if err != nil {
		t.Fatal(err)
	}
	mac, _ := sch.CreateField(ctx, schema.CreateFieldInput{
		Key: "mac", Label: "基准 MAC", Type: model.FieldMAC, IsUnique: true,
	})
	fw, _ := sch.CreateField(ctx, schema.CreateFieldInput{
		Key: "firmware", Label: "固件版本", Type: model.FieldText,
	})
	tag, _ := sch.CreateField(ctx, schema.CreateFieldInput{
		Key: "asset_tag", Label: "推导编号", Type: model.FieldComputed, IsUnique: true,
		Options: model.FieldOptions{Template: "{{ .attrs.mac | hex2dec }}"},
	})
	for _, f := range []struct {
		id       string
		required bool
		sort     int
	}{{mac.ID, true, 10}, {fw.ID, false, 20}, {tag.ID, false, 30}} {
		if err := sch.Bind(ctx, cat.ID, f.id, f.required, f.sort); err != nil {
			t.Fatal(err)
		}
	}
	displayKey := "asset_tag"
	if _, err := sch.UpdateCategory(ctx, cat.ID, schema.UpdateCategoryInput{DisplayKey: &displayKey}); err != nil {
		t.Fatal(err)
	}
	if _, err := sch.CreateModel(ctx, schema.CreateModelInput{
		CategoryID: cat.ID, Name: "SDWAN-X100", Vendor: "Acme",
	}); err != nil {
		t.Fatal(err)
	}

	return &fixture{
		svc: New(db, sch, hs, us, as), assets: as, schema: sch, ctx: ctx,
		userID: u.ID, locID: loc.ID, catID: cat.ID, modelName: "SDWAN-X100",
	}
}

func csvOf(rows ...string) *strings.Reader {
	head := "型号,持有方（位置名称）,备注,基准 MAC（必填）,固件版本\nmodel,holder,note,mac,firmware\n"
	return strings.NewReader(head + strings.Join(rows, "\n") + "\n")
}

func (f *fixture) count(t *testing.T) int {
	t.Helper()
	res, err := f.assets.List(f.ctx, asset.ListFilter{Limit: 200})
	if err != nil {
		t.Fatal(err)
	}
	return res.Total
}

// The key row must match the category's effective field set, minus computed
// columns, which are derived rather than supplied.
func TestTemplateKeyRowMatchesTheEffectiveFieldSet(t *testing.T) {
	f := newFixture(t)

	keys, labels, err := f.svc.Columns(f.ctx, f.catID)
	if err != nil {
		t.Fatalf("columns: %v", err)
	}
	want := []string{ColModel, ColHolder, ColNote, "mac", "firmware"}
	if strings.Join(keys, ",") != strings.Join(want, ",") {
		t.Errorf("keys = %v, want %v", keys, want)
	}
	for _, k := range keys {
		if k == "asset_tag" {
			t.Error("a computed field must not get a column; filling it in would be silently ignored")
		}
	}
	if !strings.Contains(labels[3], "必填") {
		t.Errorf("a required field should say so in the label, got %q", labels[3])
	}

	body, err := f.svc.Template(f.ctx, f.catID)
	if err != nil {
		t.Fatal(err)
	}
	text := string(body)
	if !strings.HasPrefix(text, bom) {
		t.Error("Excel needs the BOM to read the file as UTF-8")
	}
	lines := strings.Split(strings.TrimSpace(strings.TrimPrefix(text, bom)), "\n")
	if len(lines) != 2 {
		t.Fatalf("the template is two header rows, got %d", len(lines))
	}
	if !strings.Contains(lines[0], "基准 MAC") {
		t.Errorf("first row is for the person filling it in: %q", lines[0])
	}
	if !strings.Contains(lines[1], "mac") {
		t.Errorf("second row is the machine key: %q", lines[1])
	}
}

func TestPreviewReportsPerRowErrorsAndWritesNothing(t *testing.T) {
	f := newFixture(t)

	file := csvOf(
		"SDWAN-X100,上海仓库,,00:1A:2B:3C:4D:5E,2.1.3", // fine
		"SDWAN-X100,上海仓库,,not-a-mac,2.1.3",         // bad MAC
		"SDWAN-X100,上海仓库,,,2.1.3",                  // missing required MAC
	)
	report, err := f.svc.Preview(f.ctx, f.catID, f.userID, file)
	if err != nil {
		t.Fatalf("preview: %v", err)
	}
	if report.Total != 3 || report.OK != 1 {
		t.Fatalf("total/ok = %d/%d, want 3/1", report.Total, report.OK)
	}
	// Line numbers count the two header rows, matching what the person sees.
	if report.Rows[0].Line != 3 || report.Rows[1].Line != 4 {
		t.Errorf("line numbers should match the spreadsheet: %+v", report.Rows)
	}
	if report.Rows[1].Fields["mac"] == "" {
		t.Errorf("the bad MAC row should name the field: %+v", report.Rows[1])
	}
	if report.Rows[2].Fields["mac"] == "" {
		t.Errorf("the missing required row should name the field: %+v", report.Rows[2])
	}
	if report.Rows[0].Display != "112394521950" {
		t.Errorf("a passing row should preview its generated number, got %q", report.Rows[0].Display)
	}
	if n := f.count(t); n != 0 {
		t.Errorf("a preview must write nothing, found %d assets", n)
	}
}

// The pair is only visible because every row goes through the same transaction.
func TestDuplicateMACWithinTheFileIsCaught(t *testing.T) {
	f := newFixture(t)

	file := csvOf(
		"SDWAN-X100,上海仓库,,001A2B3C4D5E,2.1.3",
		"SDWAN-X100,上海仓库,,00:1a:2b:3c:4d:5e,2.2.0", // the same card, written differently
	)
	report, err := f.svc.Preview(f.ctx, f.catID, f.userID, file)
	if err != nil {
		t.Fatalf("preview: %v", err)
	}
	if report.OK != 1 {
		t.Fatalf("only the first occurrence may pass, ok = %d: %+v", report.OK, report.Rows)
	}
	second := report.Rows[1]
	if second.Status != "error" {
		t.Fatalf("the repeat must be rejected: %+v", second)
	}
	if second.Fields["mac"] == "" && second.Fields["sn"] == "" {
		t.Errorf("the conflict should name mac or sn: %+v", second.Fields)
	}
}

func TestUnknownModelOrHolderErrorsInsteadOfBeingCreated(t *testing.T) {
	f := newFixture(t)

	file := csvOf(
		"幽灵型号,上海仓库,,001A2B3C4D01,",
		"SDWAN-X100,不存在的仓库,,001A2B3C4D02,",
		"SDWAN-X100,XX 集团,,001A2B3C4D03,", // a company, not a location
	)
	report, err := f.svc.Preview(f.ctx, f.catID, f.userID, file)
	if err != nil {
		t.Fatalf("preview: %v", err)
	}
	if report.OK != 0 {
		t.Fatalf("none of these rows may pass: %+v", report.Rows)
	}
	if !strings.Contains(report.Rows[0].Fields[ColModel], "找不到型号") {
		t.Errorf("row 1 should report the missing model: %+v", report.Rows[0].Fields)
	}
	if !strings.Contains(report.Rows[1].Fields[ColHolder], "找不到持有方") {
		t.Errorf("row 2 should report the missing location: %+v", report.Rows[1].Fields)
	}
	if !strings.Contains(report.Rows[2].Fields[ColHolder], "不是位置") {
		t.Errorf("row 3 should reject a company as an in-stock holder: %+v", report.Rows[2].Fields)
	}

	models, _ := f.schema.ListModels(f.ctx)
	if len(models) != 1 {
		t.Error("an import must never invent reference data")
	}
}

func TestCommitIsAllOrNothing(t *testing.T) {
	f := newFixture(t)

	bad := csvOf(
		"SDWAN-X100,上海仓库,,001A2B3C4D01,",
		"SDWAN-X100,上海仓库,,not-a-mac,",
		"SDWAN-X100,上海仓库,,001A2B3C4D03,",
	)
	if _, err := f.svc.Commit(f.ctx, f.catID, f.userID, bad); err == nil {
		t.Fatal("a file with a bad row must not commit")
	}
	if n := f.count(t); n != 0 {
		t.Fatalf("nothing may be written when one row fails, found %d", n)
	}

	good := csvOf(
		"SDWAN-X100,上海仓库,首批,001A2B3C4D01,2.1.3",
		"SDWAN-X100,上海仓库,首批,001A2B3C4D02,2.1.3",
		",上海仓库,,001A2B3C4D03,",
	)
	res, err := f.svc.Commit(f.ctx, f.catID, f.userID, good)
	if err != nil {
		t.Fatalf("commit: %v", err)
	}
	if res.Created != 3 {
		t.Fatalf("created = %d, want 3", res.Created)
	}
	if n := f.count(t); n != 3 {
		t.Errorf("stored %d assets, want 3", n)
	}
}

// "Which devices came in with that file" has to stay answerable.
func TestCommitGroupsEveryRowUnderOneBatch(t *testing.T) {
	f := newFixture(t)
	res, err := f.svc.Commit(f.ctx, f.catID, f.userID, csvOf(
		"SDWAN-X100,上海仓库,,001A2B3C4D01,",
		"SDWAN-X100,上海仓库,,001A2B3C4D02,",
	))
	if err != nil {
		t.Fatalf("commit: %v", err)
	}

	var n int
	if err := f.svc.db.ReadDB().QueryRowContext(f.ctx,
		`SELECT count(*) FROM asset_transfers WHERE batch_id = ? AND kind = 'create'`,
		res.BatchID).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 2 {
		t.Errorf("%d create events share the batch id, want 2", n)
	}
}

func TestComputedColumnsAreDerivedNotImported(t *testing.T) {
	f := newFixture(t)
	if _, err := f.svc.Commit(f.ctx, f.catID, f.userID,
		csvOf("SDWAN-X100,上海仓库,,001A2B3C4D5E,2.1.3")); err != nil {
		t.Fatalf("commit: %v", err)
	}
	res, err := f.assets.List(f.ctx, asset.ListFilter{Limit: 10})
	if err != nil {
		t.Fatal(err)
	}
	if got := res.Items[0].Attrs["asset_tag"]; got != "112394521950" {
		t.Errorf("the computed column should be derived on import, got %v", got)
	}
}

func TestEmptyAndMalformedFilesAreRejected(t *testing.T) {
	f := newFixture(t)
	if _, err := f.svc.Preview(f.ctx, f.catID, f.userID, strings.NewReader("")); err == nil {
		t.Error("an empty file must be rejected")
	}
	if _, err := f.svc.Preview(f.ctx, f.catID, f.userID, strings.NewReader("只有一行\n")); err == nil {
		t.Error("a file with one header row must be rejected")
	}
	if _, err := f.svc.Preview(f.ctx, f.catID, f.userID, csvOf()); err == nil {
		t.Error("a file with headers but no data must be rejected")
	}
}

func TestExportHonoursTheFilter(t *testing.T) {
	f := newFixture(t)
	if _, err := f.svc.Commit(f.ctx, f.catID, f.userID, csvOf(
		"SDWAN-X100,上海仓库,,001A2B3C4D01,2.1.3",
		"SDWAN-X100,上海仓库,,001A2B3C4D02,2.2.0",
		"SDWAN-X100,上海仓库,,001A2B3C4D03,2.1.3",
	)); err != nil {
		t.Fatalf("seed: %v", err)
	}

	all, err := f.svc.Export(f.ctx, asset.ListFilter{CategoryID: f.catID, IncludeDescendants: true})
	if err != nil {
		t.Fatalf("export: %v", err)
	}
	lines := strings.Split(strings.TrimSpace(strings.TrimPrefix(string(all), bom)), "\n")
	if len(lines) != 4 {
		t.Fatalf("header plus three rows, got %d", len(lines))
	}
	if !strings.Contains(lines[0], "固件版本") {
		t.Errorf("a filtered category should contribute its own columns: %q", lines[0])
	}

	filtered, err := f.svc.Export(f.ctx, asset.ListFilter{
		CategoryID: f.catID, IncludeDescendants: true,
		AttrFilters: map[string]string{"firmware": "2.2.0"},
	})
	if err != nil {
		t.Fatal(err)
	}
	lines = strings.Split(strings.TrimSpace(strings.TrimPrefix(string(filtered), bom)), "\n")
	if len(lines) != 2 {
		t.Fatalf("the filter should narrow the export to one row, got %d lines", len(lines))
	}
	if !strings.Contains(lines[1], "2.2.0") {
		t.Errorf("wrong row exported: %q", lines[1])
	}
}
