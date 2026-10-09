package store

import (
	"context"
	"database/sql"
	"path/filepath"
	"reflect"
	"testing"

	"github.com/pressly/goose/v3"

	"github.com/klskk23/nexus-assets/migrations"
)

func TestSelectiveInheritanceMigrationBackfillsLegacyEffectiveFields(t *testing.T) {
	ctx := context.Background()
	s, err := Open(filepath.Join(t.TempDir(), "legacy-023.db"))
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	defer func() { _ = s.Close() }()
	if err := goose.SetDialect("sqlite3"); err != nil {
		t.Fatalf("set goose dialect: %v", err)
	}
	goose.SetBaseFS(migrations.FS)
	if err := goose.UpToContext(ctx, s.write, ".", 23); err != nil {
		t.Fatalf("prepare legacy 023 schema: %v", err)
	}

	const ts = "2026-10-02T00:00:00Z"
	if err := s.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		for _, row := range [][3]string{
			{"cat-root", "ROOT", "/cat-root/"},
			{"cat-child", "CHILD", "/cat-root/cat-child/"},
			{"cat-branch", "BRANCH", "/cat-root/cat-branch/"},
			{"cat-leaf", "LEAF", "/cat-root/cat-child/cat-leaf/"},
		} {
			if _, err := tx.ExecContext(ctx, `
				INSERT INTO categories (id, code, name, parent_id, path, display_key, archived_at, created_at, updated_at)
				VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?)`,
				row[0], row[1], row[1], parentID(row[0]), row[2], ts, ts); err != nil {
				return err
			}
		}
		for _, row := range [][4]string{
			{"field-root", "root_tag", "Root tag", "text"},
			{"field-child", "child_tag", "Child tag", "text"},
			{"field-branch", "branch_tag", "Branch tag", "text"},
			{"field-leaf", "leaf_tag", "Leaf tag", "text"},
		} {
			if _, err := tx.ExecContext(ctx, `
				INSERT INTO field_definitions
				(id, key, label, type, options, is_unique, searchable, required, created_at, updated_at)
				VALUES (?, ?, ?, ?, '{}', 0, 1, 0, ?, ?)`,
				row[0], row[1], row[2], row[3], ts, ts); err != nil {
				return err
			}
		}
		for _, row := range [][3]any{
			{"cat-root", "field-root", 20},
			{"cat-child", "field-child", 10},
			{"cat-branch", "field-branch", 10},
			{"cat-leaf", "field-leaf", 5},
		} {
			if _, err := tx.ExecContext(ctx,
				`INSERT INTO category_fields (category_id, field_id, required, sort) VALUES (?, ?, 0, ?)`,
				row[0], row[1], row[2]); err != nil {
				return err
			}
		}
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO users
			(id, email, name, auth_type, password_hash, status, role, token_version, created_at, updated_at)
			VALUES ('user-1', 'legacy@example.test', 'Legacy', 'local', NULL, 'active', 'admin', 0, ?, ?)`, ts, ts); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO assets
			(id, category_id, model_id, status, owner_id, holder_type, holder_id, attrs, version, deleted_at, created_at, updated_at)
			VALUES ('asset-1', 'cat-leaf', NULL, 'in_stock', 'user-1', 'user', 'user-1', '{"root_tag":"R1"}', 1, NULL, ?, ?)`, ts, ts); err != nil {
			return err
		}
		_, err := tx.ExecContext(ctx, `
			INSERT INTO asset_unique_values
			(asset_id, field_key, value, archived_at, created_at, scope_id)
			VALUES ('asset-1', 'root_tag', 'R1', NULL, ?, 'cat-root')`, ts)
		return err
	}); err != nil {
		t.Fatalf("seed legacy 023 fixture: %v", err)
	}

	var before int
	if err := s.read.QueryRowContext(ctx,
		`SELECT count(*) FROM category_fields`).Scan(&before); err != nil {
		t.Fatalf("count legacy bindings: %v", err)
	}
	if before != 4 {
		t.Fatalf("legacy bindings = %d, want 4", before)
	}

	if err := s.Migrate(ctx); err != nil {
		t.Fatalf("Migrate 024: %v", err)
	}

	// The guard refuses rollback once the upgrade has materialised decisions or
	// suppressed history, and must leave both the schema and data untouched.
	if err := s.MigrateDown(ctx); err == nil {
		t.Fatal("MigrateDown 024 should reject populated selective-inheritance data")
	}
	var version int64
	if err := s.read.QueryRowContext(ctx,
		`SELECT max(version_id) FROM goose_db_version WHERE is_applied = 1`).Scan(&version); err != nil {
		t.Fatalf("read migration version after rejected down: %v", err)
	}
	if version != 24 {
		t.Fatalf("migration version after rejected down = %d, want 24", version)
	}

	wantSelections := map[string][]string{
		"cat-child":  {"field-root"},
		"cat-branch": {"field-root"},
		"cat-leaf":   {"field-root", "field-child"},
	}
	for categoryID, want := range wantSelections {
		rows, err := s.read.QueryContext(ctx, `
			SELECT field_id
			FROM category_field_selections
			WHERE category_id = ?
			ORDER BY rowid`, categoryID)
		if err != nil {
			t.Fatalf("load selections for %s: %v", categoryID, err)
		}
		var got []string
		for rows.Next() {
			var fieldID string
			if err := rows.Scan(&fieldID); err != nil {
				rows.Close()
				t.Fatalf("scan selection for %s: %v", categoryID, err)
			}
			got = append(got, fieldID)
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			t.Fatalf("iterate selections for %s: %v", categoryID, err)
		}
		rows.Close()
		if len(got) != len(want) {
			t.Fatalf("selections for %s = %v, want %v", categoryID, got, want)
		}
		for i := range want {
			if got[i] != want[i] {
				t.Fatalf("selections for %s = %v, want %v", categoryID, got, want)
			}
		}
	}

	var rootSelections int
	if err := s.read.QueryRowContext(ctx,
		`SELECT count(*) FROM category_field_selections WHERE category_id = 'cat-root'`).Scan(&rootSelections); err != nil {
		t.Fatalf("count root selections: %v", err)
	}
	if rootSelections != 0 {
		t.Fatalf("root selections = %d, want 0", rootSelections)
	}

	var bindings, attrs, uniqueValue, suppressed int
	if err := s.read.QueryRowContext(ctx, `SELECT count(*) FROM category_fields`).Scan(&bindings); err != nil {
		t.Fatal(err)
	}
	if err := s.read.QueryRowContext(ctx,
		`SELECT count(*) FROM assets WHERE attrs = '{"root_tag":"R1"}'`).Scan(&attrs); err != nil {
		t.Fatal(err)
	}
	if err := s.read.QueryRowContext(ctx,
		`SELECT count(*) FROM asset_unique_values WHERE asset_id = 'asset-1' AND value = 'R1'`).Scan(&uniqueValue); err != nil {
		t.Fatal(err)
	}
	if err := s.read.QueryRowContext(ctx,
		`SELECT search_suppressed FROM asset_unique_values WHERE asset_id = 'asset-1'`).Scan(&suppressed); err != nil {
		t.Fatal(err)
	}
	if bindings != before || attrs != 1 || uniqueValue != 1 || suppressed != 0 {
		t.Fatalf("legacy data changed: bindings=%d attrs=%d unique=%d suppressed=%d", bindings, attrs, uniqueValue, suppressed)
	}
}

// Empty trees already have coverage in TestMigrateUpAndDown. These sparse
// legacy trees catch spurious selections when there is no ancestor binding,
// including a child's own binding incorrectly being treated as inherited.
func TestSelectiveInheritanceMigrationWithoutAncestorFields(t *testing.T) {
	for _, tc := range []struct {
		name       string
		categories int
		bindChild  bool
	}{
		{"root_without_fields", 1, false},
		{"three_levels_without_fields", 3, false},
		{"child_direct_only", 2, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			ctx := context.Background()
			s := openMigrationBackupStore(t, filepath.Join(t.TempDir(), "sparse-023.db"))
			if err := goose.SetDialect("sqlite3"); err != nil {
				t.Fatal(err)
			}
			goose.SetBaseFS(migrations.FS)
			if err := goose.UpToContext(ctx, s.write, ".", 23); err != nil {
				t.Fatal(err)
			}
			if err := s.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
				categories := []struct {
					id, path string
					parent   any
				}{
					{"root", "/root/", nil},
					{"child", "/root/child/", "root"},
					{"leaf", "/root/child/leaf/", "child"},
				}
				for _, category := range categories[:tc.categories] {
					if _, err := tx.ExecContext(ctx, `INSERT INTO categories
						(id, code, name, parent_id, path, created_at, updated_at)
						VALUES (?, ?, ?, ?, ?, '2026-10-08T00:00:00Z', '2026-10-08T00:00:00Z')`,
						category.id, category.id, category.id, category.parent, category.path); err != nil {
						return err
					}
				}
				if !tc.bindChild {
					return nil
				}
				if _, err := tx.ExecContext(ctx, `INSERT INTO field_definitions
					(id, key, label, type, options, created_at, updated_at)
					VALUES ('own', 'own', 'Own', 'text', '{}', '2026-10-08T00:00:00Z', '2026-10-08T00:00:00Z')`); err != nil {
					return err
				}
				_, err := tx.ExecContext(ctx, `INSERT INTO category_fields (category_id, field_id, sort) VALUES ('child', 'own', 10)`)
				return err
			}); err != nil {
				t.Fatalf("seed sparse 023 tree: %v", err)
			}
			before := migrationBackupContents(t, ctx, s)
			if err := s.Migrate(ctx); err != nil {
				t.Fatalf("upgrade sparse 023 tree: %v", err)
			}
			assertMigrationBackupVersion(t, ctx, s, 24)
			if rows := migrationBackupRows(t, ctx, s, `SELECT category_id, field_id FROM category_field_selections`); len(rows) != 0 {
				t.Fatalf("tree with no ancestor bindings gained selections: %v", rows)
			}
			for _, table := range []string{"categories", "field_definitions", "category_fields"} {
				if got := migrationBackupRows(t, ctx, s, `SELECT * FROM `+table); !reflect.DeepEqual(got, before[table]) {
					t.Errorf("migration changed sparse legacy %s: got %v, want %v", table, got, before[table])
				}
			}
		})
	}
}

func parentID(categoryID string) any {
	switch categoryID {
	case "cat-root":
		return nil
	case "cat-child", "cat-branch":
		return "cat-root"
	case "cat-leaf":
		return "cat-child"
	default:
		panic("unknown category " + categoryID)
	}
}
