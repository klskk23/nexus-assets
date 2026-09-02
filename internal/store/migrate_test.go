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
	defer func() { _ = s.Close() }()

	ctx := context.Background()
	if err := s.Migrate(ctx); err != nil {
		t.Fatalf("Migrate: %v", err)
	}

	want := []string{
		"users", "holder_entities", "categories", "field_definitions",
		"category_fields", "product_models", "product_model_categories",
		"assets", "asset_unique_values", "asset_transfers", "audit_log",
		"statuses", "sessions", "api_keys",
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
	var retiredTerminal, retiredCounts int
	if err := s.read.QueryRowContext(ctx,
		`SELECT (SELECT terminal FROM statuses WHERE key = 'retired'),
		        (SELECT counts_as_available FROM statuses WHERE key = 'retired')`).
		Scan(&retiredTerminal, &retiredCounts); err != nil {
		t.Fatalf("read builtin flags: %v", err)
	}
	if retiredTerminal != 1 || retiredCounts != 0 {
		t.Errorf("retired's flags no longer match the behaviour they replace: %d %d",
			retiredTerminal, retiredCounts)
	}

	column := func(table, name string) int {
		t.Helper()
		var n int
		if err := s.read.QueryRowContext(ctx,
			`SELECT count(*) FROM pragma_table_info(?) WHERE name = ?`, table, name).Scan(&n); err != nil {
			t.Fatalf("check %s.%s: %v", table, name, err)
		}
		return n
	}
	// note arrived with 005; archiving left with 006; the location constraint
	// left with 007.
	if column("holder_entities", "note") != 1 {
		t.Error("holder_entities should carry note after 005")
	}
	if column("holder_entities", "archived_at") != 0 {
		t.Error("holder_entities should have lost archived_at in 006 -- a column nothing can set is worse than none")
	}
	if column("statuses", "requires_location") != 0 {
		t.Error("statuses should have lost requires_location in 007, for the same reason")
	}
	// 008: every asset can name where it belongs.
	for _, c := range []string{"home_holder_type", "home_holder_id", "home_owner_id"} {
		if column("assets", c) != 1 {
			t.Errorf("assets should carry %s after 008", c)
		}
	}

	// 009 marks which side of the expression-syntax change a database is on.
	var marker int
	if err := s.read.QueryRowContext(ctx,
		`SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name = 'expression_syntax_migration'`).
		Scan(&marker); err != nil {
		t.Fatal(err)
	}
	if marker != 1 {
		t.Error("009 should have created the expression-syntax marker table")
	}

	// Rolling back one revision at a time must restore each earlier shape
	// exactly, so a half-applied upgrade can be undone rather than requiring a
	// fresh file.
	for _, rev := range []string{"015", "014", "013", "012", "011", "010", "009"} {
		if err := s.MigrateDown(ctx); err != nil {
			t.Fatalf("MigrateDown %s: %v", rev, err)
		}
	}

	if err := s.MigrateDown(ctx); err != nil {
		t.Fatalf("MigrateDown 008: %v", err)
	}
	if column("assets", "home_holder_id") != 0 {
		t.Error("down from 008 should have dropped the home columns")
	}

	if err := s.MigrateDown(ctx); err != nil {
		t.Fatalf("MigrateDown 007: %v", err)
	}
	if column("statuses", "requires_location") != 1 {
		t.Error("down from 007 should have restored requires_location")
	}

	if err := s.MigrateDown(ctx); err != nil {
		t.Fatalf("MigrateDown 006: %v", err)
	}
	if column("holder_entities", "archived_at") != 1 {
		t.Error("down from 006 should have restored archived_at")
	}

	if err := s.MigrateDown(ctx); err != nil {
		t.Fatalf("MigrateDown 005: %v", err)
	}
	if column("holder_entities", "note") != 0 {
		t.Error("down from 005 should have dropped holder_entities.note")
	}

	// One more revision back takes the statuses table with it.
	if err := s.MigrateDown(ctx); err != nil {
		t.Fatalf("MigrateDown 004: %v", err)
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
	defer func() { _ = s.Close() }()
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
	defer func() { _ = s.Close() }()
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
	defer func() { _ = s.Close() }()
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

// 010 withdraws two field types. What it must not do is take the values with
// them: the fields become text, and every attribute already stored under them
// stays exactly where it was.
func TestMigrateConvertsEnumAndReferenceFieldsToText(t *testing.T) {
	path := filepath.Join(t.TempDir(), "types.db")
	s, err := Open(path)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	defer func() { _ = s.Close() }()

	ctx := context.Background()
	if err := s.Migrate(ctx); err != nil {
		t.Fatalf("Migrate: %v", err)
	}
	// Back past the withdrawal, so the rows can be written in the shape that
	// revision allowed.
	for _, rev := range []string{"015", "014", "013", "012", "011", "010"} {
		if err := s.MigrateDown(ctx); err != nil {
			t.Fatalf("MigrateDown %s: %v", rev, err)
		}
	}

	now := "2026-08-31T00:00:00Z"
	for _, f := range []struct{ id, key, typ, options string }{
		{"f-enum", "grade", "enum", `{"choices":[{"value":"a","label":"甲"}]}`},
		{"f-ref", "keeper", "reference", `{"target":"user"}`},
		{"f-text", "note2", "text", `{"regex":"^N"}`},
	} {
		if _, err := s.write.ExecContext(ctx,
			`INSERT INTO field_definitions (id, key, label, type, options, is_unique, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
			f.id, f.key, f.key, f.typ, f.options, now, now); err != nil {
			t.Fatalf("seed %s: %v", f.id, err)
		}
	}

	if err := s.Migrate(ctx); err != nil {
		t.Fatalf("Migrate up again: %v", err)
	}

	for _, want := range []struct{ id, typ, options string }{
		{"f-enum", "text", "{}"},
		{"f-ref", "text", "{}"},
		// An untouched field keeps its own configuration; the update must not
		// have been a blanket one.
		{"f-text", "text", `{"regex":"^N"}`},
	} {
		var typ, options string
		if err := s.read.QueryRowContext(ctx,
			`SELECT type, options FROM field_definitions WHERE id = ?`, want.id).Scan(&typ, &options); err != nil {
			t.Fatalf("read %s: %v", want.id, err)
		}
		if typ != want.typ || options != want.options {
			t.Errorf("%s = (%s, %s), want (%s, %s)", want.id, typ, options, want.typ, want.options)
		}
	}
}
