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
		"category_fields", "product_models", "product_model_categories",
		"assets", "asset_unique_values", "asset_transfers", "audit_log",
		"statuses",
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

	// The information item's own lifecycle: archiving is gone, so the column is
	// gone with it. A column with no way to set it only confuses the next reader.
	var archived int
	if err := s.read.QueryRowContext(ctx,
		`SELECT count(*) FROM pragma_table_info('field_definitions') WHERE name = 'archived_at'`).
		Scan(&archived); err != nil {
		t.Fatalf("check field_definitions.archived_at: %v", err)
	}
	if archived != 0 {
		t.Error("field_definitions should no longer carry archived_at")
	}

	// The five built-in statuses arrive with the table, carrying the behaviour
	// the rest of the system was written against.
	var builtins int
	if err := s.read.QueryRowContext(ctx,
		`SELECT count(*) FROM statuses WHERE builtin = 1`).Scan(&builtins); err != nil {
		t.Fatalf("count builtin statuses: %v", err)
	}
	if builtins != 5 {
		t.Errorf("builtin statuses = %d, want 5", builtins)
	}
	var stockNeedsLocation, retiredTerminal, retiredCounts int
	if err := s.read.QueryRowContext(ctx,
		`SELECT (SELECT requires_location FROM statuses WHERE key = 'in_stock'),
		        (SELECT terminal FROM statuses WHERE key = 'retired'),
		        (SELECT counts_as_available FROM statuses WHERE key = 'retired')`).
		Scan(&stockNeedsLocation, &retiredTerminal, &retiredCounts); err != nil {
		t.Fatalf("read builtin flags: %v", err)
	}
	if stockNeedsLocation != 1 || retiredTerminal != 1 || retiredCounts != 0 {
		t.Errorf("the seeded flags do not match the behaviour they replace: %d %d %d",
			stockNeedsLocation, retiredTerminal, retiredCounts)
	}

	// Rolling back one revision must restore the pre-004 shape exactly, so a
	// half-applied upgrade can be undone rather than requiring a fresh file.
	if err := s.MigrateDown(ctx); err != nil {
		t.Fatalf("MigrateDown: %v", err)
	}
	for table, wantN := range map[string]int{"statuses": 0, "product_model_categories": 1} {
		var n int
		if err := s.read.QueryRowContext(ctx,
			`SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name = ?`, table).Scan(&n); err != nil {
			t.Fatalf("check %s after down: %v", table, err)
		}
		if n != wantN {
			t.Errorf("after down, table %s count = %d, want %d", table, n, wantN)
		}
	}
	for spec, wantN := range map[[2]string]int{
		{"field_definitions", "archived_at"}: 0,
		{"product_models", "category_id"}:    0,
	} {
		var n int
		if err := s.read.QueryRowContext(ctx,
			`SELECT count(*) FROM pragma_table_info(?) WHERE name = ?`, spec[0], spec[1]).Scan(&n); err != nil {
			t.Fatalf("check %s.%s after down: %v", spec[0], spec[1], err)
		}
		if n != wantN {
			t.Errorf("after down, %s.%s count = %d, want %d", spec[0], spec[1], n, wantN)
		}
	}
}

// The uniqueness of a model name is scoped to its vendor, and that only works
// because vendor is NOT NULL: SQLite treats NULLs as distinct inside a UNIQUE
// index, so a nullable vendor would let any number of same-named models coexist
// while the schema still looked constrained.
func TestModelNameIsUniquePerVendorIncludingTheEmptyOne(t *testing.T) {
	path := filepath.Join(t.TempDir(), "pm.db")
	s, err := Open(path)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	defer s.Close()
	ctx := context.Background()
	if err := s.Migrate(ctx); err != nil {
		t.Fatalf("Migrate: %v", err)
	}

	const ts = "2026-01-01T00:00:00Z"
	ins := `INSERT INTO product_models (id, name, vendor, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`
	if _, err := s.write.ExecContext(ctx, ins, "m1", "X100", "Acme", ts, ts); err != nil {
		t.Fatalf("first model: %v", err)
	}
	if _, err := s.write.ExecContext(ctx, ins, "m2", "X100", "Beta", ts, ts); err != nil {
		t.Fatalf("two vendors may share a product name: %v", err)
	}
	if _, err := s.write.ExecContext(ctx, ins, "m3", "X100", "Acme", ts, ts); err == nil {
		t.Fatal("the same vendor must not have two products with one name")
	}
	// The empty vendor is a namespace like any other, not an escape hatch.
	if _, err := s.write.ExecContext(ctx, ins, "m4", "S24", "", ts, ts); err != nil {
		t.Fatalf("an empty vendor is allowed: %v", err)
	}
	if _, err := s.write.ExecContext(ctx, ins, "m5", "S24", "", ts, ts); err == nil {
		t.Fatal("two same-named models with no vendor must still collide")
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
