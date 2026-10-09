package schema

import (
	"context"
	"database/sql"
	"encoding/hex"
	"errors"
	"reflect"
	"testing"
	"time"
)

func seedAssetSnapshot(t *testing.T, s *Store, ctx context.Context) {
	t.Helper()
	seedSnapshot(t, s, ctx)
	snapshotExec(t, s, ctx,
		`UPDATE categories SET display_key='tag', print_preset_ids='["label"]' WHERE id='leaf'`,
		`INSERT INTO vendors (id,name,created_at,updated_at) VALUES ('v','Vendor','2026-10-08T00:00:00Z','2026-10-08T00:00:00Z'),('other-v','Other','2026-10-08T00:00:00Z','2026-10-08T00:00:00Z')`,
		`INSERT INTO product_models (id,name,vendor_id,attr_defaults,created_at,updated_at) VALUES ('m','Model','v','{"ports":8,"nested":{"list":[{"value":"original"}]}}','2026-10-08T00:00:00Z','2026-10-08T00:00:00Z'),('aaa','Other','other-v','{}','2026-10-08T00:00:00Z','2026-10-08T00:00:00Z')`,
		`INSERT INTO field_definitions (id,key,label,type,options,created_at,updated_at) VALUES ('dev','serial','Serial','text','{}','2026-10-08T00:00:00Z','2026-10-08T00:00:00Z'),('dev2','rating','Rating','number','{}','2026-10-08T00:00:00Z','2026-10-08T00:00:00Z')`,
		`INSERT INTO model_fields (model_id,field_id,sort) VALUES ('m','dev',10),('m','dev2',20)`,
		`INSERT INTO vendor_fields (vendor_id,field_id,sort) VALUES ('v','dev',10)`)
}

func snapshotExec(t *testing.T, s *Store, ctx context.Context, queries ...string) {
	t.Helper()
	if err := s.db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		for _, query := range queries {
			if _, err := tx.ExecContext(ctx, query); err != nil {
				return err
			}
		}
		return nil
	}); err != nil {
		t.Fatal(err)
	}
}

func assetSnapshot(t *testing.T, s *Store, ctx context.Context) *SchemaSnapshot {
	t.Helper()
	snap, err := s.Snapshot(ctx)
	if err != nil {
		t.Fatal(err)
	}
	return snap
}

func resolvedAsset(t *testing.T, snap *SchemaSnapshot, modelID *string) AssetSchema {
	t.Helper()
	got, err := snap.AssetSchema("leaf", modelID)
	if err != nil {
		t.Fatal(err)
	}
	return got
}

func TestSnapshotAssetSchemaResolvesLoadedInputs(t *testing.T) {
	s, ctx := newStore(t)
	seedAssetSnapshot(t, s, ctx)
	snap := assetSnapshot(t, s, ctx)
	id := "m"
	got := resolvedAsset(t, snap, &id)
	if got.Category.ID != "leaf" || got.Category.DisplayKey != "tag" || got.Model == nil || got.Model.Name != "Model" || got.Model.VendorName != "Vendor" || got.Model.AttrDefaults["ports"] != float64(8) {
		t.Fatalf("missing loaded inputs: %+v", got)
	}
	if ids := snapshotIDs(got.Fields); !reflect.DeepEqual(ids, []string{"a", "c", "d", "dev", "dev2"}) {
		t.Fatalf("actual asset fields = %v", ids)
	}
	if got.Fields[0].InheritedFrom != "root" || got.Fields[1].InheritedFrom != "child" {
		t.Fatalf("lost original category sources: %+v", got.Fields)
	}
	if digest, err := hex.DecodeString(got.Fingerprint); err != nil || len(digest) != 32 {
		t.Fatalf("not a SHA-256 fingerprint: %q", got.Fingerprint)
	}
	without := resolvedAsset(t, snap, nil)
	if without.Model != nil || !reflect.DeepEqual(snapshotIDs(without.Fields), []string{"a", "c", "d"}) || without.Fingerprint == got.Fingerprint {
		t.Fatalf("model-free schema = %+v", without)
	}
	snapshotExec(t, s, ctx, `UPDATE product_models SET name='Changed' WHERE id='m'`, `UPDATE categories SET name='Changed' WHERE id='leaf'`)
	if again := resolvedAsset(t, snap, &id); !reflect.DeepEqual(again, got) {
		t.Fatal("loaded snapshot queried newer inputs")
	}
	for _, tc := range []struct {
		category string
		model    *string
	}{{"missing", nil}, {"leaf", new("missing")}, {"leaf", new("")}} {
		if _, err := snap.AssetSchema(tc.category, tc.model); !errors.Is(err, ErrNotFound) {
			t.Fatalf("unknown input error = %v", err)
		}
	}
}

func TestSnapshotAssetFingerprintTracksRelevantChanges(t *testing.T) {
	cases := []struct {
		name    string
		queries []string
	}{
		{"category code", []string{`UPDATE categories SET code='NEW' WHERE id='leaf'`}},
		{"category name", []string{`UPDATE categories SET name='New' WHERE id='leaf'`}},
		{"category path", []string{`UPDATE categories SET path='/new/leaf/' WHERE id='leaf'`}},
		{"category parent", []string{`UPDATE categories SET parent_id='root' WHERE id='leaf'`, `DELETE FROM category_field_selections WHERE category_id='leaf' AND field_id='c'`}},
		{"display key", []string{`UPDATE categories SET display_key='' WHERE id='leaf'`}},
		{"field identity", []string{`DELETE FROM category_fields WHERE field_id='d'`, `INSERT INTO field_definitions(id,key,label,type,options,created_at,updated_at) SELECT 'replacement',key,label,type,options,created_at,updated_at FROM field_definitions WHERE id='d'`, `INSERT INTO category_fields(category_id,field_id,sort) VALUES('leaf','replacement',0)`}},
		{"field key", []string{`UPDATE field_definitions SET key='new_tag' WHERE id='a'`}},
		{"field type", []string{`UPDATE field_definitions SET type='number' WHERE id='a'`}},
		{"required", []string{`UPDATE field_definitions SET required=0 WHERE id='a'`}},
		{"unique", []string{`UPDATE field_definitions SET is_unique=0 WHERE id='a'`}},
		{"searchable", []string{`UPDATE field_definitions SET searchable=1 WHERE id='c'`}},
		{"validation", []string{`UPDATE field_definitions SET options='{"min":2,"max":48,"precision":0}' WHERE id='c'`}},
		{"computed expression", []string{`UPDATE field_definitions SET type='computed',options='{"template":"attrs.ports + 1"}' WHERE id='d'`}},
		{"category source", []string{`DELETE FROM category_fields WHERE category_id='root' AND field_id='a'`, `DELETE FROM category_field_selections WHERE category_id='child' AND field_id='a'`, `INSERT INTO category_fields(category_id,field_id,sort) VALUES('child','a',10)`}},
		{"category sort", []string{`UPDATE category_fields SET sort=11 WHERE category_id='root' AND field_id='a'`}},
		{"selection", []string{`DELETE FROM category_field_selections WHERE category_id='leaf' AND field_id='c'`}},
		{"model name", []string{`UPDATE product_models SET name='New model' WHERE id='m'`}},
		{"vendor identity", []string{`UPDATE product_models SET vendor_id='other-v' WHERE id='m'`}},
		{"vendor name", []string{`UPDATE vendors SET name='New vendor' WHERE id='v'`}},
		{"defaults", []string{`UPDATE product_models SET attr_defaults='{"ports":16}' WHERE id='m'`}},
		{"device sort", []string{`UPDATE model_fields SET sort=30 WHERE model_id='m' AND field_id='dev'`}},
		{"remove redundant direct source", []string{`DELETE FROM model_fields WHERE model_id='m' AND field_id='dev'`}},
		{"remove redundant vendor source", []string{`DELETE FROM vendor_fields WHERE vendor_id='v' AND field_id='dev'`}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			s, ctx := newStore(t)
			seedAssetSnapshot(t, s, ctx)
			id := "m"
			before := resolvedAsset(t, assetSnapshot(t, s, ctx), &id)
			snapshotExec(t, s, ctx, tc.queries...)
			after := resolvedAsset(t, assetSnapshot(t, s, ctx), &id)
			if before.Fingerprint == after.Fingerprint {
				t.Fatalf("%s did not invalidate fingerprint", tc.name)
			}
		})
	}
}

func TestSnapshotAssetFingerprintIgnoresUnrelatedChanges(t *testing.T) {
	cases := []struct {
		name  string
		query string
	}{
		{"timestamps", `UPDATE categories SET updated_at='2026-10-09T00:00:00Z'; UPDATE field_definitions SET updated_at='2026-10-09T00:00:00Z'; UPDATE product_models SET updated_at='2026-10-09T00:00:00Z'; UPDATE vendors SET updated_at='2026-10-09T00:00:00Z'`},
		{"unselected field", `UPDATE field_definitions SET required=1, options='{"regex":"new"}' WHERE id='b'`},
		{"unrelated category", `UPDATE categories SET name='New sibling' WHERE id='sibling'`},
		{"unrelated model", `UPDATE product_models SET name='Other changed',attr_defaults='{"ports":32}' WHERE id='aaa'`},
		{"unrelated vendor", `UPDATE vendors SET name='Other changed' WHERE id='other-v'`},
		{"other model reach and order", `INSERT INTO model_fields(model_id,field_id,sort) VALUES ('aaa','dev',99)`},
		{"other vendor reach and order", `INSERT INTO vendor_fields(vendor_id,field_id,sort) VALUES ('other-v','dev',99)`},
		{"defaults JSON key order", `UPDATE product_models SET attr_defaults='{"nested":{"list":[{"value":"original"}]},"ports":8}' WHERE id='m'`},
		{"new sibling model", `INSERT INTO product_models(id,name,vendor_id,created_at,updated_at) VALUES ('new','New','v','2026-10-08T00:00:00Z','2026-10-08T00:00:00Z')`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			s, ctx := newStore(t)
			seedAssetSnapshot(t, s, ctx)
			id := "m"
			before := resolvedAsset(t, assetSnapshot(t, s, ctx), &id)
			snapshotExec(t, s, ctx, tc.query)
			after := resolvedAsset(t, assetSnapshot(t, s, ctx), &id)
			if before.Fingerprint == "" || before.Fingerprint != after.Fingerprint {
				t.Fatalf("%s changed relevant fingerprint: %q -> %q", tc.name, before.Fingerprint, after.Fingerprint)
			}
			if !reflect.DeepEqual(snapshotIDs(before.Fields), snapshotIDs(after.Fields)) {
				t.Fatal("unrelated binding changed actual asset field order")
			}
		})
	}
}

func TestSnapshotAssetAndListsAreIsolatedCopies(t *testing.T) {
	s, ctx := newStore(t)
	seedAssetSnapshot(t, s, ctx)
	snapshotExec(t, s, ctx, `UPDATE product_models SET archived_at='2026-10-08T00:00:00Z' WHERE id='aaa'`)
	snap := assetSnapshot(t, s, ctx)
	id := "m"
	original := resolvedAsset(t, snap, &id)
	if original.Model == nil || original.Category.ParentID == nil || len(original.Fields) != 5 {
		t.Fatalf("missing copyable schema: %+v", original)
	}
	changed := resolvedAsset(t, snap, &id)
	*changed.Category.ParentID = "corrupt"
	changed.Category.PrintPresetIDs[0] = "corrupt"
	changed.Model.AttrDefaults["nested"].(map[string]any)["list"].([]any)[0].(map[string]any)["value"] = "corrupt"
	changed.Model.Name = "corrupt"
	*changed.Fields[1].Options.Min = 999
	*changed.Fields[1].Options.Max = 999
	*changed.Fields[1].Options.Precision = 9
	changed.Fields[3].ModelIDs[0] = "corrupt"
	changed.Fields[3].VendorIDs[0] = "corrupt"
	changed.Fields[0].Key = "corrupt"
	if got := resolvedAsset(t, snap, &id); !reflect.DeepEqual(got, original) {
		t.Fatal("AssetSchema exposed mutable snapshot state")
	}
	cats, models, vendors := snap.Categories(), snap.Models(), snap.Vendors()
	if len(cats) != 4 || len(models) != 2 || len(vendors) != 2 {
		t.Fatalf("incomplete lookup lists: %d %d %d", len(cats), len(models), len(vendors))
	}
	if models[0].ID != "aaa" || models[0].ArchivedAt == nil || models[1].ID != "m" || vendors[0].ID != "other-v" || vendors[1].ID != "v" {
		t.Fatalf("unstable lists or archived model dropped: %+v %+v", models, vendors)
	}
	if got := []string{cats[0].ID, cats[1].ID, cats[2].ID, cats[3].ID}; !reflect.DeepEqual(got, []string{"root", "child", "leaf", "sibling"}) {
		t.Fatalf("categories not ordered by path: %v", got)
	}
	for range 20 {
		if !reflect.DeepEqual(cats, snap.Categories()) || !reflect.DeepEqual(models, snap.Models()) || !reflect.DeepEqual(vendors, snap.Vendors()) {
			t.Fatal("lookup order is unstable")
		}
	}
	*cats[2].ParentID = "corrupt"
	cats[2].PrintPresetIDs[0] = "corrupt"
	*models[0].ArchivedAt = time.Time{}
	models[1].AttrDefaults["nested"].(map[string]any)["list"].([]any)[0].(map[string]any)["value"] = "corrupt"
	vendors[1].Name = "corrupt"
	if got := resolvedAsset(t, snap, &id); !reflect.DeepEqual(got, original) {
		t.Fatal("lookup lists exposed mutable snapshot state")
	}
	if snap.Models()[0].ArchivedAt.IsZero() {
		t.Fatal("archived pointer exposed mutable snapshot state")
	}
	cat, err := snap.Category("leaf")
	if err != nil {
		t.Fatal(err)
	}
	*cat.ParentID = "corrupt"
	cat.PrintPresetIDs[0] = "corrupt"
	if got := resolvedAsset(t, snap, &id); !reflect.DeepEqual(got, original) {
		t.Fatal("category lookup exposed mutable snapshot state")
	}
	if _, err := snap.Category("missing"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("missing category error = %v", err)
	}
}
