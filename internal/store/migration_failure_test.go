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

// Fail at goose's final version insert, after all 024 DDL and backfill statements
// have executed. A non-atomic migration would leave its schema or rows behind.
func TestSelectiveInheritanceMigrationRollsBackOnVersionWriteFailure(t *testing.T) {
	ctx := context.Background()
	s := openMigrationBackupStore(t, filepath.Join(t.TempDir(), "failure-023.db"))
	if err := goose.SetDialect("sqlite3"); err != nil {
		t.Fatal(err)
	}
	goose.SetBaseFS(migrations.FS)
	if err := goose.UpToContext(ctx, s.write, ".", 23); err != nil {
		t.Fatal(err)
	}
	seedMigrationBackupLegacy(t, ctx, s)
	before := migrationBackupContents(t, ctx, s)

	if err := s.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `CREATE TRIGGER fail_migration_024_version
			BEFORE INSERT ON goose_db_version
			WHEN NEW.version_id = 24
			BEGIN
				SELECT CASE WHEN (SELECT count(*) FROM category_field_selections) <> 2
					THEN RAISE(ABORT, '024 backfill did not finish before version write') END;
				SELECT CASE WHEN NOT EXISTS (
					SELECT 1 FROM pragma_table_info('asset_unique_values') WHERE name = 'search_suppressed'
				) THEN RAISE(ABORT, '024 suppression column missing before version write') END;
				SELECT CASE WHEN NOT EXISTS (
					SELECT 1 FROM sqlite_schema WHERE type = 'index' AND name = 'ix_category_field_selections_field'
				) THEN RAISE(ABORT, '024 selection index missing before version write') END;
				SELECT RAISE(ABORT, 'injected 024 version write failure');
			END`)
		return err
	}); err != nil {
		t.Fatalf("install final-version fault: %v", err)
	}
	withFault := migrationBackupContents(t, ctx, s)
	if err := s.Migrate(ctx); err == nil || !strings.Contains(err.Error(), "injected 024 version write failure") {
		t.Fatalf("migration error = %v, want injected failure after completed DDL/backfill", err)
	}
	assertMigrationBackupVersion(t, ctx, s, 23)
	assertMigrationBackupEqual(t, ctx, s, withFault)
	for _, check := range []struct {
		name  string
		query string
	}{
		{"selection table", `SELECT count(*) FROM sqlite_schema WHERE type = 'table' AND name = 'category_field_selections'`},
		{"selection index", `SELECT count(*) FROM sqlite_schema WHERE type = 'index' AND name = 'ix_category_field_selections_field'`},
		{"suppression column", `SELECT count(*) FROM pragma_table_info('asset_unique_values') WHERE name = 'search_suppressed'`},
	} {
		var count int
		if err := s.read.QueryRowContext(ctx, check.query).Scan(&count); err != nil {
			t.Fatal(err)
		}
		if count != 0 {
			t.Errorf("%s survived failed migration", check.name)
		}
	}
	t.Log("024 DDL/index/2 backfilled choices were visible at version insert; injected failure restored all 023 tables/schema and version")

	if err := s.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `DROP TRIGGER fail_migration_024_version`)
		return err
	}); err != nil {
		t.Fatal(err)
	}
	assertMigrationBackupEqual(t, ctx, s, before)
	if err := s.Migrate(ctx); err != nil {
		t.Fatalf("retry migration after removing fault: %v", err)
	}
	assertMigrationBackupVersion(t, ctx, s, 24)
	var selections, index, suppressed int
	if err := s.read.QueryRowContext(ctx, `SELECT count(*) FROM category_field_selections`).Scan(&selections); err != nil {
		t.Fatal(err)
	}
	if err := s.read.QueryRowContext(ctx, `SELECT count(*) FROM sqlite_schema WHERE type = 'index' AND name = 'ix_category_field_selections_field'`).Scan(&index); err != nil {
		t.Fatal(err)
	}
	if err := s.read.QueryRowContext(ctx, `SELECT search_suppressed FROM asset_unique_values WHERE asset_id = 'legacy'`).Scan(&suppressed); err != nil {
		t.Fatal(err)
	}
	if selections != 2 || index != 1 || suppressed != 0 {
		t.Fatalf("retry result: selections=%d index=%d suppressed=%d, want 2/1/0", selections, index, suppressed)
	}
	// Only migration-owned schema/version/suppression changes are expected.
	// Every other old table must still contain exactly its pre-upgrade rows.
	after := migrationBackupContents(t, ctx, s)
	for table, rows := range before {
		switch table {
		case "schema", "goose_db_version", "sqlite_sequence", "asset_unique_values":
			continue
		}
		if !reflect.DeepEqual(after[table], rows) {
			t.Errorf("retry changed legacy table %s: got %v, want %v", table, after[table], rows)
		}
	}
	t.Log("removing the fault allowed retry to version 24 with 2 choices, reverse index and default suppression=0")
}
