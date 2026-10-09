package store

import (
	"context"
	"database/sql"
	"fmt"
	"path/filepath"
	"testing"
)

func TestReadTxUsesOneConsistentSnapshot(t *testing.T) {
	ctx := context.Background()
	s, err := Open(filepath.Join(t.TempDir(), "read-tx.db"))
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	defer func() { _ = s.Close() }()
	if err := s.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `CREATE TABLE items (id INTEGER PRIMARY KEY, value TEXT)`)
		return err
	}); err != nil {
		t.Fatalf("create table: %v", err)
	}

	if err := s.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `INSERT INTO items (value) VALUES ('before')`)
		return err
	}); err != nil {
		t.Fatalf("seed: %v", err)
	}

	writerDone := make(chan error, 1)
	if err := s.ReadTx(ctx, func(ctx context.Context, q Querier) error {
		var before int
		if err := q.QueryRowContext(ctx, `SELECT count(*) FROM items`).Scan(&before); err != nil {
			return err
		}
		if before != 1 {
			t.Fatalf("snapshot start count = %d, want 1", before)
		}
		go func() {
			writerDone <- s.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
				_, err := tx.ExecContext(ctx, `INSERT INTO items (value) VALUES ('after')`)
				return err
			})
		}()
		if err := <-writerDone; err != nil {
			return err
		}
		var during int
		if err := q.QueryRowContext(ctx, `SELECT count(*) FROM items`).Scan(&during); err != nil {
			return err
		}
		if during != 1 {
			t.Errorf("snapshot changed during read transaction: got %d, want 1", during)
		}
		return nil
	}); err != nil {
		t.Fatalf("ReadTx: %v", err)
	}

	var committed int
	if err := s.Read(ctx, func(ctx context.Context, db *sql.DB) error {
		return db.QueryRowContext(ctx, `SELECT count(*) FROM items`).Scan(&committed)
	}); err != nil {
		t.Fatalf("read committed count: %v", err)
	}
	if committed != 2 {
		t.Fatalf("committed count = %d, want 2", committed)
	}
}

func TestReadTxRejectsWriteAndRollsBackAfterCallbackError(t *testing.T) {
	ctx := context.Background()
	s, err := Open(filepath.Join(t.TempDir(), "read-tx-write.db"))
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	defer func() { _ = s.Close() }()
	if err := s.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `CREATE TABLE items (id INTEGER PRIMARY KEY, value TEXT)`)
		return err
	}); err != nil {
		t.Fatalf("create table: %v", err)
	}

	if err := s.ReadTx(ctx, func(ctx context.Context, q Querier) error {
		// The callback only receives the query surface, but make the driver's
		// read-only enforcement explicit as well: a caller that deliberately
		// unwraps the concrete transaction still cannot write the snapshot.
		tx, ok := q.(*sql.Tx)
		if !ok {
			return fmt.Errorf("read transaction has type %T, want *sql.Tx", q)
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO items (value) VALUES ('rejected')`); err == nil {
			return fmt.Errorf("write through a read snapshot succeeded")
		}
		return fmt.Errorf("stop read snapshot")
	}); err == nil {
		t.Fatal("ReadTx should return the callback error")
	}

	var count int
	if err := s.Read(ctx, func(ctx context.Context, db *sql.DB) error {
		return db.QueryRowContext(ctx, `SELECT count(*) FROM items`).Scan(&count)
	}); err != nil {
		t.Fatalf("count: %v", err)
	}
	if count != 0 {
		t.Fatalf("rejected read-transaction write left %d rows", count)
	}
}

func TestWriteQuerierReadsItsOwnUpdates(t *testing.T) {
	ctx := context.Background()
	s, err := Open(filepath.Join(t.TempDir(), "write-q.db"))
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	defer func() { _ = s.Close() }()
	if err := s.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `CREATE TABLE items (id INTEGER PRIMARY KEY, value TEXT)`)
		return err
	}); err != nil {
		t.Fatalf("create table: %v", err)
	}

	if err := s.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		q := Querier(tx)
		if _, err := tx.ExecContext(ctx, `INSERT INTO items (value) VALUES ('visible')`); err != nil {
			return err
		}
		var count int
		if err := q.QueryRowContext(ctx, `SELECT count(*) FROM items`).Scan(&count); err != nil {
			return err
		}
		if count != 1 {
			t.Fatalf("write transaction count = %d, want 1", count)
		}
		return nil
	}); err != nil {
		t.Fatalf("Write: %v", err)
	}
}
