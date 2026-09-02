package store

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"
	"time"
)

// TestReadNotBlockedByOpenWrite is the justification for the two-pool split: if
// reads had to queue behind writes there would be no point paying for WAL.
func TestReadNotBlockedByOpenWrite(t *testing.T) {
	path := filepath.Join(t.TempDir(), "concurrency.db")
	s, err := Open(path)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	defer func() { _ = s.Close() }()

	ctx := context.Background()
	if _, err := s.write.ExecContext(ctx, `CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)`); err != nil {
		t.Fatalf("create: %v", err)
	}
	if _, err := s.write.ExecContext(ctx, `INSERT INTO t (v) VALUES ('before')`); err != nil {
		t.Fatalf("seed: %v", err)
	}

	tx, err := s.write.BeginTx(ctx, nil)
	if err != nil {
		t.Fatalf("begin: %v", err)
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO t (v) VALUES ('uncommitted')`); err != nil {
		t.Fatalf("insert in tx: %v", err)
	}

	done := make(chan error, 1)
	go func() {
		var n int
		done <- s.read.QueryRowContext(ctx, `SELECT count(*) FROM t`).Scan(&n)
	}()

	select {
	case err := <-done:
		if err != nil && err != sql.ErrNoRows {
			t.Fatalf("read failed while a write tx was open: %v", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("read blocked by an open write transaction; WAL or the pool split is not working")
	}
	_ = tx.Rollback()
}
