package asset

import (
	"context"
	"database/sql"
	"errors"
	"reflect"
	"strings"
	"testing"

	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/schema"
)

// Multiple deltas must not rewrite an asset twice or discard its archived attrs.
// This exercises the effects boundary directly; public withdrawal still needs confirmation.
func TestSchemaEffectsWithdrawalPreservesAttrsAndUpdatesIndexesOnce(t *testing.T) {
	f := newFixture(t)
	sch := schema.New(f.svc.db)
	var fields []model.FieldDefinition
	for _, key := range []string{"rack_tag", "purchase_note"} {
		field, err := sch.CreateField(f.ctx, schema.CreateFieldInput{
			Key: key, Label: key, Type: model.FieldText, IsUnique: key == "rack_tag", Searchable: true,
			CategoryIDs: []string{f.rootID},
		})
		if err != nil {
			t.Fatal(err)
		}
		fields = append(fields, field)
	}
	selectFixtureFields(t, f.svc.db, f.ctx, f.catID, fields[0].ID, fields[1].ID)
	a, err := f.save(t, SaveInput{Attrs: map[string]any{
		"mac": "001A2B3C4D5E", "rack_tag": "RACK-OLD", "purchase_note": "purchase memo",
	}})
	if err != nil {
		t.Fatal(err)
	}
	a, err = f.save(t, SaveInput{ID: a.ID, Version: a.Version, Attrs: map[string]any{
		"mac": "001A2B3C4D5E", "rack_tag": "RACK-NOW", "purchase_note": "purchase memo",
	}})
	if err != nil {
		t.Fatal(err)
	}
	before := preparedAssetState(t, f)
	err = f.svc.db.Write(f.ctx, func(ctx context.Context, tx *sql.Tx) error {
		oldSchema, err := schema.LoadSchemaSnapshot(ctx, tx)
		if err != nil {
			return err
		}
		var deltas []schema.FieldDelta
		for _, field := range fields {
			if _, err := tx.ExecContext(ctx, `DELETE FROM category_field_selections WHERE category_id = ? AND field_id = ?`, f.catID, field.ID); err != nil {
				return err
			}
			deltas = append(deltas, schema.FieldDelta{CategoryID: f.catID, FieldID: field.ID, Key: field.Key, Change: "removed"})
		}
		newSchema, err := schema.LoadSchemaSnapshot(ctx, tx)
		if err != nil {
			return err
		}
		plan, err := NewSchemaEffects().Plan(ctx, tx, schema.SchemaChange{Before: oldSchema, After: newSchema, Changes: deltas})
		if err != nil {
			return err
		}
		if len(plan.Issues) != 0 || !reflect.DeepEqual(plan.Assets, []schema.AssetImpact{{ID: a.ID, Version: a.Version}}) || plan.Apply == nil {
			t.Fatalf("withdrawal plan = %+v, want one ready asset impact", plan)
		}
		current, err := loadForUpdate(ctx, tx, a.ID)
		if err != nil {
			return err
		}
		if current.Version != a.Version || !reflect.DeepEqual(current.Attrs, a.Attrs) {
			t.Fatal("planning wrote the asset")
		}
		var live, searchable int
		if err := tx.QueryRowContext(ctx, `SELECT count(*) FROM asset_unique_values WHERE asset_id = ? AND field_key = 'rack_tag' AND archived_at IS NULL`, a.ID).Scan(&live); err != nil {
			return err
		}
		if err := tx.QueryRowContext(ctx, `SELECT count(*) FROM asset_search_values WHERE asset_id = ? AND field_key IN ('rack_tag', 'purchase_note')`, a.ID).Scan(&searchable); err != nil {
			return err
		}
		if live != 1 || searchable != 2 {
			t.Fatalf("planning changed indexes: live=%d search=%d", live, searchable)
		}
		return plan.Apply(ctx, tx)
	})
	if err != nil {
		t.Fatalf("withdrawal effects: %v", err)
	}
	got, err := scanAsset(f.svc.db.ReadDB().QueryRowContext(f.ctx, `SELECT `+assetCols+` FROM assets WHERE id = ?`, a.ID))
	if err != nil {
		t.Fatal(err)
	}
	if got.Version != a.Version+1 || !reflect.DeepEqual(got.Attrs, a.Attrs) {
		t.Fatalf("asset version/attrs = %d/%+v, want %d/%+v", got.Version, got.Attrs, a.Version+1, a.Attrs)
	}
	assertSchemaClaimRows(t, f, a.ID, "rack_tag", []claimRow{
		{"RACK-OLD", f.rootID, true, true}, {"RACK-NOW", f.rootID, true, true},
	})
	assertSchemaClaimRows(t, f, a.ID, "mac", []claimRow{{"001A2B3C4D5E", f.rootID, false, false}})
	var searchCount int
	if err := f.svc.db.ReadDB().QueryRowContext(f.ctx, `SELECT count(*) FROM asset_search_values WHERE asset_id = ? AND field_key IN ('rack_tag', 'purchase_note')`, a.ID).Scan(&searchCount); err != nil {
		t.Fatal(err)
	}
	if searchCount != 0 {
		t.Fatalf("withdrawn search rows = %d", searchCount)
	}
	after := preparedAssetState(t, f)
	if !reflect.DeepEqual(before["asset_transfers"], after["asset_transfers"]) {
		t.Fatal("schema withdrawal fabricated transfer events")
	}
}

// A failure rebuilding search must roll back metadata, versions and claims too.
func TestSchemaEffectsSearchFailureRollsBackWithdrawal(t *testing.T) {
	f := newFixture(t)
	a, err := f.save(t, SaveInput{Attrs: map[string]any{"mac": "001A2B3C4D5E", "firmware": "v1"}})
	if err != nil {
		t.Fatal(err)
	}
	before := preparedAssetState(t, f)
	var fieldID string
	if err := f.svc.db.ReadDB().QueryRowContext(f.ctx, `SELECT id FROM field_definitions WHERE key = 'firmware'`).Scan(&fieldID); err != nil {
		t.Fatal(err)
	}
	err = f.svc.db.Write(f.ctx, func(ctx context.Context, tx *sql.Tx) error {
		oldSchema, err := schema.LoadSchemaSnapshot(ctx, tx)
		if err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `DELETE FROM category_field_selections WHERE category_id = ? AND field_id = ?`, f.catID, fieldID); err != nil {
			return err
		}
		newSchema, err := schema.LoadSchemaSnapshot(ctx, tx)
		if err != nil {
			return err
		}
		plan, err := NewSchemaEffects().Plan(ctx, tx, schema.SchemaChange{
			Before: oldSchema, After: newSchema,
			Changes: []schema.FieldDelta{{CategoryID: f.catID, FieldID: fieldID, Key: "firmware", Change: "removed"}},
		})
		if err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `CREATE TEMP TRIGGER refuse_effect_search BEFORE INSERT ON asset_search_values
			BEGIN SELECT RAISE(ABORT, 'injected search failure'); END`); err != nil {
			return err
		}
		return plan.Apply(ctx, tx)
	})
	if err == nil || !strings.Contains(err.Error(), "injected search failure") {
		t.Fatalf("withdrawal failure = %v, want injected search failure", err)
	}
	if !reflect.DeepEqual(before, preparedAssetState(t, f)) {
		t.Fatalf("failed effects changed asset %s or its indexes/events", a.ID)
	}
	var selected int
	if err := f.svc.db.ReadDB().QueryRowContext(f.ctx, `SELECT count(*) FROM category_field_selections WHERE category_id = ? AND field_id = ?`, f.catID, fieldID).Scan(&selected); err != nil {
		t.Fatal(err)
	}
	if selected != 1 {
		t.Fatal("failed effects left metadata withdrawal committed")
	}
}

func TestSchemaEffectsApplyRejectsChangedAssetVersion(t *testing.T) {
	f := newFixture(t)
	a, err := f.save(t, SaveInput{Attrs: map[string]any{"mac": "001A2B3C4D5E"}})
	if err != nil {
		t.Fatal(err)
	}
	before := preparedAssetState(t, f)
	err = f.svc.db.Write(f.ctx, func(ctx context.Context, tx *sql.Tx) error {
		oldSchema, err := schema.LoadSchemaSnapshot(ctx, tx)
		if err != nil {
			return err
		}
		var fieldID string
		if err := tx.QueryRowContext(ctx, `SELECT id FROM field_definitions WHERE key = 'firmware'`).Scan(&fieldID); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `DELETE FROM category_field_selections WHERE category_id = ? AND field_id = ?`, f.catID, fieldID); err != nil {
			return err
		}
		newSchema, err := schema.LoadSchemaSnapshot(ctx, tx)
		if err != nil {
			return err
		}
		plan, err := NewSchemaEffects().Plan(ctx, tx, schema.SchemaChange{
			Before: oldSchema, After: newSchema,
			Changes: []schema.FieldDelta{{CategoryID: f.catID, FieldID: fieldID, Key: "firmware", Change: "removed"}},
		})
		if err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `UPDATE assets SET version = version + 1 WHERE id = ?`, a.ID); err != nil {
			return err
		}
		return plan.Apply(ctx, tx)
	})
	if !errors.Is(err, ErrVersionConflict) {
		t.Fatalf("apply after version change = %v, want version conflict", err)
	}
	if !reflect.DeepEqual(before, preparedAssetState(t, f)) {
		t.Fatal("stale effect left partial asset writes")
	}
}
