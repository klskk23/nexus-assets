package store

import (
	"context"
	"path/filepath"
	"testing"
)

func TestMigrateUpAndDown(t *testing.T) {
	path := filepath.Join(t.TempDir(), "migrate.db")
	s, err := Open(path)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	defer s.Close()

	ctx := context.Background()
	if err := s.Migrate(ctx); err != nil {
		t.Fatalf("Migrate: %v", err)
	}

	want := []string{
		"users", "holder_entities", "categories", "field_definitions",
		"category_fields", "product_models", "assets", "asset_sn_history",
		"asset_transfers", "audit_log",
	}
	for _, table := range want {
		var n int
		q := `SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name = ?`
		if err := s.read.QueryRowContext(ctx, q, table).Scan(&n); err != nil {
			t.Fatalf("check %s: %v", table, err)
		}
		if n != 1 {
			t.Errorf("table %s missing after migrate up", table)
		}
	}

	// The two indexes an ORM could not express.
	for _, idx := range []string{"ix_assets_mac", "ux_default_stock"} {
		var n int
		q := `SELECT count(*) FROM sqlite_master WHERE type = 'index' AND name = ?`
		if err := s.read.QueryRowContext(ctx, q, idx).Scan(&n); err != nil {
			t.Fatalf("check index %s: %v", idx, err)
		}
		if n != 1 {
			t.Errorf("index %s missing after migrate up", idx)
		}
	}

	if err := s.MigrateDown(ctx); err != nil {
		t.Fatalf("MigrateDown: %v", err)
	}
	var n int
	if err := s.read.QueryRowContext(ctx,
		`SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name = 'assets'`).Scan(&n); err != nil {
		t.Fatalf("check after down: %v", err)
	}
	if n != 0 {
		t.Error("assets table should be gone after migrate down")
	}
}

// TestDefaultStockPointIsUnique exercises the partial unique index.
func TestDefaultStockPointIsUnique(t *testing.T) {
	path := filepath.Join(t.TempDir(), "stock.db")
	s, err := Open(path)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	defer s.Close()
	ctx := context.Background()
	if err := s.Migrate(ctx); err != nil {
		t.Fatalf("Migrate: %v", err)
	}

	ins := `INSERT INTO holder_entities (id, type, name, is_default_stock, created_at, updated_at)
	        VALUES (?, 'location', ?, ?, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`
	if _, err := s.write.ExecContext(ctx, ins, "a", "库房 A", 1); err != nil {
		t.Fatalf("first default stock point should be accepted: %v", err)
	}
	if _, err := s.write.ExecContext(ctx, ins, "b", "库房 B", 1); err == nil {
		t.Fatal("a second default stock point must be rejected by ux_default_stock")
	}
	if _, err := s.write.ExecContext(ctx, ins, "c", "库房 C", 0); err != nil {
		t.Fatalf("non-default locations must remain unrestricted: %v", err)
	}
}
