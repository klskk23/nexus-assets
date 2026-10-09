package asset

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"path/filepath"
	"reflect"
	"testing"

	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/schema"
	"github.com/klskk23/nexus-assets/internal/store"
)

// Without a transaction-local schema guard, valid prepared values can be written
// after their definitions or computation context have changed. New assets need
// the same guard: there is no asset version to protect their preparation.
func TestPersistRejectsChangedSchemaBeforeAnyAssetWrite(t *testing.T) {
	changes := []struct {
		name  string
		query string
		arg   func(*fixture) string
	}{
		{"category context", `UPDATE categories SET name = 'Renamed' WHERE id = ?`, func(f *fixture) string { return f.catID }},
		{"display key", `UPDATE categories SET display_key = 'mac' WHERE id = ?`, func(f *fixture) string { return f.catID }},
		{"required rule", `UPDATE field_definitions SET required = 0 WHERE id = ?`, func(f *fixture) string { return f.macField }},
		{"computed rule", `UPDATE field_definitions SET options = '{"template":"attrs.mac"}' WHERE id = ?`, func(f *fixture) string { return f.snField }},
		{"withdrawal", `DELETE FROM category_field_selections WHERE category_id = ?`, func(f *fixture) string { return f.catID }},
	}
	for _, change := range changes {
		for _, edit := range []bool{false, true} {
			t.Run(fmt.Sprintf("%s/edit=%t", change.name, edit), func(t *testing.T) {
				f := newFixture(t)
				in := preparedInput(f)
				if edit {
					a, err := f.svc.Save(f.ctx, in)
					if err != nil {
						t.Fatal(err)
					}
					in.ID, in.Version = a.ID, a.Version
					in.Attrs = map[string]any{"mac": "00:1A:2B:3C:4D:5F"}
				}
				prep, err := f.svc.Prepare(f.ctx, in)
				if err != nil {
					t.Fatal(err)
				}
				before := preparedAssetState(t, f)
				// SQL deliberately bypasses the still-fail-closed effects writer.
				// The change is uncommitted when Persist runs: reading the pool
				// instead of the supplied transaction must not pass this test.
				err = f.svc.db.Write(f.ctx, func(ctx context.Context, tx *sql.Tx) error {
					if _, err := tx.ExecContext(ctx, change.query, change.arg(f)); err != nil {
						return err
					}
					_, err := f.svc.Persist(ctx, tx, prep)
					return err
				})
				if !errors.Is(err, ErrSchemaStale) {
					t.Errorf("expected schema stale, got %v", err)
				}
				if after := preparedAssetState(t, f); !reflect.DeepEqual(before, after) {
					t.Errorf("stale persistence changed assets/indexes/events:\nbefore %v\nafter %v", before, after)
				}
			})
		}
	}
}

func TestPersistAcceptsUnrelatedSchemaChange(t *testing.T) {
	f := newFixture(t)
	prep, err := f.svc.Prepare(f.ctx, preparedInput(f))
	if err != nil {
		t.Fatal(err)
	}
	err = f.svc.db.Write(f.ctx, func(ctx context.Context, tx *sql.Tx) error {
		// The ancestor's display name is not part of this asset's context.
		if _, err := tx.ExecContext(ctx, `UPDATE categories SET name = 'Other name' WHERE id = ?`, f.rootID); err != nil {
			return err
		}
		a, err := f.svc.Persist(ctx, tx, prep)
		if err == nil && (a.ID != prep.ID || a.Attrs["mac"] != "001A2B3C4D5E") {
			t.Errorf("wrong persisted asset: %+v", a)
		}
		return err
	})
	if err != nil {
		t.Fatal(err)
	}
}

func TestPersistRejectsMissingPreparationFingerprint(t *testing.T) {
	f := newFixture(t)
	prep, err := f.svc.Prepare(f.ctx, preparedInput(f))
	if err != nil {
		t.Fatal(err)
	}
	prep.schemaFingerprint = ""
	before := preparedAssetState(t, f)
	err = f.svc.db.Write(f.ctx, func(ctx context.Context, tx *sql.Tx) error {
		_, err := f.svc.Persist(ctx, tx, prep)
		return err
	})
	if !errors.Is(err, ErrSchemaStale) {
		t.Fatalf("missing fingerprint was accepted: %v", err)
	}
	if !reflect.DeepEqual(before, preparedAssetState(t, f)) {
		t.Fatal("missing fingerprint wrote assets, indexes or events")
	}
}

func TestBatchPersistenceSchemaChecksDoNotQueryPerRow(t *testing.T) {
	ctx := context.Background()
	db, err := store.OpenCounting(filepath.Join(t.TempDir(), "batch.db"))
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
	sch := schema.New(db)
	cat, err := sch.CreateCategory(ctx, schema.CreateCategoryInput{Code: "BATCH", Name: "Batch"})
	if err != nil {
		t.Fatal(err)
	}
	svc := NewService(db, sch)
	prep, err := svc.Prepare(ctx, SaveInput{CategoryID: cat.ID})
	if err != nil {
		t.Fatal(err)
	}
	err = db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		queries := store.ResetQueryCount()
		writer, err := svc.BeginPersistence(ctx, tx)
		if err != nil {
			return err
		}
		loaded := queries()
		if loaded > 8 {
			t.Errorf("schema load used %d queries", loaded)
		}
		for range 500 {
			if err := writer.Check(prep); err != nil {
				return err
			}
		}
		if queries() != loaded {
			t.Errorf("batch checks added %d schema queries", queries()-loaded)
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}

func preparedInput(f *fixture) SaveInput {
	return SaveInput{
		CategoryID: f.catID, Status: model.StatusInStock,
		OwnerID: f.userID, ActorID: f.userID,
		Holder: model.Holder{Type: model.HolderTypeEntity, ID: f.locID},
		Attrs:  map[string]any{"mac": "00:1A:2B:3C:4D:5E"},
	}
}

// Capture all persisted values, not just counts: an update can corrupt a row
// without adding any row at all.
func preparedAssetState(t *testing.T, f *fixture) map[string][][]any {
	t.Helper()
	state := make(map[string][][]any)
	for _, table := range []string{"assets", "asset_unique_values", "asset_search_values", "asset_transfers"} {
		rows, err := f.svc.db.ReadDB().QueryContext(f.ctx, `SELECT * FROM `+table+` ORDER BY rowid`)
		if err != nil {
			t.Fatal(err)
		}
		columns, err := rows.Columns()
		if err != nil {
			t.Fatal(err)
		}
		for rows.Next() {
			values := make([]any, len(columns))
			pointers := make([]any, len(columns))
			for i := range values {
				pointers[i] = &values[i]
			}
			if err := rows.Scan(pointers...); err != nil {
				t.Fatal(err)
			}
			state[table] = append(state[table], values)
		}
		if err := rows.Err(); err != nil {
			t.Fatal(err)
		}
		if err := rows.Close(); err != nil {
			t.Fatal(err)
		}
	}
	return state
}
