package importer

import (
	"context"
	"errors"
	"fmt"
	"path/filepath"
	"strings"
	"testing"

	"github.com/klskk23/nexus-assets/internal/asset"
	"github.com/klskk23/nexus-assets/internal/auth"
	"github.com/klskk23/nexus-assets/internal/holder"
	"github.com/klskk23/nexus-assets/internal/i18n"
	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/schema"
	"github.com/klskk23/nexus-assets/internal/store"
)

type fixture struct {
	svc     *Service
	assets  *asset.Service
	schema  *schema.Store
	holders *holder.Store
	ctx     context.Context

	userID, locID, catID, modelName string
}

func newFixture(t *testing.T) *fixture {
	t.Helper()
	ctx := context.Background()

	db, err := store.Open(filepath.Join(t.TempDir(), "i.db"))
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
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
	// With a note of its own, so a test can tell the two notes apart.
	loc, err := hs.Create(ctx, holder.CreateInput{
		Type: model.EntityLocation, Name: "上海仓库", Note: "货架 A1-A9",
	})
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
		Options: model.FieldOptions{Template: "hex2dec(attrs.mac)"},
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
		CategoryIDs: []string{cat.ID}, Name: "SDWAN-X100", Vendor: "Acme",
	}); err != nil {
		t.Fatal(err)
	}

	return &fixture{
		svc: New(db, sch, hs, us, as), assets: as, schema: sch, holders: hs, ctx: ctx,
		userID: u.ID, locID: loc.ID, catID: cat.ID, modelName: "SDWAN-X100",
	}
}

func csvOf(rows ...string) *strings.Reader {
	// Deliberately without the vendor column: this is the sheet an older
	// template produced, and it has to keep importing. The column is optional,
	// and most sheets never need it.
	head := "型号,持有方（名称）,设备备注,基准 MAC（必填）,固件版本\nmodel,holder,note,mac,firmware\n"
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

	keys, labels, err := f.svc.Columns(f.ctx, i18n.ZH, f.catID)
	if err != nil {
		t.Fatalf("columns: %v", err)
	}
	want := []string{ColModel, ColVendor, ColHolder, ColNote, "mac", "firmware"}
	if strings.Join(keys, ",") != strings.Join(want, ",") {
		t.Errorf("keys = %v, want %v", keys, want)
	}
	for _, k := range keys {
		if k == "asset_tag" {
			t.Error("a computed field must not get a column; filling it in would be silently ignored")
		}
	}
	// The first field column, past the four fixed ones.
	if !strings.Contains(labels[4], "必填") {
		t.Errorf("a required field should say so in the label, got %q", labels[4])
	}

	body, err := f.svc.Template(f.ctx, i18n.ZH, f.catID)
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
	report, err := f.svc.Preview(f.ctx, i18n.ZH, f.catID, f.userID, file)
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
	report, err := f.svc.Preview(f.ctx, i18n.ZH, f.catID, f.userID, file)
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
		"SDWAN-X100,XX 集团,,001A2B3C4D03,", // a company, which is now fine
	)
	report, err := f.svc.Preview(f.ctx, i18n.ZH, f.catID, f.userID, file)
	if err != nil {
		t.Fatalf("preview: %v", err)
	}
	if !strings.Contains(report.Rows[0].Fields[ColModel], "找不到型号") {
		t.Errorf("row 1 should report the missing model: %+v", report.Rows[0].Fields)
	}
	if !strings.Contains(report.Rows[1].Fields[ColHolder], "找不到持有方") {
		t.Errorf("row 2 should report the missing holder: %+v", report.Rows[1].Fields)
	}
	// A company is a perfectly good holder. The import used to refuse it,
	// which was the same rule the status column carried in a second place --
	// so the import disagreed with the transfer dialog.
	if report.Rows[2].Status != "ok" {
		t.Errorf("a company is a valid holder: %+v", report.Rows[2].Fields)
	}
	if report.OK != 1 {
		t.Errorf("only the two unresolvable rows may fail: %+v", report.Rows)
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
	if _, err := f.svc.Commit(f.ctx, i18n.ZH, f.catID, f.userID, bad); err == nil {
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
	res, err := f.svc.Commit(f.ctx, i18n.ZH, f.catID, f.userID, good)
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
	res, err := f.svc.Commit(f.ctx, i18n.ZH, f.catID, f.userID, csvOf(
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
	if _, err := f.svc.Commit(f.ctx, i18n.ZH, f.catID, f.userID,
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
	if _, err := f.svc.Preview(f.ctx, i18n.ZH, f.catID, f.userID, strings.NewReader("")); err == nil {
		t.Error("an empty file must be rejected")
	}
	if _, err := f.svc.Preview(f.ctx, i18n.ZH, f.catID, f.userID, strings.NewReader("只有一行\n")); err == nil {
		t.Error("a file with one header row must be rejected")
	}
	if _, err := f.svc.Preview(f.ctx, i18n.ZH, f.catID, f.userID, csvOf()); err == nil {
		t.Error("a file with headers but no data must be rejected")
	}
}

func TestExportHonoursTheFilter(t *testing.T) {
	f := newFixture(t)
	if _, err := f.svc.Commit(f.ctx, i18n.ZH, f.catID, f.userID, csvOf(
		"SDWAN-X100,上海仓库,,001A2B3C4D01,2.1.3",
		"SDWAN-X100,上海仓库,,001A2B3C4D02,2.2.0",
		"SDWAN-X100,上海仓库,,001A2B3C4D03,2.1.3",
	)); err != nil {
		t.Fatalf("seed: %v", err)
	}

	all, err := f.svc.Export(f.ctx, i18n.ZH, asset.ListFilter{CategoryID: f.catID, IncludeDescendants: true}, nil)
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

	filtered, err := f.svc.Export(f.ctx, i18n.ZH, asset.ListFilter{
		CategoryID: f.catID, IncludeDescendants: true,
		AttrFilters: map[string]string{"firmware": "2.2.0"},
	}, nil)
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

// TestExportNeedsACategoryAndChoosesColumns pins the two rules that make the
// file worth opening: which devices, and which of their fields.
func TestExportNeedsACategoryAndChoosesColumns(t *testing.T) {
	f := newFixture(t)
	if _, err := f.svc.Commit(f.ctx, i18n.ZH, f.catID, f.userID, csvOf(
		"SDWAN-X100,上海仓库,,001A2B3C4D01,2.1.3",
	)); err != nil {
		t.Fatalf("seed: %v", err)
	}

	// Without one the columns would be six fixed ones and nothing that tells
	// two devices apart, so it is refused rather than half-answered.
	if _, err := f.svc.Export(f.ctx, i18n.ZH, asset.ListFilter{}, nil); !errors.Is(err, ErrExportNeedsCategory) {
		t.Fatalf("an export with no category should be refused, got %v", err)
	}

	filter := asset.ListFilter{CategoryID: f.catID, IncludeDescendants: true}
	// An empty list is not the same as no list: it asks for the fixed columns
	// alone, and a nil list would have handed back every field.
	bare, err := f.svc.Export(f.ctx, i18n.ZH, filter, []string{})
	if err != nil {
		t.Fatalf("export: %v", err)
	}
	if strings.Contains(firstLineOf(bare), "固件版本") {
		t.Errorf("no field was asked for, yet one was exported: %q", firstLineOf(bare))
	}

	picked, err := f.svc.Export(f.ctx, i18n.ZH, filter, []string{"firmware"})
	if err != nil {
		t.Fatalf("export: %v", err)
	}
	head := firstLineOf(picked)
	if !strings.Contains(head, "固件版本") {
		t.Errorf("the chosen field is missing: %q", head)
	}
	if strings.Contains(head, "基准 MAC") {
		t.Errorf("a field nobody asked for was exported: %q", head)
	}
}

func firstLineOf(body []byte) string {
	return strings.SplitN(strings.TrimPrefix(string(body), bom), "\n", 2)[0]
}

// TestImportedNoteLandsOnTheDevice pins whose note the template's note column
// is. It sits directly under "持有方（名称）" on the sheet and was read as the
// holder's; before that it went on the create event, where it could be seen
// once in the timeline and never found again. It is the device's own note.
func TestImportedNoteLandsOnTheDevice(t *testing.T) {
	f := newFixture(t)

	if _, err := f.svc.Commit(f.ctx, i18n.ZH, f.catID, f.userID, csvOf(
		"SDWAN-X100,上海仓库,到货时外壳有凹痕,001A2B3C9001,2.2.1",
		"SDWAN-X100,上海仓库,,001A2B3C9002,2.2.0",
	)); err != nil {
		t.Fatalf("commit: %v", err)
	}

	res, err := f.assets.List(f.ctx, asset.ListFilter{Limit: 10})
	if err != nil {
		t.Fatal(err)
	}
	byMAC := map[string]string{}
	for _, a := range res.Items {
		byMAC[fmt.Sprintf("%v", a.Attrs["mac"])] = a.Note
	}
	if got := byMAC["001A2B3C9001"]; got != "到货时外壳有凹痕" {
		t.Errorf("the note should be on the device it was written beside, got %q", got)
	}
	// Per row, not per file: an empty cell leaves that device without one.
	if got := byMAC["001A2B3C9002"]; got != "" {
		t.Errorf("a blank note cell should leave the note empty, got %q", got)
	}

	// And the holder keeps its own note, which is a different thing entirely.
	loc, err := f.holders.Get(f.ctx, f.locID)
	if err != nil {
		t.Fatal(err)
	}
	if loc.Note != "货架 A1-A9" {
		t.Errorf("the import wrote to the holder's note: %q", loc.Note)
	}
}

// TestExportAndRowsCarryTheModelAndItsVendor pins what identifies a device in
// both tabular views. The model was missing from the export altogether -- the
// import template could name one and the export could not give it back -- and
// the row view named the model without saying who makes it, which is not an
// answer when two suppliers both sell an "X100".
func TestExportAndRowsCarryTheModelAndItsVendor(t *testing.T) {
	f := newFixture(t)
	if _, err := f.svc.Commit(f.ctx, i18n.ZH, f.catID, f.userID, csvOf(
		"SDWAN-X100,上海仓库,,001A2B3C9101,2.2.1",
	)); err != nil {
		t.Fatalf("commit: %v", err)
	}

	filter := asset.ListFilter{CategoryID: f.catID, IncludeDescendants: true}
	body, err := f.svc.Export(f.ctx, i18n.ZH, filter, nil)
	if err != nil {
		t.Fatalf("export: %v", err)
	}
	head, first := firstLineOf(body), strings.Split(strings.TrimPrefix(string(body), bom), "\n")[1]
	for _, want := range []string{"型号", "厂商"} {
		if !strings.Contains(head, want) {
			t.Errorf("the export header is missing %q: %q", want, head)
		}
	}
	if !strings.Contains(first, "SDWAN-X100") || !strings.Contains(first, "Acme") {
		t.Errorf("the row should name the model and its vendor: %q", first)
	}

	page, err := f.svc.Rows(f.ctx, i18n.ZH, filter)
	if err != nil {
		t.Fatalf("rows: %v", err)
	}
	if got := page.Rows[0][SysPrefix+"model"]; got != "SDWAN-X100" {
		t.Errorf("sys_model = %q", got)
	}
	if got := page.Rows[0][SysPrefix+"vendor"]; got != "Acme" {
		t.Errorf("sys_vendor = %q, want Acme -- this is what a label prints beside the model", got)
	}
}

// csvWithVendor is the sheet the current template produces.
func csvWithVendor(rows ...string) *strings.Reader {
	head := "型号,厂商,持有方（名称）,设备备注,基准 MAC（必填）,固件版本\n" +
		"model,vendor,holder,note,mac,firmware\n"
	return strings.NewReader(head + strings.Join(rows, "\n") + "\n")
}

// TestVendorColumnSettlesModelsThatShareAName covers what the column is for.
// Two suppliers with a product called X100 used to be a dead end: the row named
// the model, the name matched twice, and the import refused it with no way to
// say which one was meant.
func TestVendorColumnSettlesModelsThatShareAName(t *testing.T) {
	f := newFixture(t)

	// A second X100, from someone else, reachable from the same category.
	if _, err := f.schema.CreateModel(f.ctx, schema.CreateModelInput{
		Name: "SDWAN-X100", Vendor: "Beta", CategoryIDs: []string{f.catID},
	}); err != nil {
		t.Fatalf("create model: %v", err)
	}

	// Without the column, the name alone is not an answer -- and the refusal
	// says where to give one.
	report, err := f.svc.Preview(f.ctx, i18n.ZH, f.catID, f.userID, csvOf(
		"SDWAN-X100,上海仓库,,001A2B3C9201,2.1.3",
	))
	if err != nil {
		t.Fatalf("preview: %v", err)
	}
	if report.Rows[0].Fields[ColModel] == "" || !strings.Contains(report.Rows[0].Fields[ColModel], "厂商") {
		t.Errorf("the refusal should point at the vendor column, got %q", report.Rows[0].Fields[ColModel])
	}

	// With it, each row lands on the model it names.
	if _, err := f.svc.Commit(f.ctx, i18n.ZH, f.catID, f.userID, csvWithVendor(
		"SDWAN-X100,Acme,上海仓库,,001A2B3C9201,2.1.3",
		"SDWAN-X100,Beta,上海仓库,,001A2B3C9202,2.1.3",
	)); err != nil {
		t.Fatalf("commit: %v", err)
	}

	page, err := f.svc.Rows(f.ctx, i18n.ZH, asset.ListFilter{CategoryID: f.catID, IncludeDescendants: true})
	if err != nil {
		t.Fatal(err)
	}
	byMAC := map[string]string{}
	for _, r := range page.Rows {
		byMAC[r["mac"]] = r[SysPrefix+"vendor"]
	}
	if byMAC["001A2B3C9201"] != "Acme" || byMAC["001A2B3C9202"] != "Beta" {
		t.Errorf("each row should land on its own vendor's model, got %v", byMAC)
	}

	// A vendor that has no such model is a miss, not a fallback to the other
	// one: importing under the wrong supplier is worse than refusing.
	report, err = f.svc.Preview(f.ctx, i18n.ZH, f.catID, f.userID, csvWithVendor(
		"SDWAN-X100,Gamma,上海仓库,,001A2B3C9203,2.1.3",
	))
	if err != nil {
		t.Fatalf("preview: %v", err)
	}
	if report.Rows[0].Fields[ColModel] == "" {
		t.Error("an unknown vendor should be refused rather than resolved to somebody else's model")
	}
}

// A model-bound column filled in for a model it does not belong to is refused
// on the row, not dropped from it (015, decision 102). Whoever typed the value
// meant it; the likely mistake is the model column, and silently discarding
// the value would hide which of the two is wrong.
func TestPreviewRefusesAValueThatDoesNotBelongToTheRowsModel(t *testing.T) {
	f := newFixture(t)

	// A second model in the same category, with a field of its own.
	dell, err := f.schema.CreateModel(f.ctx, schema.CreateModelInput{
		CategoryIDs: []string{f.catID}, Name: "Latitude 5420", Vendor: "Dell",
	})
	if err != nil {
		t.Fatal(err)
	}
	tag, _ := f.schema.CreateField(f.ctx, schema.CreateFieldInput{
		Key: "servicetag", Label: "ServiceTag", Type: model.FieldText,
	})
	if err := f.schema.BindModel(f.ctx, dell.ID, tag.ID, false, 40); err != nil {
		t.Fatal(err)
	}

	head := "型号,持有方（名称）,设备备注,基准 MAC（必填）,ServiceTag\n" +
		"model,holder,note,mac,servicetag\n"
	file := strings.NewReader(head +
		"Latitude 5420,上海仓库,,00:1A:2B:3C:4D:01,ABC1234\n" + // belongs to this model
		"SDWAN-X100,上海仓库,,00:1A:2B:3C:4D:02,ZZZ9999\n") // does not

	rep, err := f.svc.Preview(f.ctx, i18n.ZH, f.catID, f.userID, file)
	if err != nil {
		t.Fatalf("preview: %v", err)
	}
	if rep.OK != 1 {
		t.Fatalf("one row should pass and one should not, got %d of %d: %+v", rep.OK, rep.Total, rep.Rows)
	}
	bad := rep.Rows[1]
	if bad.Status != "error" || bad.Fields["servicetag"] == "" {
		t.Errorf("the mismatched row should be refused on that column: %+v", bad)
	}
	if n := f.count(t); n != 0 {
		t.Errorf("a preview writes nothing, found %d assets", n)
	}
}
