package asset

import (
	"context"
	"database/sql"
	"errors"
	"reflect"
	"slices"
	"testing"

	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/schema"
)

// Replacing an asset without changing the count, or changing validation inputs
// without changing a version, must invalidate rather than enlarge a confirmation.
func TestSchemaConfirmationBindsAssetIdentityAndValidationData(t *testing.T) {
	for _, scenario := range []string{"valid", "version", "identity", "raw", "claims"} {
		t.Run(scenario, func(t *testing.T) {
			f := newFixture(t)
			sch := schema.NewWithEffects(f.svc.db, NewSchemaEffects())
			field, err := sch.CreateField(f.ctx, schema.CreateFieldInput{Key: "rack_tag", Label: "Rack", Type: model.FieldText, IsUnique: true, CategoryIDs: []string{f.rootID}})
			if err != nil {
				t.Fatal(err)
			}
			base, err := sch.PreviewCategory(f.ctx, f.catID, schema.CategoryDraft{})
			if err != nil {
				t.Fatal(err)
			}
			selected := append(append([]string{}, base.SelectedFieldIDs...), field.ID)
			if _, err := sch.UpdateCategory(f.ctx, f.catID, schema.UpdateCategoryInput{InheritedFieldIDs: &selected}); err != nil {
				t.Fatal(err)
			}
			a, err := f.save(t, SaveInput{Attrs: map[string]any{"mac": "001A2B3C4D5E", "rack_tag": "RACK-A"}})
			if err != nil {
				t.Fatal(err)
			}
			draft := schema.CategoryDraft{InheritedFieldIDs: &base.SelectedFieldIDs}
			preview, err := sch.PreviewCategory(f.ctx, f.catID, draft)
			if err != nil || preview.ConfirmationToken == "" {
				t.Fatalf("preview=%+v %v", preview, err)
			}
			if scenario != "valid" {
				err = f.svc.db.Write(f.ctx, func(ctx context.Context, tx *sql.Tx) error {
					var err error
					switch scenario {
					case "version":
						_, err = tx.ExecContext(ctx, `UPDATE assets SET version=version+1 WHERE id=?`, a.ID)
					case "raw":
						_, err = tx.ExecContext(ctx, `UPDATE assets SET attrs=json_set(attrs,'$.rack_tag','OTHER') WHERE id=?`, a.ID)
					case "identity":
						// A legitimate delete/recreate keeps the count but changes the UUID.
						if _, err = tx.ExecContext(ctx, `DELETE FROM asset_transfers WHERE asset_id=?`, a.ID); err != nil {
							return err
						}
						if _, err = tx.ExecContext(ctx, `DELETE FROM asset_unique_values WHERE asset_id=?`, a.ID); err != nil {
							return err
						}
						if _, err = tx.ExecContext(ctx, `DELETE FROM asset_search_values WHERE asset_id=?`, a.ID); err != nil {
							return err
						}
						_, err = tx.ExecContext(ctx, `UPDATE assets SET id='replacement-asset' WHERE id=?`, a.ID)
					case "claims":
						_, err = tx.ExecContext(ctx, `UPDATE asset_unique_values SET value='OTHER' WHERE asset_id=? AND field_key='rack_tag'`, a.ID)
					}
					return err
				})
				if err != nil {
					t.Fatal(err)
				}
			}
			before := preparedAssetState(t, f)
			_, err = sch.UpdateCategory(f.ctx, f.catID, schema.UpdateCategoryInput{InheritedFieldIDs: &base.SelectedFieldIDs, ConfirmationToken: preview.ConfirmationToken})
			if scenario != "valid" {
				if !errors.Is(err, schema.ErrImpactStale) {
					t.Fatalf("stale confirmation accepted: %v", err)
				}
				if !reflect.DeepEqual(before, preparedAssetState(t, f)) {
					t.Fatal("stale confirmation wrote assets")
				}
				current, e := sch.PreviewCategory(f.ctx, f.catID, schema.CategoryDraft{})
				slices.Sort(selected)
				if e != nil || !reflect.DeepEqual(current.SelectedFieldIDs, selected) {
					t.Fatalf("stale wrote choices: %+v %v", current, e)
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			got, err := f.svc.Get(f.ctx, a.ID)
			if err != nil || got.Version != a.Version+1 || got.ArchivedAttrs["rack_tag"] != "RACK-A" {
				t.Fatalf("withdrawn=%+v %v", got, err)
			}
			assertSchemaClaimRows(t, f, a.ID, field.Key, []claimRow{{"RACK-A", f.rootID, true, true}})
		})
	}
}
