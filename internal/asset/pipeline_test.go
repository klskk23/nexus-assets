package asset

import (
	"context"
	"errors"
	"path/filepath"
	"strings"
	"testing"

	"github.com/klskk23/nexus-assets/internal/auth"
	"github.com/klskk23/nexus-assets/internal/holder"
	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/schema"
	"github.com/klskk23/nexus-assets/internal/store"
)

type fixture struct {
	svc      *Service
	schema   *schema.Store
	holders  *holder.Store
	users    *auth.Store
	ctx      context.Context
	userID   string
	locID    string
	catID    string
	rootID   string
	macField string
	snField  string
}

// newFixture builds a minimal but real system: temp database, migrations, one
// account, one location, a two-level category tree with a unique MAC field and
// an expression key over it nominated as the display key.
func newFixture(t *testing.T) *fixture {
	t.Helper()
	ctx := context.Background()

	db, err := store.Open(filepath.Join(t.TempDir(), "t.db"))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	if err := db.Migrate(ctx); err != nil {
		t.Fatalf("migrate: %v", err)
	}

	sch := schema.New(db)
	hs := holder.New(db)
	us := auth.NewStore(db)

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
	if err := hs.SetDefaultStock(ctx, loc.ID); err != nil {
		t.Fatalf("set default stock: %v", err)
	}

	root, err := sch.CreateCategory(ctx, schema.CreateCategoryInput{Code: "NET", Name: "网络设备"})
	if err != nil {
		t.Fatalf("create root category: %v", err)
	}
	child, err := sch.CreateCategory(ctx, schema.CreateCategoryInput{
		Code: "RT", Name: "SDWAN 路由器", ParentID: &root.ID,
	})
	if err != nil {
		t.Fatalf("create child category: %v", err)
	}

	mac, err := sch.CreateField(ctx, schema.CreateFieldInput{
		Key: "mac", Label: "基准 MAC", Type: model.FieldMAC, IsUnique: true,
	})
	if err != nil {
		t.Fatalf("create mac field: %v", err)
	}
	fw, err := sch.CreateField(ctx, schema.CreateFieldInput{
		Key: "firmware", Label: "固件版本", Type: model.FieldText,
	})
	if err != nil {
		t.Fatalf("create firmware field: %v", err)
	}
	if err := sch.Bind(ctx, root.ID, mac.ID, true, 10); err != nil {
		t.Fatalf("bind mac: %v", err)
	}
	sn, err := sch.CreateField(ctx, schema.CreateFieldInput{
		Key: "sn", Label: "设备编号", Type: model.FieldComputed, IsUnique: true,
		Options: model.FieldOptions{Template: "{{ .attrs.mac | hex2dec }}"},
	})
	if err != nil {
		t.Fatalf("create sn field: %v", err)
	}
	if err := sch.Bind(ctx, root.ID, fw.ID, false, 20); err != nil {
		t.Fatalf("bind firmware: %v", err)
	}
	if err := sch.Bind(ctx, root.ID, sn.ID, false, 30); err != nil {
		t.Fatalf("bind sn: %v", err)
	}
	displayKey := "sn"
	if _, err := sch.UpdateCategory(ctx, child.ID, schema.UpdateCategoryInput{DisplayKey: &displayKey}); err != nil {
		t.Fatalf("set display key: %v", err)
	}

	return &fixture{
		svc: NewService(db, sch), schema: sch, holders: hs, users: us,
		ctx: ctx, userID: u.ID, locID: loc.ID, catID: child.ID, rootID: root.ID,
		macField: mac.ID, snField: sn.ID,
	}
}

func (f *fixture) save(t *testing.T, in SaveInput) (model.Asset, error) {
	t.Helper()
	if in.CategoryID == "" {
		in.CategoryID = f.catID
	}
	if in.Status == "" {
		in.Status = model.StatusInStock
	}
	if in.OwnerID == "" {
		in.OwnerID = f.userID
	}
	if in.Holder.ID == "" {
		in.Holder = model.Holder{Type: model.HolderTypeEntity, ID: f.locID}
	}
	if in.ActorID == "" {
		in.ActorID = f.userID
	}
	return f.svc.Save(f.ctx, in)
}

// The expression key over the MAC, verified end to end.
func TestSaveDerivesDisplayNameFromMAC(t *testing.T) {
	f := newFixture(t)
	a, err := f.save(t, SaveInput{Attrs: map[string]any{"mac": "00:1A:2B:3C:4D:5E"}})
	if err != nil {
		t.Fatalf("save: %v", err)
	}
	if a.Attrs["sn"] != "112394521950" {
		t.Errorf("sn = %q, want 112394521950 (0x001A2B3C4D5E)", a.Attrs["sn"])
	}
	if a.DisplayName != "112394521950" {
		t.Errorf("display name = %q, want the display key's value", a.DisplayName)
	}
	if a.Attrs["mac"] != "001A2B3C4D5E" {
		t.Errorf("MAC should be stored normalised, got %v", a.Attrs["mac"])
	}
	if a.Version != 1 {
		t.Errorf("version = %d, want 1", a.Version)
	}
}

// Fields inherited from an ancestor category apply to the child.
func TestInheritedRequiredFieldEnforced(t *testing.T) {
	f := newFixture(t)
	_, err := f.save(t, SaveInput{Attrs: map[string]any{"firmware": "2.1.3"}})
	if err == nil {
		t.Fatal("a missing required inherited field must block the save")
	}
	var fe FieldErrors
	if !errors.As(err, &fe) || fe["mac"] == "" {
		t.Errorf("error should point at the mac field, got %#v", err)
	}
}

// The reason normalisation has to run before the uniqueness check.
func TestDuplicateMACAcrossSpellingsRejected(t *testing.T) {
	f := newFixture(t)
	if _, err := f.save(t, SaveInput{Attrs: map[string]any{"mac": "00:1A:2B:3C:4D:5E"}}); err != nil {
		t.Fatalf("first save: %v", err)
	}
	for _, spelling := range []string{"00-1a-2b-3c-4d-5e", "001A2B3C4D5E", "001a2b3c4d5e"} {
		_, err := f.save(t, SaveInput{Attrs: map[string]any{"mac": spelling}})
		if err == nil {
			t.Fatalf("%q is the same card and must be refused", spelling)
		}
		var fe FieldErrors
		if !errors.As(err, &fe) {
			t.Fatalf("expected field errors, got %#v", err)
		}
		if fe["mac"] == "" && fe["sn"] == "" {
			t.Errorf("conflict should name mac or sn, got %v", fe)
		}
	}
}

// Correcting the MAC regenerates the number and keeps the old one searchable.
func TestMACCorrectionRegeneratesNumberAndArchivesOld(t *testing.T) {
	f := newFixture(t)
	a, err := f.save(t, SaveInput{Attrs: map[string]any{"mac": "001A2B3C4D5E"}})
	if err != nil {
		t.Fatalf("save: %v", err)
	}
	oldSN := a.DisplayName

	b, err := f.save(t, SaveInput{
		ID: a.ID, Version: a.Version, Attrs: map[string]any{"mac": "001A2B3C4D5F"},
	})
	if err != nil {
		t.Fatalf("update: %v", err)
	}
	if b.DisplayName == oldSN {
		t.Fatal("the number should change with the MAC it is derived from")
	}
	if b.DisplayName != "112394521951" {
		t.Errorf("display name = %q, want 112394521951", b.DisplayName)
	}

	hist, err := f.svc.ValueHistory(f.ctx, a.ID)
	if err != nil {
		t.Fatalf("history: %v", err)
	}
	// Both unique fields moved: the MAC itself and the number derived from it.
	got := map[string]string{}
	for _, h := range hist {
		got[h.Key] = h.Value
	}
	if got["sn"] != oldSN {
		t.Errorf("old number should be archived, got %v", hist)
	}
	if got["mac"] != "001A2B3C4D5E" {
		t.Errorf("old MAC should be archived too, got %v", hist)
	}

	// A label printed with the old number still finds the device.
	res, err := f.svc.List(f.ctx, ListFilter{Q: oldSN})
	if err != nil {
		t.Fatalf("search: %v", err)
	}
	if res.ExactMatchID != a.ID {
		t.Errorf("searching the retired SN should land on the asset, got %q", res.ExactMatchID)
	}
}

func TestOptimisticLockRejectsStaleVersion(t *testing.T) {
	f := newFixture(t)
	a, err := f.save(t, SaveInput{Attrs: map[string]any{"mac": "001A2B3C4D5E"}})
	if err != nil {
		t.Fatalf("save: %v", err)
	}
	if _, err := f.save(t, SaveInput{ID: a.ID, Version: a.Version,
		Attrs: map[string]any{"mac": "001A2B3C4D5E", "firmware": "2.2.0"}}); err != nil {
		t.Fatalf("first update: %v", err)
	}
	// Second writer still holds version 1.
	_, err = f.save(t, SaveInput{ID: a.ID, Version: a.Version,
		Attrs: map[string]any{"mac": "001A2B3C4D5E", "firmware": "9.9.9"}})
	if !errors.Is(err, ErrVersionConflict) {
		t.Fatalf("stale version must conflict, got %v", err)
	}
}

func TestCreateEmitsCreateTransfer(t *testing.T) {
	f := newFixture(t)
	a, err := f.save(t, SaveInput{Attrs: map[string]any{"mac": "001A2B3C4D5E"}})
	if err != nil {
		t.Fatalf("save: %v", err)
	}
	var kind string
	err = f.svc.db.ReadDB().QueryRowContext(f.ctx,
		`SELECT kind FROM asset_transfers WHERE asset_id = ?`, a.ID).Scan(&kind)
	if err != nil {
		t.Fatalf("read transfer: %v", err)
	}
	if kind != string(model.KindCreate) {
		t.Errorf("kind = %q, want create", kind)
	}
}

func TestAttributeOnlyEditEmitsNoTransfer(t *testing.T) {
	f := newFixture(t)
	a, _ := f.save(t, SaveInput{Attrs: map[string]any{"mac": "001A2B3C4D5E"}})
	if _, err := f.save(t, SaveInput{ID: a.ID, Version: a.Version,
		Attrs: map[string]any{"mac": "001A2B3C4D5E", "firmware": "2.2.0"}}); err != nil {
		t.Fatalf("update: %v", err)
	}
	var n int
	f.svc.db.ReadDB().QueryRowContext(f.ctx,
		`SELECT count(*) FROM asset_transfers WHERE asset_id = ?`, a.ID).Scan(&n)
	if n != 1 {
		t.Errorf("an attribute-only edit must not add a transfer row, got %d rows", n)
	}
}

func TestDeleteRequiresMatchingDisplayName(t *testing.T) {
	f := newFixture(t)
	a, _ := f.save(t, SaveInput{Attrs: map[string]any{"mac": "001A2B3C4D5E"}})
	if err := f.svc.Delete(f.ctx, a.ID, "wrong"); err == nil {
		t.Fatal("a mismatched confirmation must refuse the delete")
	}
	if err := f.svc.Delete(f.ctx, a.ID, a.DisplayName); err != nil {
		t.Fatalf("delete with the right SN: %v", err)
	}
	if _, err := f.svc.Get(f.ctx, a.ID); !errors.Is(err, ErrNotFound) {
		t.Errorf("asset should be gone, got %v", err)
	}
}

func TestSearchFallsBackToSubstring(t *testing.T) {
	f := newFixture(t)
	if _, err := f.save(t, SaveInput{Attrs: map[string]any{"mac": "001A2B3C4D5E"}}); err != nil {
		t.Fatal(err)
	}
	res, err := f.svc.List(f.ctx, ListFilter{Q: "4D5E"})
	if err != nil {
		t.Fatalf("search: %v", err)
	}
	if res.ExactMatchID != "" {
		t.Error("a partial MAC is not an exact hit")
	}
	if res.Total != 1 {
		t.Errorf("substring search should still find it, total = %d", res.Total)
	}
}

func TestSubtreeFilterIncludesDescendants(t *testing.T) {
	f := newFixture(t)
	if _, err := f.save(t, SaveInput{Attrs: map[string]any{"mac": "001A2B3C4D5E"}}); err != nil {
		t.Fatal(err)
	}
	cats, _ := f.schema.ListCategories(f.ctx)
	var rootID string
	for _, c := range cats {
		if c.Code == "NET" {
			rootID = c.ID
		}
	}
	with, err := f.svc.List(f.ctx, ListFilter{CategoryID: rootID, IncludeDescendants: true})
	if err != nil {
		t.Fatal(err)
	}
	if with.Total != 1 {
		t.Errorf("subtree search should find the child's asset, got %d", with.Total)
	}
	without, _ := f.svc.List(f.ctx, ListFilter{CategoryID: rootID, IncludeDescendants: false})
	if without.Total != 0 {
		t.Errorf("without descendants the root itself holds nothing, got %d", without.Total)
	}
}

func TestInStockRequiresLocationHolder(t *testing.T) {
	f := newFixture(t)
	err := ValidateHolderForStatus(model.StatusInStock,
		model.Holder{Type: model.HolderTypeUser, ID: f.userID}, "")
	if err == nil {
		t.Fatal("in_stock held by a person must be refused")
	}
	if !strings.Contains(err.Error(), "位置") {
		t.Errorf("message should explain the rule, got %v", err)
	}
}

// A computed field that feeds another computed field, evaluated in order.
func TestComputedChainEvaluatesInDependencyOrder(t *testing.T) {
	f := newFixture(t)
	ctx := f.ctx

	base, err := f.schema.CreateField(ctx, schema.CreateFieldInput{
		Key: "base_num", Label: "基数", Type: model.FieldComputed,
		Options: model.FieldOptions{Template: "{{ .attrs.mac | hex2dec }}"},
	})
	if err != nil {
		t.Fatalf("create base_num: %v", err)
	}
	full, err := f.schema.CreateField(ctx, schema.CreateFieldInput{
		Key: "full_tag", Label: "完整标签", Type: model.FieldComputed,
		Options: model.FieldOptions{Template: `{{ printf "%s-%s" .category.code .attrs.base_num }}`},
	})
	if err != nil {
		t.Fatalf("create full_tag: %v", err)
	}
	cats, _ := f.schema.ListCategories(ctx)
	var rootID string
	for _, c := range cats {
		if c.Code == "NET" {
			rootID = c.ID
		}
	}
	// Dependencies must be bound first, so the ordering has to come from
	// somewhere else: full_tag is given the lower sort, which puts it ahead of
	// base_num in the resolved field list. A correct result therefore cannot
	// come from list order alone.
	if err := f.schema.Bind(ctx, rootID, base.ID, false, 40); err != nil {
		t.Fatal(err)
	}
	if err := f.schema.Bind(ctx, rootID, full.ID, false, 30); err != nil {
		t.Fatal(err)
	}

	a, err := f.save(t, SaveInput{Attrs: map[string]any{"mac": "001A2B3C4D5E"}})
	if err != nil {
		t.Fatalf("save: %v", err)
	}
	if a.Attrs["base_num"] != "112394521950" {
		t.Errorf("base_num = %v", a.Attrs["base_num"])
	}
	if a.Attrs["full_tag"] != "RT-112394521950" {
		t.Errorf("full_tag = %v, want RT-112394521950", a.Attrs["full_tag"])
	}
}

// A field removed from the category keeps its stored value, shown read-only.
func TestGetSplitsOrphanKeys(t *testing.T) {
	f := newFixture(t)
	a, err := f.save(t, SaveInput{Attrs: map[string]any{"mac": "001A2B3C4D5E", "firmware": "2.1.3"}})
	if err != nil {
		t.Fatalf("save: %v", err)
	}
	cats, _ := f.schema.ListCategories(f.ctx)
	var rootID string
	for _, c := range cats {
		if c.Code == "NET" {
			rootID = c.ID
		}
	}
	fields, _ := f.schema.ListFields(f.ctx)
	for _, fd := range fields {
		if fd.Key == "firmware" {
			if err := f.schema.Unbind(f.ctx, rootID, fd.ID); err != nil {
				t.Fatal(err)
			}
		}
	}

	got, err := f.svc.Get(f.ctx, a.ID)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if _, still := got.Attrs["firmware"]; still {
		t.Error("an unbound field should not appear among the live values")
	}
	if got.ArchivedAttrs["firmware"] != "2.1.3" {
		t.Errorf("its value must survive as an orphan key, got %v", got.ArchivedAttrs)
	}
}

func TestListFiltersByCustomAttribute(t *testing.T) {
	f := newFixture(t)
	if _, err := f.save(t, SaveInput{Attrs: map[string]any{"mac": "001A2B3C4D5E", "firmware": "2.1.3"}}); err != nil {
		t.Fatal(err)
	}
	if _, err := f.save(t, SaveInput{Attrs: map[string]any{"mac": "001A2B3C4D5F", "firmware": "2.2.0"}}); err != nil {
		t.Fatal(err)
	}

	res, err := f.svc.List(f.ctx, ListFilter{AttrFilters: map[string]string{"firmware": "2.1.3"}})
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if res.Total != 1 {
		t.Errorf("attribute filter should narrow to one, got %d", res.Total)
	}
}

func TestListPaginationClampsLimit(t *testing.T) {
	f := newFixture(t)
	for i, mac := range []string{"001A2B3C4D01", "001A2B3C4D02", "001A2B3C4D03"} {
		if _, err := f.save(t, SaveInput{Attrs: map[string]any{"mac": mac}}); err != nil {
			t.Fatalf("save %d: %v", i, err)
		}
	}
	res, err := f.svc.List(f.ctx, ListFilter{Limit: 9999, Offset: 1})
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if res.Total != 3 {
		t.Errorf("total counts every match regardless of the page, got %d", res.Total)
	}
	if len(res.Items) != 2 {
		t.Errorf("offset should skip one, got %d items", len(res.Items))
	}
}

func TestStatusFilterAndTransition(t *testing.T) {
	f := newFixture(t)
	a, err := f.save(t, SaveInput{Attrs: map[string]any{"mac": "001A2B3C4D5E"}})
	if err != nil {
		t.Fatal(err)
	}
	// in_stock -> in_use, held by a person: a checkout.
	if _, err := f.save(t, SaveInput{
		ID: a.ID, Version: a.Version, Status: model.StatusInUse,
		Holder: model.Holder{Type: model.HolderTypeUser, ID: f.userID},
		Attrs:  map[string]any{"mac": "001A2B3C4D5E"},
	}); err != nil {
		t.Fatalf("checkout: %v", err)
	}

	var kind string
	if err := f.svc.db.ReadDB().QueryRowContext(f.ctx,
		`SELECT kind FROM asset_transfers WHERE asset_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1`,
		a.ID).Scan(&kind); err != nil {
		t.Fatal(err)
	}
	if kind != string(model.KindCheckout) {
		t.Errorf("kind = %q, want checkout", kind)
	}

	res, _ := f.svc.List(f.ctx, ListFilter{Status: string(model.StatusInUse)})
	if res.Total != 1 {
		t.Errorf("status filter should find the checked-out asset, got %d", res.Total)
	}
}

func TestRetiredIsTerminalInThePipeline(t *testing.T) {
	f := newFixture(t)
	a, _ := f.save(t, SaveInput{Attrs: map[string]any{"mac": "001A2B3C4D5E"}})
	b, err := f.save(t, SaveInput{
		ID: a.ID, Version: a.Version, Status: model.StatusRetired,
		Attrs: map[string]any{"mac": "001A2B3C4D5E"},
	})
	if err != nil {
		t.Fatalf("retire: %v", err)
	}
	_, err = f.save(t, SaveInput{
		ID: b.ID, Version: b.Version, Status: model.StatusInStock,
		Attrs: map[string]any{"mac": "001A2B3C4D5E"},
	})
	if err == nil {
		t.Fatal("nothing may transition out of retired")
	}
	if !strings.Contains(err.Error(), "terminal") {
		t.Errorf("error should say why, got %v", err)
	}
}

// Binding an expression key before its inputs is refused, and the refusal says
// what to bind first. Left to save time, the same mistake surfaces as "why can
// this device not be saved" with the error on the wrong field.
func TestBindingAnExpressionKeyBeforeItsInputsIsRefused(t *testing.T) {
	f := newFixture(t)
	ctx := f.ctx

	tag, err := f.schema.CreateField(ctx, schema.CreateFieldInput{
		Key: "rack_tag", Label: "机柜标签", Type: model.FieldComputed,
		Options: model.FieldOptions{Template: "{{ .attrs.rack | upper }}"},
	})
	if err != nil {
		t.Fatalf("create rack_tag: %v", err)
	}
	rack, err := f.schema.CreateField(ctx, schema.CreateFieldInput{
		Key: "rack", Label: "机柜", Type: model.FieldText,
	})
	if err != nil {
		t.Fatalf("create rack: %v", err)
	}

	err = f.schema.Bind(ctx, f.catID, tag.ID, false, 50)
	if !errors.Is(err, schema.ErrDependenciesUnmet) {
		t.Fatalf("want ErrDependenciesUnmet, got %v", err)
	}
	if !strings.Contains(err.Error(), "rack") {
		t.Errorf("the refusal should name the missing input, got %v", err)
	}

	// Bound but optional is still not enough: an empty value would fail to
	// evaluate, and a failed evaluation rolls the whole save back.
	if err := f.schema.Bind(ctx, f.catID, rack.ID, false, 40); err != nil {
		t.Fatalf("bind rack: %v", err)
	}
	err = f.schema.Bind(ctx, f.catID, tag.ID, false, 50)
	if !errors.Is(err, schema.ErrDependenciesUnmet) {
		t.Fatalf("an optional input must still be refused, got %v", err)
	}
	if !strings.Contains(err.Error(), "必填") {
		t.Errorf("the refusal should say the input must be required, got %v", err)
	}

	if err := f.schema.Bind(ctx, f.catID, rack.ID, true, 40); err != nil {
		t.Fatalf("mark rack required: %v", err)
	}
	if err := f.schema.Bind(ctx, f.catID, tag.ID, false, 50); err != nil {
		t.Fatalf("with its input bound and required, the expression key must bind: %v", err)
	}
}

// The mirror of the bind gate. Without it, unbinding an input leaves every
// asset in the category permanently unsaveable.
func TestUnbindingAnInputAnExpressionReadsIsRefused(t *testing.T) {
	f := newFixture(t)
	err := f.schema.Unbind(f.ctx, f.rootID, f.macField)
	if !errors.Is(err, schema.ErrFieldDependedOn) {
		t.Fatalf("want ErrFieldDependedOn, got %v", err)
	}
	if !strings.Contains(err.Error(), "设备编号") {
		t.Errorf("the refusal should name what reads it, got %v", err)
	}
}

// A category may not point its display key at a field two devices could share.
func TestDisplayKeyMustBeUnique(t *testing.T) {
	f := newFixture(t)
	key := "firmware"
	_, err := f.schema.UpdateCategory(f.ctx, f.catID, schema.UpdateCategoryInput{DisplayKey: &key})
	if !errors.Is(err, schema.ErrDisplayKeyInvalid) {
		t.Fatalf("want ErrDisplayKeyInvalid, got %v", err)
	}
	if !strings.Contains(err.Error(), "唯一") {
		t.Errorf("the refusal should explain what to fix, got %v", err)
	}

	missing := "nope"
	if _, err := f.schema.UpdateCategory(f.ctx, f.catID,
		schema.UpdateCategoryInput{DisplayKey: &missing}); !errors.Is(err, schema.ErrDisplayKeyInvalid) {
		t.Errorf("an unbound key must be refused too, got %v", err)
	}
}

// With no display key configured, an asset still has to be referable.
func TestDisplayNameFallsBackToShortUUID(t *testing.T) {
	f := newFixture(t)
	empty := ""
	if _, err := f.schema.UpdateCategory(f.ctx, f.catID,
		schema.UpdateCategoryInput{DisplayKey: &empty}); err != nil {
		t.Fatalf("clear display key: %v", err)
	}
	a, err := f.save(t, SaveInput{Attrs: map[string]any{"mac": "001A2B3C4D5E"}})
	if err != nil {
		t.Fatalf("save: %v", err)
	}
	if a.DisplayName != model.ShortID(a.ID) {
		t.Errorf("display name = %q, want the short UUID %q", a.DisplayName, model.ShortID(a.ID))
	}
	if len(a.DisplayName) != 8 {
		t.Errorf("the fallback should be eight hex digits, got %q", a.DisplayName)
	}
}

// A batch asks for its size rather than each device's number: typing twelve
// identifiers is not confirmation, it is an obstacle course.
func TestDeleteManyRequiresTheCount(t *testing.T) {
	f := newFixture(t)
	var ids []string
	for _, mac := range []string{"001A2B3C0001", "001A2B3C0002", "001A2B3C0003"} {
		a, err := f.save(t, SaveInput{Attrs: map[string]any{"mac": mac}})
		if err != nil {
			t.Fatal(err)
		}
		ids = append(ids, a.ID)
	}

	if _, err := f.svc.DeleteMany(f.ctx, ids, "2"); err == nil {
		t.Fatal("a wrong count must refuse the batch")
	}
	var fe FieldErrors
	if _, err := f.svc.DeleteMany(f.ctx, ids, ""); !errors.As(err, &fe) || fe["confirm"] == "" {
		t.Errorf("the refusal should name the confirmation field, got %#v", err)
	}
	if _, err := f.svc.DeleteMany(f.ctx, nil, "0"); err == nil {
		t.Error("an empty selection has nothing to confirm")
	}

	// Everything still there after the refusals.
	res, err := f.svc.List(f.ctx, ListFilter{})
	if err != nil || res.Total != 3 {
		t.Fatalf("total = %d, %v", res.Total, err)
	}

	n, err := f.svc.DeleteMany(f.ctx, ids, "3")
	if err != nil || n != 3 {
		t.Fatalf("DeleteMany = %d, %v", n, err)
	}
	res, err = f.svc.List(f.ctx, ListFilter{})
	if err != nil || res.Total != 0 {
		t.Errorf("total = %d, %v", res.Total, err)
	}
}

// Removing nine of twelve and then failing would leave the operator with no
// idea which nine.
func TestDeleteManyIsAllOrNothing(t *testing.T) {
	f := newFixture(t)
	a, err := f.save(t, SaveInput{Attrs: map[string]any{"mac": "001A2B3C0001"}})
	if err != nil {
		t.Fatal(err)
	}

	if _, err := f.svc.DeleteMany(f.ctx, []string{a.ID, "missing"}, "2"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("want ErrNotFound, got %v", err)
	}
	res, err := f.svc.List(f.ctx, ListFilter{})
	if err != nil || res.Total != 1 {
		t.Errorf("the whole batch should have rolled back, total = %d", res.Total)
	}
}
