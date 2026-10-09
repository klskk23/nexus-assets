package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"testing"

	"github.com/pressly/goose/v3"

	"github.com/klskk23/nexus-assets/migrations"
)

func TestSelectiveInheritanceWALBackupUpgradeAndRestore(t *testing.T) {
	ctx := context.Background()
	dir := t.TempDir()
	s := openMigrationBackupStore(t, filepath.Join(dir, "working.db"))
	if err := goose.SetDialect("sqlite3"); err != nil {
		t.Fatal(err)
	}
	goose.SetBaseFS(migrations.FS)
	if err := goose.UpToContext(ctx, s.write, ".", 23); err != nil {
		t.Fatal(err)
	}
	if _, err := s.write.ExecContext(ctx, `PRAGMA wal_autocheckpoint = 0`); err != nil {
		t.Fatal(err)
	}
	var busy, frames, checkpointed int
	if err := s.write.QueryRowContext(ctx, `PRAGMA wal_checkpoint(TRUNCATE)`).Scan(&busy, &frames, &checkpointed); err != nil {
		t.Fatal(err)
	}
	if busy != 0 || frames != 0 || checkpointed != 0 {
		t.Fatalf("initial checkpoint = (%d, %d, %d), want (0, 0, 0)", busy, frames, checkpointed)
	}
	seedMigrationBackupLegacy(t, ctx, s)
	assertMigrationBackupVersion(t, ctx, s, 23)

	// Prove the committed fixture is still in WAL. This read-only immutable
	// connection intentionally ignores WAL; it is not used as a backup source.
	mainOnly, err := sql.Open("sqlite", "file:"+s.Path()+"?mode=ro&immutable=1")
	if err != nil {
		t.Fatal(err)
	}
	var mainAssets int
	queryErr := mainOnly.QueryRowContext(ctx, `SELECT count(*) FROM assets`).Scan(&mainAssets)
	closeErr := mainOnly.Close()
	if queryErr != nil || closeErr != nil {
		t.Fatalf("inspect checkpointed main file: query=%v close=%v", queryErr, closeErr)
	}
	wal, err := os.Stat(s.Path() + "-wal")
	if err != nil {
		t.Fatal(err)
	}
	if mainAssets != 0 || wal.Size() <= 32 {
		t.Fatalf("fixture did not remain in WAL: main assets=%d WAL bytes=%d", mainAssets, wal.Size())
	}
	before := migrationBackupContents(t, ctx, s)
	backupPath := filepath.Join(dir, "before-023.db")
	vacuumMigrationBackup(t, ctx, s, backupPath)
	backup := openMigrationBackupStore(t, backupPath)
	assertMigrationBackupVersion(t, ctx, backup, 23)
	assertMigrationBackupEqual(t, ctx, backup, before)
	t.Logf("023 backup includes committed WAL data: main-file assets=0, WAL bytes=%d; all tables/schema equal", wal.Size())

	if err := s.Migrate(ctx); err != nil {
		t.Fatalf("upgrade working copy to 024: %v", err)
	}
	assertMigrationBackupVersion(t, ctx, s, 24)
	var selections int
	if err := s.read.QueryRowContext(ctx, `SELECT count(*) FROM category_field_selections`).Scan(&selections); err != nil {
		t.Fatal(err)
	}
	if selections != 2 {
		t.Fatalf("backfilled selections = %d, want child + leaf", selections)
	}
	// Simulate new writes after upgrade, then preserve them independently before
	// considering rollback. Restoring the 023 backup cannot include these writes.
	if err := s.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		return insertMigrationBackupAsset(ctx, tx, "post-upgrade", "NEW-024")
	}); err != nil {
		t.Fatal(err)
	}
	after := migrationBackupContents(t, ctx, s)
	preservedPath := filepath.Join(dir, "preserved-024.db")
	vacuumMigrationBackup(t, ctx, s, preservedPath)
	preserved := openMigrationBackupStore(t, preservedPath)
	assertMigrationBackupVersion(t, ctx, preserved, 24)
	assertMigrationBackupEqual(t, ctx, preserved, after)

	err = s.MigrateDown(ctx)
	if err == nil || !strings.Contains(err.Error(), "migration 024 down is unsafe") {
		t.Fatalf("populated Down error = %v, want explicit unsafe downgrade refusal", err)
	}
	assertMigrationBackupVersion(t, ctx, s, 24)
	assertMigrationBackupEqual(t, ctx, s, after)
	t.Log("024 upgrade backfilled 2 selections; post-upgrade writes preserved; populated Down refused with all tables/schema unchanged")

	// Restore into a distinct path; neither the working 024 copy nor either
	// backup is overwritten. VACUUM INTO also safely reads a WAL-mode backup.
	restoredPath := filepath.Join(dir, "restored-023.db")
	vacuumMigrationBackup(t, ctx, backup, restoredPath)
	restored := openMigrationBackupStore(t, restoredPath)
	assertMigrationBackupVersion(t, ctx, restored, 23)
	assertMigrationBackupEqual(t, ctx, restored, before)
	assertMigrationBackupEqual(t, ctx, s, after)
	assertMigrationBackupEqual(t, ctx, preserved, after)
	var restoredAssets, preservedAssets int
	if err := restored.read.QueryRowContext(ctx, `SELECT count(*) FROM assets`).Scan(&restoredAssets); err != nil {
		t.Fatal(err)
	}
	if err := preserved.read.QueryRowContext(ctx, `SELECT count(*) FROM assets`).Scan(&preservedAssets); err != nil {
		t.Fatal(err)
	}
	if restoredAssets != 1 || preservedAssets != 2 {
		t.Fatalf("restored/preserved asset counts = %d/%d, want 1/2", restoredAssets, preservedAssets)
	}
	t.Log("restored new path at 023: all pre-upgrade tables/schema equal, integrity_check=ok, foreign_key_check empty; 024 working/preserved copies retain both assets")
}

func openMigrationBackupStore(t *testing.T, path string) *Store {
	t.Helper()
	s, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := s.Close(); err != nil {
			t.Errorf("close backup fixture: %v", err)
		}
	})
	return s
}

func vacuumMigrationBackup(t *testing.T, ctx context.Context, s *Store, destination string) {
	t.Helper()
	if _, err := s.write.ExecContext(ctx, `VACUUM INTO ?`, destination); err != nil {
		t.Fatalf("consistent backup to %s: %v", destination, err)
	}
}

func assertMigrationBackupVersion(t *testing.T, ctx context.Context, s *Store, want int64) {
	t.Helper()
	version, err := goose.GetDBVersionContext(ctx, s.read)
	if err != nil {
		t.Fatal(err)
	}
	if version != want {
		t.Fatalf("database version = %d, want %d", version, want)
	}
}

func seedMigrationBackupLegacy(t *testing.T, ctx context.Context, s *Store) {
	t.Helper()
	if err := s.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		statements := []string{
			`INSERT INTO categories (id, code, name, parent_id, path, display_key, created_at, updated_at) VALUES
			 ('root', 'ROOT', 'Root', NULL, '/root/', 'serial', '2026-10-08T00:00:00Z', '2026-10-08T00:00:00Z'),
			 ('child', 'CHILD', 'Child', 'root', '/root/child/', 'serial', '2026-10-08T00:00:00Z', '2026-10-08T00:00:00Z'),
			 ('leaf', 'LEAF', 'Leaf', 'child', '/root/child/leaf/', 'serial', '2026-10-08T00:00:00Z', '2026-10-08T00:00:00Z')`,
			`INSERT INTO field_definitions (id, key, label, type, options, is_unique, searchable, required, created_at, updated_at)
			 VALUES ('serial', 'serial', 'Serial', 'text', '{}', 1, 1, 1, '2026-10-08T00:00:00Z', '2026-10-08T00:00:00Z')`,
			`INSERT INTO category_fields (category_id, field_id, sort) VALUES ('root', 'serial', 10)`,
			`INSERT INTO users (id, email, name, auth_type, status, role, created_at, updated_at)
			 VALUES ('owner', 'backup@example.test', 'Owner', 'local', 'active', 'admin', '2026-10-08T00:00:00Z', '2026-10-08T00:00:00Z')`,
		}
		for _, statement := range statements {
			if _, err := tx.ExecContext(ctx, statement); err != nil {
				return err
			}
		}
		return insertMigrationBackupAsset(ctx, tx, "legacy", "OLD-023")
	}); err != nil {
		t.Fatalf("seed 023 WAL fixture: %v", err)
	}
}

func insertMigrationBackupAsset(ctx context.Context, tx *sql.Tx, id, serial string) error {
	const ts = "2026-10-08T00:00:00Z"
	statements := []struct {
		query string
		args  []any
	}{
		{`INSERT INTO assets (id, category_id, status, owner_id, holder_type, holder_id, attrs, created_at, updated_at)
		  VALUES (?, 'leaf', 'in_stock', 'owner', 'user', 'owner', json_object('serial', ?), ?, ?)`, []any{id, serial, ts, ts}},
		{`INSERT INTO asset_unique_values (asset_id, field_key, value, created_at, scope_id)
		  VALUES (?, 'serial', ?, ?, 'root')`, []any{id, serial, ts}},
		{`INSERT INTO asset_search_values (asset_id, field_key, value) VALUES (?, 'serial', ?)`, []any{id, serial}},
		{`INSERT INTO asset_transfers (id, asset_id, kind, to_status, to_holder_type, to_holder_id, to_owner_id, actor_id, created_at)
		  VALUES (?, ?, 'create', 'in_stock', 'user', 'owner', 'owner', 'owner', ?)`, []any{"event-" + id, id, ts}},
	}
	for _, statement := range statements {
		if _, err := tx.ExecContext(ctx, statement.query, statement.args...); err != nil {
			return fmt.Errorf("insert backup asset %s: %w", id, err)
		}
	}
	return nil
}

// Compare logical rows, not file bytes: VACUUM legitimately changes page layout.
// Include all tables (also goose and sqlite_sequence), plus schema definitions.
func migrationBackupContents(t *testing.T, ctx context.Context, s *Store) map[string][]string {
	t.Helper()
	contents := map[string][]string{
		"schema": migrationBackupRows(t, ctx, s, `SELECT type, name, tbl_name, sql FROM sqlite_schema`),
	}
	rows, err := s.read.QueryContext(ctx, `SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name`)
	if err != nil {
		t.Fatal(err)
	}
	var tables []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			rows.Close()
			t.Fatal(err)
		}
		tables = append(tables, name)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		t.Fatal(err)
	}
	for _, table := range tables {
		contents[table] = migrationBackupRows(t, ctx, s, `SELECT * FROM "`+strings.ReplaceAll(table, `"`, `""`)+`"`)
	}
	return contents
}

func migrationBackupRows(t *testing.T, ctx context.Context, s *Store, query string) []string {
	t.Helper()
	rows, err := s.read.QueryContext(ctx, query)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	columns, err := rows.Columns()
	if err != nil {
		t.Fatal(err)
	}
	var out []string
	for rows.Next() {
		values := make([]any, len(columns))
		dest := make([]any, len(columns))
		for i := range values {
			dest[i] = &values[i]
		}
		if err := rows.Scan(dest...); err != nil {
			t.Fatal(err)
		}
		encoded, err := json.Marshal(values)
		if err != nil {
			t.Fatal(err)
		}
		out = append(out, string(encoded))
	}
	if err := rows.Err(); err != nil {
		t.Fatal(err)
	}
	sort.Strings(out)
	return out
}

func assertMigrationBackupEqual(t *testing.T, ctx context.Context, s *Store, want map[string][]string) {
	t.Helper()
	got := migrationBackupContents(t, ctx, s)
	if !reflect.DeepEqual(got, want) {
		for table, rows := range want {
			if !reflect.DeepEqual(got[table], rows) {
				t.Errorf("restored %s = %v, want %v", table, got[table], rows)
			}
		}
		t.Fatalf("database contents changed: got %d entries, want %d", len(got), len(want))
	}
	if checks := migrationBackupRows(t, ctx, s, `PRAGMA integrity_check`); !reflect.DeepEqual(checks, []string{`["ok"]`}) {
		t.Fatalf("integrity_check = %v", checks)
	}
	if checks := migrationBackupRows(t, ctx, s, `PRAGMA foreign_key_check`); len(checks) != 0 {
		t.Fatalf("foreign_key_check = %v", checks)
	}
}
