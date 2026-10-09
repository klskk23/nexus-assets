package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"reflect"
	"strings"
	"testing"

	"github.com/klskk23/nexus-assets/internal/asset"
	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/schema"
	"github.com/klskk23/nexus-assets/internal/store"
)

func TestVerifyDeviceIndexesAndEmptyValues(t *testing.T) {
	a, user, holder := newApp(t)
	ctx := context.Background()
	cat, _, _ := verifyIDs(t, a)
	vendor, err := a.schema.CreateVendor(ctx, "Devices")
	if err != nil {
		t.Fatal(err)
	}
	m, err := a.schema.CreateModel(ctx, schema.CreateModelInput{Name: "Model", VendorID: vendor.ID})
	if err != nil {
		t.Fatal(err)
	}
	for _, in := range []schema.CreateFieldInput{
		{Key: "tag", Label: "Tag", Type: model.FieldText, IsUnique: true, VendorIDs: []string{vendor.ID}},
		{Key: "search", Label: "Search", Type: model.FieldText, Searchable: true, ModelIDs: []string{m.ID}},
		{Key: "empty", Label: "Empty", Type: model.FieldText, IsUnique: true, ModelIDs: []string{m.ID}},
		{Key: "missing", Label: "Missing", Type: model.FieldText, IsUnique: true, ModelIDs: []string{m.ID}},
	} {
		if _, err := a.schema.CreateField(ctx, in); err != nil {
			t.Fatal(err)
		}
	}
	saved, err := a.assets.Save(ctx, asset.SaveInput{CategoryID: cat, ModelID: &m.ID, Status: model.StatusInStock, OwnerID: user, Holder: model.Holder{Type: model.HolderTypeEntity, ID: holder}, ActorID: user, Attrs: map[string]any{"tag": " DEVICE-1 ", "search": " words ", "empty": " "}})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := a.schema.CreateField(ctx, schema.CreateFieldInput{Key: "label", Label: "Label", Type: model.FieldText, CategoryIDs: []string{cat}}); err != nil {
		t.Fatal(err)
	}
	verifyExec(t, a, `UPDATE categories SET display_key='label' WHERE id=?`, cat)
	if err := runVerify(ctx, a); err != nil {
		t.Fatal(err)
	}
	verifyExec(t, a, `DELETE FROM asset_unique_values WHERE asset_id=? AND field_key='tag'`, saved.ID)
	if err := runVerify(ctx, a); err == nil {
		t.Fatal("missing vendor claim reconciled")
	}
}

func TestVerifyReportsReadFailures(t *testing.T) {
	for _, table := range []string{"category_field_selections", "assets", "asset_transfers", "asset_unique_values", "asset_search_values"} {
		t.Run(table, func(t *testing.T) {
			a, _, _ := newApp(t)
			verifyExec(t, a, `ALTER TABLE `+table+` RENAME TO unavailable`)
			err := runVerify(context.Background(), a)
			if err == nil || !strings.Contains(err.Error(), "no such table") {
				t.Fatalf("missing %s: %v", table, err)
			}
		})
	}
}

func TestVerifyRejectsInvalidAssetJSON(t *testing.T) {
	a, _, _ := newApp(t)
	verifyExec(t, a, `UPDATE assets SET attrs='{'`)
	if err := runVerify(context.Background(), a); err == nil || !strings.Contains(err.Error(), "decode asset") {
		t.Fatalf("invalid attrs: %v", err)
	}
}

func TestVerifyRetainsEventFailureChecks(t *testing.T) {
	for _, tc := range []struct{ name, query string }{
		{"first not create", `UPDATE asset_transfers SET kind='transfer'`},
		{"missing owner", `UPDATE assets SET owner_id=''`},
	} {
		t.Run(tc.name, func(t *testing.T) {
			a, _, _ := newApp(t)
			// Disable foreign keys only on this write connection to model external corruption.
			conn, err := a.db.WriteDBForTest().Conn(context.Background())
			if err != nil {
				t.Fatal(err)
			}
			if _, err := conn.ExecContext(context.Background(), `PRAGMA foreign_keys=OFF`); err != nil {
				t.Fatal(err)
			}
			if _, err := conn.ExecContext(context.Background(), tc.query); err != nil {
				t.Fatal(err)
			}
			if _, err := conn.ExecContext(context.Background(), `PRAGMA foreign_keys=ON`); err != nil {
				t.Fatal(err)
			}
			if err := conn.Close(); err != nil {
				t.Fatal(err)
			}
			if err := runVerify(context.Background(), a); err == nil {
				t.Fatal("event corruption reconciled")
			}
		})
	}
}

func TestVerifyDoesNotRepairData(t *testing.T) {
	a, _, _ := newApp(t)
	verifyExec(t, a, `DELETE FROM asset_search_values`)
	before := verifyDatabaseState(t, a)
	if err := runVerify(context.Background(), a); err == nil {
		t.Fatal("expected missing search rows")
	}
	if after := verifyDatabaseState(t, a); !reflect.DeepEqual(before, after) {
		t.Fatal("verify changed persistent data")
	}
}

func verifyDatabaseState(t *testing.T, a *app) map[string]string {
	t.Helper()
	result := map[string]string{}
	for _, table := range []string{"categories", "category_fields", "category_field_selections", "field_definitions", "assets", "asset_unique_values", "asset_search_values", "asset_transfers", "audit_log"} {
		rows, err := a.db.ReadDB().Query(`SELECT * FROM ` + table + ` ORDER BY rowid`)
		if err != nil {
			t.Fatal(err)
		}
		cols, err := rows.Columns()
		if err != nil {
			t.Fatal(err)
		}
		values := make([]any, len(cols))
		ptrs := make([]any, len(cols))
		for i := range values {
			ptrs[i] = &values[i]
		}
		var all [][]any
		for rows.Next() {
			if err := rows.Scan(ptrs...); err != nil {
				t.Fatal(err)
			}
			all = append(all, append([]any(nil), values...))
		}
		if err := rows.Err(); err != nil {
			t.Fatal(err)
		}
		rows.Close()
		encoded, err := json.Marshal(all)
		if err != nil {
			t.Fatal(err)
		}
		result[table] = string(encoded)
	}
	return result
}

// Interpose a deterministic writer at a query boundary, but execute every read
// against the real SQLite read transaction rather than mocked results.
type verifyInterleavingQuerier struct {
	store.Querier
	once func()
}

func (q *verifyInterleavingQuerier) QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error) {
	if q.once != nil && strings.Contains(query, "FROM assets a") {
		write := q.once
		q.once = nil
		write()
	}
	return q.Querier.QueryContext(ctx, query, args...)
}

func TestVerifyUsesOneSQLiteSnapshot(t *testing.T) {
	a, _, _ := newApp(t)
	ctx := context.Background()
	err := a.db.ReadTx(ctx, func(ctx context.Context, q store.Querier) error {
		return verifyDatabase(ctx, &verifyInterleavingQuerier{Querier: q, once: func() { verifyExec(t, a, `DELETE FROM asset_search_values`) }})
	})
	if err != nil {
		t.Fatalf("verification mixed committed snapshots: %v", err)
	}
	if err := runVerify(ctx, a); err == nil {
		t.Fatal("next verification did not see committed corruption")
	}
}

func TestVerifyDetectsMissingReferences(t *testing.T) {
	for _, tc := range []struct{ name, query string }{
		{"asset category", `UPDATE assets SET category_id='missing'`},
		{"asset model", `UPDATE assets SET model_id='missing'`},
		{"category parent", `UPDATE categories SET parent_id='missing'`},
		{"selection category", `INSERT INTO category_field_selections(category_id,field_id) SELECT 'missing',id FROM field_definitions LIMIT 1`},
		{"binding target", `INSERT INTO model_fields(model_id,field_id,sort) SELECT 'missing',id,0 FROM field_definitions LIMIT 1`},
	} {
		t.Run(tc.name, func(t *testing.T) {
			a, _, _ := newApp(t)
			ctx := context.Background()
			conn, err := a.db.WriteDBForTest().Conn(ctx)
			if err != nil {
				t.Fatal(err)
			}
			for _, query := range []string{`PRAGMA foreign_keys=OFF`, tc.query, `PRAGMA foreign_keys=ON`} {
				if _, err := conn.ExecContext(ctx, query); err != nil {
					t.Fatal(err)
				}
			}
			if err := conn.Close(); err != nil {
				t.Fatal(err)
			}
			err = runVerify(ctx, a)
			if err == nil || !strings.Contains(err.Error(), "problem") {
				t.Fatalf("missing reference: %v", err)
			}
		})
	}
}

func TestVerifyKeyConflictQueryFailure(t *testing.T) {
	a, _, _ := newApp(t)
	verifyExec(t, a, `ALTER TABLE model_fields RENAME TO unavailable`)
	if _, err := verifyKeyConflicts(context.Background(), a.db.ReadDB()); err == nil {
		t.Fatal("missing model bindings must not be clean")
	}
}

func TestVerifyIndexRowsRejectInvalidStorageValues(t *testing.T) {
	a, _, _ := newApp(t)
	// A literal NULL simulates a damaged index without weakening its real schema.
	_, err := verifyIndexRows(context.Background(), a.db.ReadDB(), "unique", `SELECT NULL,'key','value','scope',0`, nil)
	if err == nil || !strings.Contains(err.Error(), "scan unique index row") {
		t.Fatalf("malformed row: %v", err)
	}
}

func TestVerifyFollowsRejectsEveryBrokenComponent(t *testing.T) {
	prev := snapshot{status: "stock", holderType: "entity", holderID: "location", ownerID: "user"}
	for i := range 4 {
		t.Run(fmt.Sprint(i), func(t *testing.T) {
			values := []string{"stock", "entity", "location", "user"}
			args := []*string{&values[0], &values[1], &values[2], &values[3]}
			args[i] = nil
			if follows(prev, args[0], args[1], args[2], args[3]) {
				t.Fatal("null chain component accepted")
			}
			wrong := "wrong"
			args[i] = &wrong
			if follows(prev, args[0], args[1], args[2], args[3]) {
				t.Fatal("different chain component accepted")
			}
		})
	}
}
