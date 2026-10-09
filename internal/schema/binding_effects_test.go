package schema_test

import (
	"context"
	"database/sql"
	"errors"
	"path/filepath"
	"testing"

	"github.com/klskk23/nexus-assets/internal/asset"
	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/schema"
	"github.com/klskk23/nexus-assets/internal/store"
)

// These tests assemble the real asset effects implementation: a successful
// binding must materialize values and indexes, not merely call an adapter.
func TestCategoryBindingMaterializesRealEffects(t *testing.T) {
	for _, entry := range []string{"bind", "create-field", "bind-group", "create-group"} {
		t.Run(entry, func(t *testing.T) {
			db, sch, ctx, category := bindingEffectFixture(t)
			in := schema.CreateFieldInput{Key: "tag", Label: "Tag", Type: model.FieldText, IsUnique: true, Required: true}
			if entry == "create-field" {
				in.CategoryIDs = []string{category}
				if _, err := sch.CreateField(ctx, in); err != nil {
					t.Fatal(err)
				}
			} else {
				field, err := sch.CreateField(ctx, in)
				if err != nil {
					t.Fatal(err)
				}
				switch entry {
				case "bind":
					err = sch.Bind(ctx, category, field.ID, 10)
				case "bind-group":
					group, e := sch.CreateGroup(ctx, schema.CreateGroupInput{Name: "Group", FieldIDs: []string{field.ID}})
					if e != nil {
						t.Fatal(e)
					}
					err = sch.BindGroup(ctx, schema.BindToCategory, category, group.ID)
				case "create-group":
					_, err = sch.CreateGroup(ctx, schema.CreateGroupInput{Name: "Group", FieldIDs: []string{field.ID}, GroupTargets: schema.GroupTargets{CategoryIDs: []string{category}}})
				}
				if err != nil {
					t.Fatal(err)
				}
			}
			assertBindingMaterialized(t, db, ctx, category, 2)
		})
	}
}

func TestDirectUnbindRealEffectsAreAtomicAndConfirmed(t *testing.T) {
	db, sch, ctx, category := bindingEffectFixture(t)
	field, err := sch.CreateField(ctx, schema.CreateFieldInput{Key: "tag", Label: "Tag", Type: model.FieldText, IsUnique: true, CategoryIDs: []string{category}})
	if err != nil {
		t.Fatal(err)
	}
	preview, err := sch.PreviewUnbind(ctx, category, field.ID)
	if err != nil || preview.AssetCount != 1 || !preview.RequiresConfirmation {
		t.Fatalf("preview: %+v %v", preview, err)
	}
	if err := sch.Unbind(ctx, category, field.ID); !errors.Is(err, schema.ErrConfirmationRequired) {
		t.Fatalf("unconfirmed unbind: %v", err)
	}
	assertBindingMaterialized(t, db, ctx, category, 2)
	// A failure after the source deletion must roll the source and all effects back.
	bindingExec(t, db, ctx, `CREATE TRIGGER reject_binding_search BEFORE DELETE ON asset_search_values BEGIN SELECT RAISE(ABORT,'blocked'); END`)
	if err := sch.UnbindConfirmed(ctx, category, field.ID, preview.ConfirmationToken); err == nil {
		t.Fatal("effect failure accepted")
	}
	assertBindingMaterialized(t, db, ctx, category, 2)
	fields, err := sch.EffectiveFields(ctx, category)
	if err != nil || len(fields) != 1 {
		t.Fatalf("failed effects removed binding: %+v %v", fields, err)
	}
	bindingExec(t, db, ctx, `DROP TRIGGER reject_binding_search`)
	if err := sch.UnbindConfirmed(ctx, category, field.ID, preview.ConfirmationToken); err != nil {
		t.Fatal(err)
	}
	var value string
	var version, live, search, suppressed int
	if err := db.ReadDB().QueryRowContext(ctx, `SELECT json_extract(attrs,'$.tag'),version FROM assets WHERE id='asset'`).Scan(&value, &version); err != nil {
		t.Fatal(err)
	}
	if err := db.ReadDB().QueryRowContext(ctx, `SELECT count(*) FROM asset_unique_values WHERE archived_at IS NULL`).Scan(&live); err != nil {
		t.Fatal(err)
	}
	if err := db.ReadDB().QueryRowContext(ctx, `SELECT count(*) FROM asset_unique_values WHERE search_suppressed=1`).Scan(&suppressed); err != nil {
		t.Fatal(err)
	}
	if err := db.ReadDB().QueryRowContext(ctx, `SELECT count(*) FROM asset_search_values`).Scan(&search); err != nil {
		t.Fatal(err)
	}
	if value != "ABC" || version != 3 || live != 0 || search != 0 || suppressed != 1 {
		t.Fatalf("withdrawal state value/version/live/search/suppressed=%s/%d/%d/%d/%d", value, version, live, search, suppressed)
	}
}

func TestDirectUnbindRealAssetMutationInvalidatesToken(t *testing.T) {
	db, sch, ctx, category := bindingEffectFixture(t)
	field, err := sch.CreateField(ctx, schema.CreateFieldInput{Key: "tag", Label: "Tag", Type: model.FieldText, IsUnique: true, CategoryIDs: []string{category}})
	if err != nil {
		t.Fatal(err)
	}
	preview, err := sch.PreviewUnbind(ctx, category, field.ID)
	if err != nil {
		t.Fatal(err)
	}
	// Even a legacy write that misses version must invalidate its validation input.
	bindingExec(t, db, ctx, `UPDATE assets SET note='Changed' WHERE id='asset'`)
	if err := sch.UnbindConfirmed(ctx, category, field.ID, preview.ConfirmationToken); !errors.Is(err, schema.ErrImpactStale) {
		t.Fatalf("stale asset accepted: %v", err)
	}
	assertBindingMaterialized(t, db, ctx, category, 2)
}

func bindingEffectFixture(t *testing.T) (*store.Store, *schema.Store, context.Context, string) {
	t.Helper()
	ctx := context.Background()
	db, err := store.Open(filepath.Join(t.TempDir(), "bindings.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := db.Close(); err != nil {
			t.Error(err)
		}
	})
	if err := db.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	sch := schema.NewWithEffects(db, asset.NewSchemaEffects())
	cat, err := sch.CreateCategory(ctx, schema.CreateCategoryInput{Code: "ROOT", Name: "Root"})
	if err != nil {
		t.Fatal(err)
	}
	bindingExec(t, db, ctx, `INSERT INTO users(id,email,name,auth_type,created_at,updated_at) VALUES('user','binding@example.com','User','local','2026-10-08T00:00:00Z','2026-10-08T00:00:00Z')`)
	bindingExec(t, db, ctx, `INSERT INTO assets(id,category_id,status,owner_id,holder_type,holder_id,attrs,created_at,updated_at) VALUES('asset',?,'in_stock','user','user','user','{"tag":"ABC"}','2026-10-08T00:00:00Z','2026-10-08T00:00:00Z')`, cat.ID)
	return db, sch, ctx, cat.ID
}

func bindingExec(t *testing.T, db *store.Store, ctx context.Context, query string, args ...any) {
	t.Helper()
	if err := db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error { _, err := tx.ExecContext(ctx, query, args...); return err }); err != nil {
		t.Fatal(err)
	}
}

func assertBindingMaterialized(t *testing.T, db *store.Store, ctx context.Context, category string, wantVersion int) {
	t.Helper()
	var version int
	var value, scope string
	if err := db.ReadDB().QueryRowContext(ctx, `SELECT version FROM assets WHERE id='asset'`).Scan(&version); err != nil {
		t.Fatal(err)
	}
	if err := db.ReadDB().QueryRowContext(ctx, `SELECT value,scope_id FROM asset_unique_values WHERE asset_id='asset' AND field_key='tag' AND archived_at IS NULL AND search_suppressed=0`).Scan(&value, &scope); err != nil {
		t.Fatal(err)
	}
	if version != wantVersion || value != "ABC" || scope != category {
		t.Fatalf("materialized version/value/scope=%d/%s/%s", version, value, scope)
	}
	if err := db.ReadDB().QueryRowContext(ctx, `SELECT value FROM asset_search_values WHERE asset_id='asset' AND field_key='tag'`).Scan(&value); err != nil || value != "ABC" {
		t.Fatalf("search=%s err=%v", value, err)
	}
}
