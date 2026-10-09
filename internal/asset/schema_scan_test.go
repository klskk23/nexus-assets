package asset

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"reflect"
	"testing"

	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/store"
)

// Count real queries without replacing SQLite or its cursor behavior.
type schemaScanQueries struct {
	store.Querier
	queries int
}

func (q *schemaScanQueries) QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error) {
	q.queries++
	return q.Querier.QueryContext(ctx, query, args...)
}

func seedSchemaScanAssets(t *testing.T) *fixture {
	t.Helper()
	f := newFixture(t)
	source, err := f.save(t, SaveInput{Attrs: map[string]any{"mac": "001A2B3C4D5E"}})
	if err != nil {
		t.Fatal(err)
	}
	// Scanner fixtures need actual rows, not individual save/index computations.
	if err := f.svc.db.Write(f.ctx, func(ctx context.Context, tx *sql.Tx) error {
		for i := 0; i < 259; i++ {
			_, err := tx.ExecContext(ctx, `INSERT INTO assets (`+assetCols+`)
    SELECT ?, category_id, model_id, status, owner_id, holder_type, holder_id,
    home_holder_type, home_holder_id, home_owner_id, attrs, note, version, created_at, updated_at
    FROM assets WHERE id=?`, fmt.Sprintf("scan-%04d", i), source.ID)
			if err != nil {
				return err
			}
		}
		_, err := tx.ExecContext(ctx, `DELETE FROM assets WHERE id=?`, source.ID)
		return err
	}); err != nil {
		t.Fatal(err)
	}
	return f
}

func TestSchemaAssetScanUsesBoundedBatchesAndOneCursor(t *testing.T) {
	f := seedSchemaScanAssets(t)
	err := f.svc.db.ReadTx(f.ctx, func(ctx context.Context, q store.Querier) error {
		counted := &schemaScanQueries{Querier: q}
		var sizes []int
		seen := 0
		err := scanSchemaAssets(ctx, counted, []string{f.catID, f.catID}, func(batch []model.Asset) error {
			sizes = append(sizes, len(batch))
			if len(batch) > 128 {
				t.Fatalf("raw asset batch contains %d rows, maximum 128", len(batch))
			}
			for _, a := range batch {
				if a.ID != fmt.Sprintf("scan-%04d", seen) || a.Attrs["mac"] != "001A2B3C4D5E" {
					t.Fatalf("row %d = %+v", seen, a)
				}
				seen++
			}
			return nil
		})
		if err != nil {
			return err
		}
		if seen != 259 || !reflect.DeepEqual(sizes, []int{128, 128, 3}) || counted.queries != 1 {
			t.Fatalf("scan rows=%d batches=%v queries=%d", seen, sizes, counted.queries)
		}
		calls := 0
		if err := scanSchemaAssets(ctx, counted, nil, func([]model.Asset) error { calls++; return nil }); err != nil {
			return err
		}
		if calls != 0 {
			t.Fatal("empty scan invoked consumer")
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}

func TestSchemaAssetScanStopsBeforeDecodingLaterBatches(t *testing.T) {
	f := seedSchemaScanAssets(t)
	if err := f.svc.db.Write(f.ctx, func(ctx context.Context, tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `UPDATE assets SET updated_at='invalid-time' WHERE id='scan-0258'`)
		return err
	}); err != nil {
		t.Fatal(err)
	}
	stop := errors.New("consumer stopped")
	if err := f.svc.db.ReadTx(f.ctx, func(ctx context.Context, q store.Querier) error {
		counted := &schemaScanQueries{Querier: q}
		calls := 0
		err := scanSchemaAssets(ctx, counted, []string{f.catID}, func([]model.Asset) error { calls++; return stop })
		if !errors.Is(err, stop) || calls != 1 || counted.queries != 1 {
			t.Fatalf("scan consumed later rows before callback: calls=%d queries=%d err=%v", calls, counted.queries, err)
		}
		var count int
		if err := q.QueryRowContext(ctx, `SELECT count(*) FROM assets`).Scan(&count); err != nil {
			return err
		}
		if count != 259 {
			t.Fatalf("scan changed rows: %d", count)
		}
		calls = 0
		err = scanSchemaAssets(ctx, counted, []string{f.catID}, func([]model.Asset) error { calls++; return nil })
		if err == nil || calls != 2 {
			t.Fatalf("later scan error lost or partial batch delivered: calls=%d err=%v", calls, err)
		}
		return nil
	}); err != nil {
		t.Fatal(err)
	}
}
