package store

import (
	"context"
	"encoding/json"
	"path/filepath"
	"slices"
	"testing"
)

// Splitting one permission into two must not take anything away.
//
// This is the only change in 023 that can quietly REMOVE an ability somebody
// already had, and it is not something anyone would notice at the time: the
// migration runs at startup, the role looks fine in the editor, and the first
// sign of trouble is a colleague saying weeks later that a page they used to
// open is gone. By then the data has moved.
//
// So the migration gets its own test, and the test is written to fail with the
// migration reverted rather than to describe what the migration happens to do.
func TestTransferAuditMigrationKeepsExistingAccess(t *testing.T) {
	ctx := context.Background()
	s, err := Open(filepath.Join(t.TempDir(), "perm.db"))
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	defer func() { _ = s.Close() }()

	if err := s.Migrate(ctx); err != nil {
		t.Fatalf("Migrate: %v", err)
	}
	// Back to before the split, named by version rather than counted in steps:
	// 021 is the migration under test, so 020 is the shape a real deployment
	// has on the morning of the upgrade. Counting down one has broken every
	// time a migration was added after it, and the failure read as this
	// migration regressing rather than as the test aiming one short.
	if err := s.MigrateDownTo(ctx, 20); err != nil {
		t.Fatalf("MigrateDownTo: %v", err)
	}

	insert := `INSERT INTO roles (id, name, is_admin, permissions, created_at, updated_at)
	           VALUES (?, ?, 0, ?, datetime('now'), datetime('now'))`
	for _, r := range []struct{ id, name, perms string }{
		{"r-auditor", "审计员", `["audit.read","export"]`},
		{"r-clerk", "库管", `["asset.create","export"]`},
		{"r-both", "已有两者", `["audit.read","transfer.audit"]`},
	} {
		if _, err := s.write.ExecContext(ctx, insert, r.id, r.name, r.perms); err != nil {
			t.Fatalf("seed %s: %v", r.id, err)
		}
	}

	if err := s.Migrate(ctx); err != nil {
		t.Fatalf("Migrate again: %v", err)
	}

	perms := func(id string) []string {
		var raw string
		if err := s.read.QueryRowContext(ctx, `SELECT permissions FROM roles WHERE id = ?`, id).
			Scan(&raw); err != nil {
			t.Fatalf("read %s: %v", id, err)
		}
		var out []string
		if err := json.Unmarshal([]byte(raw), &out); err != nil {
			t.Fatalf("parse %s (%q): %v", id, raw, err)
		}
		return out
	}
	has := func(list []string, want string) bool { return slices.Contains(list, want) }
	count := func(list []string, want string) int {
		n := 0
		for _, p := range list {
			if p == want {
				n++
			}
		}
		return n
	}

	// The whole point: somebody who could read the audit yesterday can read
	// both halves of it today, without an administrator going back through the
	// roles to tick a box.
	got := perms("r-auditor")
	if !has(got, "audit.read") || !has(got, "transfer.audit") {
		t.Errorf("auditor lost access: %v", got)
	}

	// And it does not hand the new one out to everybody.
	if got := perms("r-clerk"); has(got, "transfer.audit") {
		t.Errorf("clerk gained an audit permission it never had: %v", got)
	}

	// Migrations run more than once in practice -- a failed startup, a retry,
	// a rebuilt container against the same file. Twice must equal once.
	if got := perms("r-both"); count(got, "transfer.audit") != 1 {
		t.Errorf("transfer.audit appears %d times, want 1: %v", count(got, "transfer.audit"), got)
	}
}

// Admin is a flag, not a list of ticks -- it means "everything, including what
// gets added later". A migration that touched it would be a sign the flag had
// stopped meaning that.
func TestTransferAuditMigrationLeavesAdminAlone(t *testing.T) {
	ctx := context.Background()
	s, err := Open(filepath.Join(t.TempDir(), "admin.db"))
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	defer func() { _ = s.Close() }()
	if err := s.Migrate(ctx); err != nil {
		t.Fatalf("Migrate: %v", err)
	}

	var raw string
	var isAdmin int
	if err := s.read.QueryRowContext(ctx,
		`SELECT permissions, is_admin FROM roles WHERE is_admin = 1 LIMIT 1`).
		Scan(&raw, &isAdmin); err != nil {
		t.Fatalf("read admin role: %v", err)
	}
	if raw != "[]" {
		t.Errorf("admin role permissions = %q, want [] -- the flag carries it", raw)
	}
}

// The upgrade has to index what is already there.
//
// Flipping searchable on for every field and stopping is the version that
// shipped for about an hour: the search then reached only devices saved after
// the upgrade, so findable and unfindable rows sat side by side with nothing
// on screen to tell them apart. That is the exact failure 026 exists to
// remove, which is why it is pinned here rather than left to a code review.
func TestSearchableMigrationBackfillsExistingAssets(t *testing.T) {
	ctx := context.Background()
	s, err := Open(filepath.Join(t.TempDir(), "search.db"))
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	defer func() { _ = s.Close() }()

	if err := s.Migrate(ctx); err != nil {
		t.Fatalf("Migrate: %v", err)
	}
	// Back to before the index existed, so the rows are the shape a real
	// deployment has on the morning of the upgrade. Named, not counted.
	if err := s.MigrateDownTo(ctx, 21); err != nil {
		t.Fatalf("MigrateDownTo: %v", err)
	}

	if _, err := s.write.ExecContext(ctx, `
		INSERT INTO field_definitions (id, key, label, type, options, is_unique, required, created_at, updated_at)
		VALUES ('f-tag', 'service_tag', 'Service Tag', 'text', '{}', 0, 0, datetime('now'), datetime('now'))`); err != nil {
		t.Fatalf("seed field: %v", err)
	}
	// The foreign keys have to be satisfiable, so the fixture builds the row's
	// neighbours rather than turning the constraint off -- an upgrade tested
	// against a database that could not exist proves nothing about one that can.
	for _, seed := range []string{
		`INSERT INTO categories (id, code, name, parent_id, path, display_key, created_at, updated_at)
		 VALUES ('c1', 'C1', '类别', NULL, '/c1/', '', datetime('now'), datetime('now'))`,
		`INSERT INTO users (id, email, name, auth_type, status, created_at, updated_at)
		 VALUES ('u1', 'u@example.com', '账号', 'local', 'active', datetime('now'), datetime('now'))`,
		`INSERT INTO holder_entities (id, type, name, parent_id, note, is_default_stock, created_at, updated_at)
		 VALUES ('h1', 'location', '仓库', NULL, '', 0, datetime('now'), datetime('now'))`,
	} {
		if _, err := s.write.ExecContext(ctx, seed); err != nil {
			t.Fatalf("seed neighbour: %v", err)
		}
	}
	if _, err := s.write.ExecContext(ctx, `
		INSERT INTO assets (id, category_id, status, owner_id, holder_type, holder_id,
		                    attrs, version, created_at, updated_at)
		VALUES ('a1', 'c1', 'in_stock', 'u1', 'entity', 'h1',
		        '{"service_tag":"7XKQ9R2","blank":"  "}', 1, datetime('now'), datetime('now'))`); err != nil {
		t.Fatalf("seed asset: %v", err)
	}

	if err := s.Migrate(ctx); err != nil {
		t.Fatalf("Migrate up: %v", err)
	}

	var value string
	if err := s.read.QueryRowContext(ctx,
		`SELECT value FROM asset_search_values WHERE asset_id = 'a1' AND field_key = 'service_tag'`).
		Scan(&value); err != nil {
		t.Fatalf("the value saved before the upgrade should be indexed by it: %v", err)
	}
	if value != "7XKQ9R2" {
		t.Errorf("indexed %q", value)
	}

	// And a blank stays out: in the index it would be matched by every search.
	var blanks int
	if err := s.read.QueryRowContext(ctx,
		`SELECT count(*) FROM asset_search_values WHERE field_key = 'blank'`).Scan(&blanks); err != nil {
		t.Fatal(err)
	}
	if blanks != 0 {
		t.Errorf("a blank value was indexed %d time(s)", blanks)
	}
}
