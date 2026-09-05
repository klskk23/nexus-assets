package schema

import (
	"errors"
	"slices"
	"strings"
	"testing"

	"github.com/klskk23/nexus-assets/internal/model"
)

// boundKeys pulls the field keys out of a resolved set, in order.
func boundKeys(fields []model.BoundField) []string {
	out := make([]string, 0, len(fields))
	for _, f := range fields {
		out = append(out, f.Key)
	}
	return out
}

// find returns the resolved field with the given key.
func find(t *testing.T, fields []model.BoundField, key string) model.BoundField {
	t.Helper()
	for _, f := range fields {
		if f.Key == key {
			return f
		}
	}
	t.Fatalf("%q is not in the effective set %v", key, boundKeys(fields))
	return model.BoundField{}
}

// The point of making the vendor a thing: one binding covers the whole
// catalogue, and a model registered afterwards arrives with it already on.
func TestVendorFieldReachesEveryModelOfThatVendor(t *testing.T) {
	s, ctx := newStore(t)
	root, _ := tree(t, s, ctx)

	dell := vendorNamed(t, s, ctx, "Dell")
	lenovo := vendorNamed(t, s, ctx, "Lenovo")
	one, err := s.CreateModel(ctx, CreateModelInput{
		Name: "R640", VendorID: dell, CategoryIDs: []string{root.ID},
	})
	if err != nil {
		t.Fatal(err)
	}
	two, err := s.CreateModel(ctx, CreateModelInput{
		Name: "R650", VendorID: dell, CategoryIDs: []string{root.ID},
	})
	if err != nil {
		t.Fatal(err)
	}
	other, err := s.CreateModel(ctx, CreateModelInput{
		Name: "SR650", VendorID: lenovo, CategoryIDs: []string{root.ID},
	})
	if err != nil {
		t.Fatal(err)
	}

	tag, _ := s.CreateField(ctx, CreateFieldInput{
		Key: "service_tag", Label: "服务编码", Type: model.FieldText,
	})
	if err := s.BindVendor(ctx, dell, tag.ID, 10); err != nil {
		t.Fatalf("bind vendor: %v", err)
	}

	fields, err := s.EffectiveFields(ctx, root.ID)
	if err != nil {
		t.Fatal(err)
	}
	got := find(t, fields, "service_tag")
	slices.Sort(got.ModelIDs)
	want := []string{one.ID, two.ID}
	slices.Sort(want)
	if !slices.Equal(got.ModelIDs, want) {
		t.Errorf("model_ids = %v, want both Dell models", got.ModelIDs)
	}
	if !slices.Equal(got.VendorIDs, []string{dell}) {
		t.Errorf("vendor_ids = %v, want the vendor it is actually bound to", got.VendorIDs)
	}

	// The narrowing every caller does, per device.
	if !AppliesTo(got, &one.ID) {
		t.Error("a Dell model should see its vendor's field")
	}
	if AppliesTo(got, &other.ID) {
		t.Error("another vendor's model must not see it")
	}
	var none *string
	if AppliesTo(got, none) {
		t.Error("a device with no model sees no device field")
	}

	// Registered afterwards, nothing else done. This is the live half of live
	// inheritance -- expanding at bind time would leave this model without it.
	fresh, err := s.CreateModel(ctx, CreateModelInput{
		Name: "R660", VendorID: dell, CategoryIDs: []string{root.ID},
	})
	if err != nil {
		t.Fatal(err)
	}
	fields, err = s.EffectiveFields(ctx, root.ID)
	if err != nil {
		t.Fatal(err)
	}
	if !AppliesTo(find(t, fields, "service_tag"), &fresh.ID) {
		t.Error("a model registered after the binding should still inherit it")
	}

	// And unbinding takes it away from all of them at once.
	if err := s.UnbindVendor(ctx, dell, tag.ID); err != nil {
		t.Fatalf("unbind vendor: %v", err)
	}
	fields, err = s.EffectiveFields(ctx, root.ID)
	if err != nil {
		t.Fatal(err)
	}
	if slices.Contains(boundKeys(fields), "service_tag") {
		t.Errorf("unbinding from the vendor should clear it everywhere, got %v", boundKeys(fields))
	}
}

// A field bound to a model and to that model's vendor is one column, not two.
func TestModelAndVendorBindingsOfOneFieldMergeIntoOneEntry(t *testing.T) {
	s, ctx := newStore(t)
	root, _ := tree(t, s, ctx)
	dell := vendorNamed(t, s, ctx, "Dell")
	m, err := s.CreateModel(ctx, CreateModelInput{
		Name: "R640", VendorID: dell, CategoryIDs: []string{root.ID},
	})
	if err != nil {
		t.Fatal(err)
	}
	tag, _ := s.CreateField(ctx, CreateFieldInput{
		Key: "service_tag", Label: "服务编码", Type: model.FieldText,
	})
	if err := s.BindModel(ctx, m.ID, tag.ID, 10); err != nil {
		t.Fatal(err)
	}
	if err := s.BindVendor(ctx, dell, tag.ID, 10); err != nil {
		t.Fatalf("both sides of the device half may hold one field: %v", err)
	}

	fields, err := s.EffectiveFields(ctx, root.ID)
	if err != nil {
		t.Fatal(err)
	}
	if n := len(fields); n != 1 {
		t.Fatalf("one field bound twice on one device is one column, got %d: %v", n, boundKeys(fields))
	}
	if got := find(t, fields, "service_tag").ModelIDs; !slices.Equal(got, []string{m.ID}) {
		t.Errorf("model_ids = %v, want the model exactly once", got)
	}
}

// The exclusion is category versus device, and vendors are the device side.
func TestCategoryAndDeviceBindingsStayExclusive(t *testing.T) {
	s, ctx := newStore(t)
	root, _ := tree(t, s, ctx)
	dell := vendorNamed(t, s, ctx, "Dell")
	m, err := s.CreateModel(ctx, CreateModelInput{
		Name: "R640", VendorID: dell, CategoryIDs: []string{root.ID},
	})
	if err != nil {
		t.Fatal(err)
	}

	onVendor, _ := s.CreateField(ctx, CreateFieldInput{Key: "tag", Label: "服务编码", Type: model.FieldText})
	if err := s.BindVendor(ctx, dell, onVendor.ID, 10); err != nil {
		t.Fatal(err)
	}
	if err := s.Bind(ctx, root.ID, onVendor.ID, 10); !errors.Is(err, ErrBindingModeConflict) {
		t.Errorf("a vendor field must not also bind a category, got %v", err)
	}
	// The same field on a model of another vendor is still the device side.
	if err := s.BindModel(ctx, m.ID, onVendor.ID, 10); err != nil {
		t.Errorf("model and vendor are one side and may both hold it: %v", err)
	}

	onCategory, _ := s.CreateField(ctx, CreateFieldInput{Key: "rack", Label: "机柜", Type: model.FieldText})
	if err := s.Bind(ctx, root.ID, onCategory.ID, 10); err != nil {
		t.Fatal(err)
	}
	if err := s.BindVendor(ctx, dell, onCategory.ID, 10); !errors.Is(err, ErrBindingModeConflict) {
		t.Errorf("a category field must not also bind a vendor, got %v", err)
	}
}

// The key has to be free everywhere the binding would reach, which for a vendor
// is every category its models sit in.
func TestVendorBindingRefusesAKeyTakenOnItsModelsCategories(t *testing.T) {
	s, ctx := newStore(t)
	root, child := tree(t, s, ctx)
	dell := vendorNamed(t, s, ctx, "Dell")
	if _, err := s.CreateModel(ctx, CreateModelInput{
		Name: "R640", VendorID: dell, CategoryIDs: []string{child.ID},
	}); err != nil {
		t.Fatal(err)
	}

	onChain, _ := s.CreateField(ctx, CreateFieldInput{Key: "tag", Label: "编码", Type: model.FieldText})
	if err := s.Bind(ctx, root.ID, onChain.ID, 10); err != nil {
		t.Fatal(err)
	}
	sameKey, _ := s.CreateField(ctx, CreateFieldInput{Key: "tag", Label: "另一个编码", Type: model.FieldText})
	if err := s.BindVendor(ctx, dell, sameKey.ID, 10); !errors.Is(err, ErrKeyConflict) {
		t.Errorf("the key is taken on the chain the vendor's model sits in, got %v", err)
	}

	// A vendor with no model anywhere near that chain is unaffected.
	elsewhere := vendorNamed(t, s, ctx, "Lenovo")
	if err := s.BindVendor(ctx, elsewhere, sameKey.ID, 10); err != nil {
		t.Errorf("a vendor whose models are nowhere on that chain may take the key: %v", err)
	}
	// But not twice on itself.
	third, _ := s.CreateField(ctx, CreateFieldInput{Key: "tag", Label: "第三个编码", Type: model.FieldText})
	if err := s.BindVendor(ctx, elsewhere, third.ID, 10); !errors.Is(err, ErrKeyConflict) {
		t.Errorf("two fields with one key on one vendor should conflict, got %v", err)
	}
}

// Deleting a vendor-bound field must not hit the foreign key -- the same
// omission that returned 500 for model-bound fields until v0.8.3.
func TestDeletingAVendorBoundFieldTakesTheBindingWithIt(t *testing.T) {
	s, ctx := newStore(t)
	root, _ := tree(t, s, ctx)
	dell := vendorNamed(t, s, ctx, "Dell")
	if _, err := s.CreateModel(ctx, CreateModelInput{
		Name: "R640", VendorID: dell, CategoryIDs: []string{root.ID},
	}); err != nil {
		t.Fatal(err)
	}
	f, _ := s.CreateField(ctx, CreateFieldInput{Key: "tag", Label: "编码", Type: model.FieldText})
	if err := s.BindVendor(ctx, dell, f.ID, 10); err != nil {
		t.Fatal(err)
	}
	if _, _, _, err := s.DeleteField(ctx, f.ID); err != nil {
		t.Fatalf("delete a vendor-bound field: %v", err)
	}
	bindings, err := s.VendorBindingsByVendor(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(bindings[dell]) != 0 {
		t.Errorf("the binding should be gone with the field, got %v", bindings[dell])
	}
}

// A device field cannot number a category, whichever way it is bound: it covers
// only some of the assets, and the rest would never get a number.
func TestDisplayKeyRefusesAVendorFieldByName(t *testing.T) {
	s, ctx := newStore(t)
	root, _ := tree(t, s, ctx)
	dell := vendorNamed(t, s, ctx, "Dell")
	if _, err := s.CreateModel(ctx, CreateModelInput{
		Name: "R640", VendorID: dell, CategoryIDs: []string{root.ID},
	}); err != nil {
		t.Fatal(err)
	}
	f, _ := s.CreateField(ctx, CreateFieldInput{
		Key: "tag", Label: "编码", Type: model.FieldText, IsUnique: true,
	})
	if err := s.BindVendor(ctx, dell, f.ID, 10); err != nil {
		t.Fatal(err)
	}

	wantKey := "tag"
	_, err := s.UpdateCategory(ctx, root.ID, UpdateCategoryInput{DisplayKey: &wantKey})
	if !errors.Is(err, ErrDisplayKeyNotCategoryField) {
		t.Fatalf("want the device-binding refusal, got %v", err)
	}
	if msg := err.Error(); !strings.Contains(msg, "tag") {
		t.Errorf("the refusal should name the key: %q", msg)
	}
}

// Vendor CRUD, including the guard that keeps a vendor its models still point
// at -- the same rule categories, statuses and holders follow.
func TestVendorCrudAndDeleteGuard(t *testing.T) {
	s, ctx := newStore(t)
	root, _ := tree(t, s, ctx)

	v, err := s.CreateVendor(ctx, "  Dell  ")
	if err != nil {
		t.Fatal(err)
	}
	if v.Name != "Dell" {
		t.Errorf("name = %q, should be trimmed", v.Name)
	}
	if _, err := s.CreateVendor(ctx, ""); !errors.Is(err, ErrVendorInvalid) {
		t.Errorf("a nameless vendor should be refused, got %v", err)
	}
	if _, err := s.CreateVendor(ctx, "Dell"); !errors.Is(err, ErrVendorInvalid) {
		t.Errorf("a duplicate name should be refused, got %v", err)
	}

	m, err := s.CreateModel(ctx, CreateModelInput{
		Name: "R640", VendorID: v.ID, CategoryIDs: []string{root.ID},
	})
	if err != nil {
		t.Fatal(err)
	}
	list, err := s.ListVendors(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 1 || list[0].ModelCount != 1 {
		t.Fatalf("the list should carry the model count, got %+v", list)
	}

	// Renaming is one row: the models point at it and every read joins.
	if _, err := s.RenameVendor(ctx, v.ID, "戴尔"); err != nil {
		t.Fatal(err)
	}
	got, err := s.GetModel(ctx, m.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.VendorName != "戴尔" {
		t.Errorf("vendor_name = %q, should follow the rename with nothing else done", got.VendorName)
	}

	used, err := s.DeleteVendor(ctx, v.ID)
	if !errors.Is(err, ErrVendorInUse) || used != 1 {
		t.Fatalf("deleting a vendor with models should refuse and count them, got %d %v", used, err)
	}
	if _, err := s.DeleteModel(ctx, m.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := s.DeleteVendor(ctx, v.ID); err != nil {
		t.Fatalf("delete vendor: %v", err)
	}
	if _, err := s.GetVendor(ctx, v.ID); !errors.Is(err, ErrNotFound) {
		t.Errorf("want ErrNotFound after delete, got %v", err)
	}
	if err := s.UnbindVendor(ctx, v.ID, "nope"); !errors.Is(err, ErrNotFound) {
		t.Errorf("unbinding what is not bound is not found, got %v", err)
	}
}

// "Bound where" is a separate question from "reaches where", and this is the
// half the field list shows.
func TestVendorsOfFieldReportsWhereTheBindingWasMade(t *testing.T) {
	s, ctx := newStore(t)
	root, _ := tree(t, s, ctx)
	dell := vendorNamed(t, s, ctx, "Dell")
	lenovo := vendorNamed(t, s, ctx, "Lenovo")
	if _, err := s.CreateModel(ctx, CreateModelInput{
		Name: "R640", VendorID: dell, CategoryIDs: []string{root.ID},
	}); err != nil {
		t.Fatal(err)
	}
	f, _ := s.CreateField(ctx, CreateFieldInput{Key: "tag", Label: "编码", Type: model.FieldText})
	if err := s.BindVendor(ctx, dell, f.ID, 10); err != nil {
		t.Fatal(err)
	}
	if err := s.BindVendor(ctx, lenovo, f.ID, 20); err != nil {
		t.Fatal(err)
	}

	byField, err := s.VendorsOfField(ctx)
	if err != nil {
		t.Fatal(err)
	}
	got := append([]string(nil), byField[f.ID]...)
	want := []string{dell, lenovo}
	slices.Sort(got)
	slices.Sort(want)
	if !slices.Equal(got, want) {
		t.Errorf("vendors of field = %v, want both", got)
	}

	// Lenovo has no models, so binding it reaches nothing -- and still shows.
	if _, err := s.ModelsOfVendor(ctx); err != nil {
		t.Fatal(err)
	}

	// Nobody has any devices yet, which is what the required-impact count says.
	n, err := s.VendorRequiredImpact(ctx, dell)
	if err != nil {
		t.Fatalf("impact: %v", err)
	}
	if n != 0 {
		t.Errorf("a vendor with no devices should count zero, got %d", n)
	}
}

// The refusals that come before any row is written.
func TestVendorBindingRefusesUnknownEnds(t *testing.T) {
	s, ctx := newStore(t)
	dell := vendorNamed(t, s, ctx, "Dell")
	f, _ := s.CreateField(ctx, CreateFieldInput{Key: "tag", Label: "编码", Type: model.FieldText})

	if err := s.BindVendor(ctx, dell, "missing", 10); !errors.Is(err, ErrNotFound) {
		t.Errorf("an unknown field is not found, got %v", err)
	}
	if err := s.BindVendor(ctx, "missing", f.ID, 10); !errors.Is(err, ErrNotFound) {
		t.Errorf("an unknown vendor is not found, got %v", err)
	}
	if _, err := s.RenameVendor(ctx, "missing", "别的"); !errors.Is(err, ErrNotFound) {
		t.Errorf("renaming what is not there is not found, got %v", err)
	}
	if _, err := s.RenameVendor(ctx, dell, "  "); !errors.Is(err, ErrVendorInvalid) {
		t.Errorf("renaming to nothing should be refused, got %v", err)
	}
	other := vendorNamed(t, s, ctx, "Lenovo")
	if _, err := s.RenameVendor(ctx, other, "Dell"); !errors.Is(err, ErrVendorInvalid) {
		t.Errorf("renaming onto a taken name should be refused, got %v", err)
	}
	if _, err := s.DeleteVendor(ctx, "missing"); !errors.Is(err, ErrNotFound) {
		t.Errorf("deleting what is not there is not found, got %v", err)
	}
}

// The dry-run behind changing a model's vendor: which fields stop reaching this
// model, and how many of its devices hold a value under one of them.
func TestVendorChangeImpactNamesOnlyWhatIsLost(t *testing.T) {
	s, ctx := newStore(t)
	root, _ := tree(t, s, ctx)
	dell := vendorNamed(t, s, ctx, "Dell")
	lenovo := vendorNamed(t, s, ctx, "Lenovo")
	m, err := s.CreateModel(ctx, CreateModelInput{
		Name: "R640", VendorID: dell, CategoryIDs: []string{root.ID},
	})
	if err != nil {
		t.Fatal(err)
	}

	lost, _ := s.CreateField(ctx, CreateFieldInput{Key: "tag", Label: "服务编码", Type: model.FieldText})
	shared, _ := s.CreateField(ctx, CreateFieldInput{Key: "warranty", Label: "保修", Type: model.FieldText})
	own, _ := s.CreateField(ctx, CreateFieldInput{Key: "rack", Label: "机柜", Type: model.FieldText})
	for _, b := range []struct {
		vendor string
		field  string
	}{{dell, lost.ID}, {dell, shared.ID}, {lenovo, shared.ID}} {
		if err := s.BindVendor(ctx, b.vendor, b.field, 10); err != nil {
			t.Fatal(err)
		}
	}
	if err := s.BindModel(ctx, m.ID, own.ID, 10); err != nil {
		t.Fatal(err)
	}

	n, labels, err := s.VendorChangeImpact(ctx, m.ID, lenovo)
	if err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(labels, []string{"服务编码"}) {
		t.Errorf("only the field the new vendor does not also provide is lost, got %v", labels)
	}
	if n != 0 {
		t.Errorf("no device holds a value yet, got %d", n)
	}

	// Moving to no vendor at all loses the shared one too.
	_, labels, err = s.VendorChangeImpact(ctx, m.ID, "")
	if err != nil {
		t.Fatal(err)
	}
	if len(labels) != 2 {
		t.Errorf("moving to no vendor loses both of Dell's fields, got %v", labels)
	}

	// A model whose vendor provides nothing has nothing to lose.
	bare, err := s.CreateModel(ctx, CreateModelInput{
		Name: "SR650", VendorID: lenovo, CategoryIDs: []string{root.ID},
	})
	if err != nil {
		t.Fatal(err)
	}
	n, labels, err = s.VendorChangeImpact(ctx, bare.ID, dell)
	if err != nil {
		t.Fatal(err)
	}
	if n != 0 || len(labels) != 0 {
		t.Errorf("nothing is lost, got %d %v", n, labels)
	}
}
