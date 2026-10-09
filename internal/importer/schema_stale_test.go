package importer

import (
	"context"
	"database/sql"
	"errors"
	"runtime"
	"testing"
	"time"

	"github.com/klskk23/nexus-assets/internal/asset"
	"github.com/klskk23/nexus-assets/internal/i18n"
)

// Holding the sole write connection puts a deterministic barrier at BEGIN:
// schema is changed after batch preparation, before the write transaction starts.
// Preparing rows inside the write transaction instead would accept this batch.
func TestImportRejectsSchemaChangedAfterBatchPreparation(t *testing.T) {
	for _, commit := range []bool{false, true} {
		name := "preview"
		if commit {
			name = "commit"
		}
		t.Run(name, func(t *testing.T) {
			f := newFixture(t)
			ctx, cancel := context.WithTimeout(f.ctx, 10*time.Second)
			defer cancel()
			db := f.svc.db.WriteDBForTest()
			conn, err := db.Conn(ctx)
			if err != nil {
				t.Fatal(err)
			}
			defer func() {
				if err := conn.Close(); err != nil && !errors.Is(err, sql.ErrConnDone) {
					t.Errorf("close write barrier: %v", err)
				}
			}()
			waits := db.Stats().WaitCount
			done := make(chan error, 1)
			go func() {
				file := csvOf(
					",上海仓库,,001A2B3C4D5E,1.0",
					"SDWAN-X100,上海仓库,,001A2B3C4D5F,1.1",
				)
				if commit {
					_, err := f.svc.Commit(ctx, i18n.EN, f.catID, f.userID, file)
					done <- err
				} else {
					_, err := f.svc.Preview(ctx, i18n.EN, f.catID, f.userID, file)
					done <- err
				}
			}()
			for db.Stats().WaitCount == waits {
				select {
				case err := <-done:
					t.Fatalf("import completed before transaction barrier: %v", err)
				case <-ctx.Done():
					t.Fatal("import never reached transaction barrier")
				default:
					runtime.Gosched()
				}
			}
			// Only row two is stale. Row one must not survive a batch rejection.
			if _, err := conn.ExecContext(ctx, `UPDATE product_models SET name = 'Renamed model' WHERE name = 'SDWAN-X100'`); err != nil {
				t.Fatal(err)
			}
			if err := conn.Close(); err != nil {
				t.Fatal(err)
			}
			select {
			case err := <-done:
				if !errors.Is(err, asset.ErrSchemaStale) {
					t.Errorf("expected fatal schema stale, got %v", err)
				}
			case <-ctx.Done():
				t.Fatal("import did not finish after releasing write connection")
			}
			for _, table := range []string{"assets", "asset_unique_values", "asset_search_values", "asset_transfers"} {
				var count int
				if err := f.svc.db.ReadDB().QueryRowContext(f.ctx, `SELECT count(*) FROM `+table).Scan(&count); err != nil {
					t.Fatal(err)
				}
				if count != 0 {
					t.Errorf("stale batch left %d %s rows", count, table)
				}
			}
		})
	}
}
