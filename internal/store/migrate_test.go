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
		"category_fields", "product_models", "assets", "asset_unique_values",
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

	// The partial indexes an ORM could not express.
	for _, idx := range []string{"ux_uv_live", "ux_default_stock"} {
		var n int
		q := `SELECT count(*) FROM sqlite_master WHERE type = 'index' AND name = ?`
		if err := s.read.QueryRowContext(ctx, q, idx).Scan(&n); err != nil {
			t.Fatalf("check index %s: %v", idx, err)
		}
		if n != 1 {
			t.Errorf("index %s missing after migrate up", idx)
		}
	}

	// Rolling back one revision must restore the pre-002 shape exactly, so a
	// half-applied upgrade can be undone rather than requiring a fresh file.
	if err := s.MigrateDown(ctx); err != nil {
		t.Fatalf("MigrateDown: %v", err)
	}
	for table, wantN := range map[string]int{"asset_unique_values": 0, "asset_sn_history": 1} {
		var n int
		if err := s.read.QueryRowContext(ctx,
			`SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name = ?`, table).Scan(&n); err != nil {
			t.Fatalf("check %s after down: %v", table, err)
		}
		if n != wantN {
			t.Errorf("after down, table %s count = %d, want %d", table, n, wantN)
		}
	}
	for col, wantN := range map[string]int{"sn_template": 1, "display_key": 0} {
		var n int
		if err := s.read.QueryRowContext(ctx,
			`SELECT count(*) FROM pragma_table_info('categories') WHERE name = ?`, col).Scan(&n); err != nil {
			t.Fatalf("check categories.%s after down: %v", col, err)
		}
		if n != wantN {
			t.Errorf("after down, categories.%s count = %d, want %d", col, n, wantN)
		}
	}
}

// TestUniqueValueIndexIgnoresArchived pins the behaviour the whole identity
// model rests on: an archived value stays searchable but frees its slot, so a
// replaced MAC can legitimately reappear on a different device.
func TestUniqueValueIndexIgnoresArchived(t *testing.T) {
	path := filepath.Join(t.TempDir(), "uv.db")
	s, err := Open(path)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	defer s.Close()
	ctx := context.Background()
	if err := s.Migrate(ctx); err != nil {
		t.Fatalf("Migrate: %v", err)
	}

	// Real parent rows: the rebuilt assets table must still enforce its foreign
	// keys, which is also a check that the table rebuild kept the graph intact.
	const ts = "2026-01-01T00:00:00Z"
	for _, stmt := range []struct {
		q    string
		args []any
	}{
		{`INSERT INTO users (id, email, name, auth_type, created_at, updated_at) VALUES (?, ?, ?, 'local', ?, ?)`,
			[]any{"u", "u@example.com", "U", ts, ts}},
		{`INSERT INTO categories (id, code, name, path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
			[]any{"c", "C", "类别", "/c/", ts, ts}},
		{`INSERT INTO assets (id, category_id, status, owner_id, holder_type, holder_id, created_at, updated_at)
		  VALUES (?, 'c', 'in_stock', 'u', 'user', 'u', ?, ?)`, []any{"a", ts, ts}},
		{`INSERT INTO assets (id, category_id, status, owner_id, holder_type, holder_id, created_at, updated_at)
		  VALUES (?, 'c', 'in_stock', 'u', 'user', 'u', ?, ?)`, []any{"b", ts, ts}},
	} {
		if _, err := s.write.ExecContext(ctx, stmt.q, stmt.args...); err != nil {
			t.Fatalf("seed: %v", err)
		}
	}

	ins := `INSERT INTO asset_unique_values (asset_id, field_key, value, archived_at, created_at)
	        VALUES (?, 'mac', 'AABBCCDDEEFF', ?, '2026-01-01T00:00:00Z')`
	if _, err := s.write.ExecContext(ctx, ins, "zz", nil); err == nil {
		t.Fatal("asset_unique_values must not accept a dangling asset_id")
	}
	if _, err := s.write.ExecContext(ctx, ins, "a", nil); err != nil {
		t.Fatalf("first live value should be accepted: %v", err)
	}
	if _, err := s.write.ExecContext(ctx, ins, "b", nil); err == nil {
		t.Fatal("a second live value on the same key must be rejected by ux_uv_live")
	}
	if _, err := s.write.ExecContext(ctx, ins, "a", "2026-02-01T00:00:00Z"); err != nil {
		t.Fatalf("archiving a value must not collide with the live one: %v", err)
	}
	if _, err := s.write.ExecContext(ctx, ins, "b", "2026-02-01T00:00:00Z"); err != nil {
		t.Fatalf("two archived copies of the same value are allowed: %v", err)
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
