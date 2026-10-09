package asset

import (
	"context"
	"database/sql"
	"fmt"
	"testing"

	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/schema"
)

func TestAttrFilterInheritanceExcludesArchivedValuesAndKeepsPageCount(t *testing.T) {
	f := newFixture(t)
	field, err := f.schema.CreateField(f.ctx, schema.CreateFieldInput{Key: "filter_tag", Label: "Tag", Type: model.FieldText, CategoryIDs: []string{f.rootID}})
	if err != nil {
		t.Fatal(err)
	}
	selectFixtureFields(t, f.svc.db, f.ctx, f.catID, field.ID)
	archived, err := f.save(t, SaveInput{Attrs: map[string]any{"mac": "001A2B3C4D5E", "filter_tag": "same"}})
	if err != nil {
		t.Fatal(err)
	}
	rootAsset, err := f.save(t, SaveInput{CategoryID: f.rootID, Attrs: map[string]any{"mac": "001A2B3C4D5F", "filter_tag": "same"}})
	if err != nil {
		t.Fatal(err)
	}
	if err = f.svc.db.Write(f.ctx, func(ctx context.Context, tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `DELETE FROM category_field_selections WHERE category_id=? AND field_id=?`, f.catID, field.ID)
		return err
	}); err != nil {
		t.Fatal(err)
	}
	result, err := f.svc.List(f.ctx, ListFilter{AttrFilters: map[string]string{"filter_tag": "same"}, Limit: 1})
	if err != nil || result.Total != 1 || len(result.Items) != 1 || result.Items[0].ID != rootAsset.ID {
		t.Fatalf("live-only filter=%+v err=%v (archived %s)", result, err, archived.ID)
	}
	result, err = f.svc.List(f.ctx, ListFilter{AttrFilters: map[string]string{"filter_tag": "same"}, Limit: 1, Offset: 1})
	if err != nil || result.Total != 1 || len(result.Items) != 0 {
		t.Fatalf("second page=%+v err=%v", result, err)
	}
}

func TestAttrFilterInheritanceUsesActualModelsAndAllSameKeyDefinitions(t *testing.T) {
	f := newFixture(t)
	var models []model.ProductModel
	for i := 0; i < 3; i++ {
		m, err := f.schema.CreateModel(f.ctx, schema.CreateModelInput{Name: fmt.Sprintf("Model-%d", i)})
		if err != nil {
			t.Fatal(err)
		}
		models = append(models, m)
	}
	for _, m := range models[:2] {
		if _, err := f.schema.CreateField(f.ctx, schema.CreateFieldInput{Key: "device_tag", Label: "Tag", Type: model.FieldText, ModelIDs: []string{m.ID}}); err != nil {
			t.Fatal(err)
		}
	}
	for i, m := range models {
		a, err := f.save(t, SaveInput{ModelID: &m.ID, Attrs: map[string]any{"mac": fmt.Sprintf("001A2B3C4D%02X", i)}})
		if err != nil {
			t.Fatal(err)
		}
		if err = f.svc.db.Write(f.ctx, func(ctx context.Context, tx *sql.Tx) error {
			_, err := tx.ExecContext(ctx, `UPDATE assets SET attrs=json_set(attrs,'$.device_tag','same') WHERE id=?`, a.ID)
			return err
		}); err != nil {
			t.Fatal(err)
		}
	}
	result, err := f.svc.List(f.ctx, ListFilter{AttrFilters: map[string]string{"device_tag": "same"}})
	if err != nil || result.Total != 2 {
		t.Fatalf("actual device reach=%+v err=%v", result, err)
	}
	for _, a := range result.Items {
		if a.ModelID != nil && *a.ModelID == models[2].ID {
			t.Fatal("unbound model's archived value matched")
		}
	}
}

func TestAttrFilterInheritanceLargeReachUsesBoundSets(t *testing.T) {
	f := newFixture(t)
	field, err := f.schema.CreateField(f.ctx, schema.CreateFieldInput{Key: "many_tag", Label: "Tag", Type: model.FieldText, CategoryIDs: []string{f.rootID}})
	if err != nil {
		t.Fatal(err)
	}
	if err = f.svc.db.Write(f.ctx, func(ctx context.Context, tx *sql.Tx) error {
		var parentPath string
		if err := tx.QueryRowContext(ctx, `SELECT path FROM categories WHERE id=?`, f.rootID).Scan(&parentPath); err != nil {
			return err
		}
		for i := 0; i < 1200; i++ {
			id := fmt.Sprintf("large-category-%04d", i)
			if _, err := tx.ExecContext(ctx, `INSERT INTO categories(id,parent_id,path,code,name,created_at,updated_at) VALUES(?,?,?,?,?,'2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')`, id, f.rootID, parentPath+id+"/", id, id); err != nil {
				return err
			}
			if _, err := tx.ExecContext(ctx, `INSERT INTO category_field_selections(category_id,field_id) VALUES(?,?)`, id, field.ID); err != nil {
				return err
			}
		}
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	if _, err = f.save(t, SaveInput{CategoryID: f.rootID, Attrs: map[string]any{"mac": "001A2B3C4D5E", "many_tag": "x' OR 1=1 --"}}); err != nil {
		t.Fatal(err)
	}
	result, err := f.svc.List(f.ctx, ListFilter{AttrFilters: map[string]string{"many_tag": "x' OR 1=1 --"}})
	if err != nil || result.Total != 1 {
		t.Fatalf("large parameterized reach=%+v err=%v", result, err)
	}
}
