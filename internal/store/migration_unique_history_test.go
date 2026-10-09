package store

import (
	"context"
	"database/sql"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/pressly/goose/v3"

	"github.com/klskk23/nexus-assets/migrations"
)

// The migration must neither suppress ordinary archived identifiers nor rewrite
// their original scope or archival timestamp. This checks stored rows only;
// search and exact-match behavior belong to the consumer integration tests.
func TestSelectiveInheritanceMigrationPreservesArchivedUniqueHistory(t *testing.T) {
	ctx := context.Background()
	s := openMigrationBackupStore(t, filepath.Join(t.TempDir(), "unique-history-023.db"))
	if err := goose.SetDialect("sqlite3"); err != nil {
		t.Fatal(err)
	}
	goose.SetBaseFS(migrations.FS)
	if err := goose.UpToContext(ctx, s.write, ".", 23); err != nil {
		t.Fatal(err)
	}
	seedMigrationBackupLegacy(t, ctx, s)
	if err := s.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `INSERT INTO asset_unique_values
			(asset_id, field_key, value, archived_at, created_at, scope_id) VALUES
			('legacy', 'serial', 'PREVIOUS-001', '2026-10-06T12:00:00Z', '2026-10-05T09:00:00Z', 'root'),
			('legacy', 'serial', 'PREVIOUS-002', '2026-10-08T00:00:00Z', '2026-10-06T12:00:00Z', 'root')`)
		return err
	}); err != nil {
		t.Fatalf("seed archived unique history on 023: %v", err)
	}
	// This is every 023 column, including nullable archived_at and source scope.
	const legacyColumns = `SELECT asset_id, field_key, value, archived_at, created_at, scope_id FROM asset_unique_values`
	before := migrationBackupRows(t, ctx, s, legacyColumns)
	want := []string{
		`["legacy","serial","OLD-023",null,"2026-10-08T00:00:00Z","root"]`,
		`["legacy","serial","PREVIOUS-001","2026-10-06T12:00:00Z","2026-10-05T09:00:00Z","root"]`,
		`["legacy","serial","PREVIOUS-002","2026-10-08T00:00:00Z","2026-10-06T12:00:00Z","root"]`,
	}
	if !reflect.DeepEqual(before, want) {
		t.Fatalf("023 unique history = %v, want %v", before, want)
	}
	if err := s.Migrate(ctx); err != nil {
		t.Fatalf("upgrade history fixture to 024: %v", err)
	}
	assertMigrationBackupVersion(t, ctx, s, 24)
	if after := migrationBackupRows(t, ctx, s, legacyColumns); !reflect.DeepEqual(after, before) {
		t.Fatalf("024 changed legacy unique columns: got %v, want %v", after, before)
	}
	gotSuppression := migrationBackupRows(t, ctx, s,
		`SELECT value, search_suppressed FROM asset_unique_values`)
	wantSuppression := []string{`["OLD-023",0]`, `["PREVIOUS-001",0]`, `["PREVIOUS-002",0]`}
	if !reflect.DeepEqual(gotSuppression, wantSuppression) {
		t.Fatalf("migration suppressed current or archived history: got %v, want %v", gotSuppression, wantSuppression)
	}
	t.Log("023 to 024 preserves all six legacy unique-value columns for 1 current and 2 archived rows; every search_suppressed value is 0")
}

// A withdrawn field can leave no selections but still have suppressed history.
// Removing the suppression branch from the Down guard must fail this regression.
func TestSelectiveInheritanceMigrationDownRejectsSuppressedHistoryWithoutSelections(t *testing.T) {
	ctx := context.Background()
	s := openMigrationBackupStore(t, filepath.Join(t.TempDir(), "suppressed-history-023.db"))
	if err := goose.SetDialect("sqlite3"); err != nil {
		t.Fatal(err)
	}
	goose.SetBaseFS(migrations.FS)
	if err := goose.UpToContext(ctx, s.write, ".", 23); err != nil {
		t.Fatal(err)
	}
	seedMigrationBackupLegacy(t, ctx, s)
	// Start with no inherited fields in the legacy tree. The raw asset value is
	// deliberately retained, as an orphan value may exist after an old unbind.
	if err := s.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		if _, err := tx.ExecContext(ctx, `UPDATE categories SET display_key = NULL`); err != nil {
			return err
		}
		_, err := tx.ExecContext(ctx, `DELETE FROM category_fields`)
		return err
	}); err != nil {
		t.Fatal(err)
	}
	if err := s.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	if rows := migrationBackupRows(t, ctx, s, `SELECT category_id, field_id FROM category_field_selections`); len(rows) != 0 {
		t.Fatalf("fixture must have no selections, got %v", rows)
	}
	// Model the persisted state after withdrawal, not a consumer-level withdrawal
	// operation: this test covers only the independently necessary Down guard.
	if err := s.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `UPDATE asset_unique_values
			SET archived_at = '2026-10-08T01:00:00Z', search_suppressed = 1`)
		return err
	}); err != nil {
		t.Fatal(err)
	}
	if rows := migrationBackupRows(t, ctx, s, `SELECT value, search_suppressed FROM asset_unique_values`); !reflect.DeepEqual(rows, []string{`["OLD-023",1]`}) {
		t.Fatalf("suppressed history fixture = %v", rows)
	}
	before := migrationBackupContents(t, ctx, s)
	if err := s.MigrateDown(ctx); err == nil || !strings.Contains(err.Error(), "migration 024 down is unsafe") {
		t.Fatalf("Down with only suppressed history = %v, want explicit refusal", err)
	}
	assertMigrationBackupVersion(t, ctx, s, 24)
	assertMigrationBackupEqual(t, ctx, s, before)
}
