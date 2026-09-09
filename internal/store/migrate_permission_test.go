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
	// Back to before the split, so the rows under test are the shape a real
	// deployment has on the morning of the upgrade.
	if err := s.MigrateDown(ctx); err != nil {
		t.Fatalf("MigrateDown: %v", err)
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
