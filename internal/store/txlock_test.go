package store

import (
	"context"
	"path/filepath"
	"strings"
	"testing"
)

// TestBeginImmediateTakesWriteLock proves that _txlock=immediate is honoured by
// the driver.
//
// With BEGIN IMMEDIATE the exclusive lock is taken at BEGIN, so a second writer
// is refused right away. Under the default BEGIN DEFERRED both transactions
// would start happily and only collide at write time, which is exactly the
// behaviour the uniqueness check must not be built on. If this test ever fails,
// the fallback in research.md D2 applies: take a single connection and issue
// BEGIN IMMEDIATE by hand.
func TestBeginImmediateTakesWriteLock(t *testing.T) {
	path := filepath.Join(t.TempDir(), "lock.db")

	// A short busy timeout keeps the test fast; production uses 5000ms.
	a, err := open(path, 100)
	if err != nil {
		t.Fatalf("open a: %v", err)
	}
	defer a.Close()

	b, err := open(path, 100)
	if err != nil {
		t.Fatalf("open b: %v", err)
	}
	defer b.Close()

	ctx := context.Background()
	if _, err := a.write.ExecContext(ctx, `CREATE TABLE t (id INTEGER PRIMARY KEY)`); err != nil {
		t.Fatalf("create table: %v", err)
	}

	txA, err := a.write.BeginTx(ctx, nil)
	if err != nil {
		t.Fatalf("begin A: %v", err)
	}
	defer txA.Rollback()

	_, err = b.write.BeginTx(ctx, nil)
	if err == nil {
		t.Fatal("second BEGIN succeeded; _txlock=immediate did not take effect " +
			"(see research.md D2 for the fallback)")
	}
	if !strings.Contains(strings.ToLower(err.Error()), "busy") &&
		!strings.Contains(strings.ToLower(err.Error()), "locked") {
		t.Errorf("expected a busy/locked error, got: %v", err)
	}
	t.Logf("second BEGIN correctly refused: %v", err)
}
