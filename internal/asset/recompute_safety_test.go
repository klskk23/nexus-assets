package asset

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"reflect"
	"testing"

	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/schema"
	"github.com/klskk23/nexus-assets/internal/store"
)

func TestRecomputeFieldUsesActualReachAndLeavesUnrelatedComputations(t *testing.T) {
	f := newFixture(t)
	omitted, err := f.schema.CreateCategory(f.ctx, schema.CreateCategoryInput{Code: "OM", Name: "Omitted", ParentID: &f.rootID})
	if err != nil {
		t.Fatal(err)
	}
	untouched, err := f.save(t, SaveInput{CategoryID: omitted.ID})
	if err != nil {
		t.Fatal(err)
	}
	unrelated, err := f.schema.CreateField(f.ctx, schema.CreateFieldInput{Key: "unrelated", Label: "Unrelated", Type: model.FieldComputed, Options: model.FieldOptions{Template: `"old"`}, CategoryIDs: []string{f.catID}})
	if err != nil {
		t.Fatal(err)
	}
	a, err := f.save(t, SaveInput{Attrs: map[string]any{"mac": "001A2B3C4D5E"}})
	if err != nil {
		t.Fatal(err)
	}
	opts := model.FieldOptions{Template: `slice("short", 99, 100)`}
	if _, err := f.schema.UpdateField(f.ctx, unrelated.ID, schema.UpdateFieldInput{Options: &opts}); err != nil {
		t.Fatal(err)
	}
	f.setTemplate(t, `"NEW-" + hex2dec(attrs.mac)`)
	before, err := f.svc.Get(f.ctx, untouched.ID)
	if err != nil {
		t.Fatal(err)
	}
	report, err := f.svc.RecomputeField(f.ctx, f.snField, false)
	if err != nil {
		t.Fatalf("recompute reached field only: %v", err)
	}
	if !report.Applied || report.Total != 1 || report.Affected != 1 {
		t.Fatalf("report = %+v", report)
	}
	got, err := f.svc.Get(f.ctx, a.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.Attrs["sn"] != "NEW-112394521950" || got.Attrs["unrelated"] != "old" {
		t.Fatalf("computed attrs = %+v", got.Attrs)
	}
	after, err := f.svc.Get(f.ctx, untouched.ID)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(before, after) {
		t.Fatal("unselected descendant changed")
	}
}

func TestRecomputeFieldBatchWriteFailureRollsBackAllRoots(t *testing.T) {
	f := newFixture(t)
	other, err := f.schema.CreateCategory(f.ctx, schema.CreateCategoryInput{Code: "ZZ", Name: "Other"})
	if err != nil {
		t.Fatal(err)
	}
	for _, id := range []string{f.macField, f.snField} {
		if err := f.schema.Bind(f.ctx, other.ID, id, 0); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := f.save(t, SaveInput{Attrs: map[string]any{"mac": "001A2B3C4D01"}}); err != nil {
		t.Fatal(err)
	}
	if _, err := f.save(t, SaveInput{CategoryID: other.ID, Attrs: map[string]any{"mac": "001A2B3C4D02"}}); err != nil {
		t.Fatal(err)
	}
	f.setTemplate(t, `"NEW-" + hex2dec(attrs.mac)`)
	// Whichever root is written second fails. A single transaction must undo the first.
	if err := f.svc.db.Write(f.ctx, func(ctx context.Context, tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `CREATE TRIGGER reject_second_recompute BEFORE UPDATE OF attrs ON assets
   WHEN EXISTS (SELECT 1 FROM assets WHERE json_extract(attrs, '$.sn') LIKE 'NEW-%')
   BEGIN SELECT RAISE(ABORT, 'reject second recompute'); END`)
		return err
	}); err != nil {
		t.Fatal(err)
	}
	before := preparedAssetState(t, f)
	report, err := f.svc.RecomputeField(f.ctx, f.snField, false)
	if err == nil || report.Applied {
		t.Fatalf("write failure = %+v, %v", report, err)
	}
	if !reflect.DeepEqual(before, preparedAssetState(t, f)) {
		t.Fatal("failed field recompute partially committed")
	}
}

func TestRecomputeFieldCoversDeviceBindingsAndAllowsUniqueSwap(t *testing.T) {
	f := newFixture(t)
	device, err := f.schema.CreateModel(f.ctx, schema.CreateModelInput{Name: "Device"})
	if err != nil {
		t.Fatal(err)
	}
	field, err := f.schema.CreateField(f.ctx, schema.CreateFieldInput{Key: "device_code", Label: "Device code", Type: model.FieldComputed, IsUnique: true, ModelIDs: []string{device.ID}, Options: model.FieldOptions{Template: `id`}})
	if err != nil {
		t.Fatal(err)
	}
	var assets []model.Asset
	for _, mac := range []string{"001A2B3C4D01", "001A2B3C4D02"} {
		a, err := f.save(t, SaveInput{ModelID: &device.ID, Attrs: map[string]any{"mac": mac}})
		if err != nil {
			t.Fatal(err)
		}
		assets = append(assets, a)
	}
	opts := model.FieldOptions{Template: fmt.Sprintf(`id == %q ? %q : %q`, assets[0].ID, assets[1].ID, assets[0].ID)}
	if _, err := f.schema.UpdateField(f.ctx, field.ID, schema.UpdateFieldInput{Options: &opts}); err != nil {
		t.Fatal(err)
	}
	report, err := f.svc.RecomputeField(f.ctx, field.ID, false)
	if err != nil || !report.Applied || report.Total != 2 || report.Affected != 2 {
		t.Fatalf("device swap = %+v, %v", report, err)
	}
	for i, a := range assets {
		got, err := f.svc.Get(f.ctx, a.ID)
		if err != nil {
			t.Fatal(err)
		}
		if got.Attrs[field.Key] != assets[1-i].ID {
			t.Fatalf("swapped attrs = %+v", got.Attrs)
		}
		assertSchemaClaimRows(t, f, a.ID, field.Key, []claimRow{{a.ID, "f:" + field.ID, true, false}, {assets[1-i].ID, "f:" + field.ID, false, false}})
	}
}

// The read transaction ending is the deterministic barrier. A second committed
// transaction changes the input before the independent writer receives the plan.
func TestRecomputeRejectsStaleBatchBeforeAnyWrites(t *testing.T) {
	for _, scenario := range []string{"schema_withdrawn", "template_changed", "asset_version", "unchanged_asset_version"} {
		t.Run(scenario, func(t *testing.T) {
			f := newFixture(t)
			first, err := f.save(t, SaveInput{Attrs: map[string]any{"mac": "001A2B3C4D01"}})
			if err != nil {
				t.Fatal(err)
			}
			second, err := f.save(t, SaveInput{Attrs: map[string]any{"mac": "001A2B3C4D02"}})
			if err != nil {
				t.Fatal(err)
			}
			template := `"NEW-" + hex2dec(attrs.mac)`
			if scenario == "unchanged_asset_version" {
				template = `attrs.mac == "001A2B3C4D02" ? hex2dec(attrs.mac) : "NEW-" + hex2dec(attrs.mac)`
			}
			f.setTemplate(t, template)
			var plan *recomputePlan
			if err := f.svc.db.ReadTx(f.ctx, func(ctx context.Context, q store.Querier) error {
				var err error
				plan, err = planRecompute(ctx, q, "", f.snField)
				return err
			}); err != nil {
				t.Fatal(err)
			}
			if len(plan.changes) == 0 {
				t.Fatal("fixture planned no changes")
			}
			want := ErrVersionConflict
			switch scenario {
			case "schema_withdrawn":
				want = ErrSchemaStale
				// Metadata-only withdrawal catches guards that rely on asset version alone.
				if err := f.svc.db.Write(f.ctx, func(ctx context.Context, tx *sql.Tx) error {
					_, err := tx.ExecContext(ctx, `DELETE FROM category_field_selections WHERE category_id = ? AND field_id = ?`, f.catID, f.snField)
					return err
				}); err != nil {
					t.Fatal(err)
				}
			case "template_changed":
				want = ErrSchemaStale
				f.setTemplate(t, `"OTHER-" + hex2dec(attrs.mac)`)
			default:
				target := first
				if scenario == "unchanged_asset_version" {
					target = second
				}
				note := "Updated while recompute waited"
				if _, err := f.save(t, SaveInput{ID: target.ID, Version: target.Version, Attrs: target.Attrs, Note: note}); err != nil {
					t.Fatal(err)
				}
			}
			before := preparedAssetState(t, f)
			err = f.svc.db.Write(f.ctx, func(ctx context.Context, tx *sql.Tx) error { return plan.apply(ctx, tx) })
			if !errors.Is(err, want) {
				t.Fatalf("stale batch = %v, want %v", err, want)
			}
			if !reflect.DeepEqual(before, preparedAssetState(t, f)) {
				t.Fatal("stale recompute wrote partial values or indexes")
			}
		})
	}
}
