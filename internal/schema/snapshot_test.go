package schema

import (
	"context"
	"database/sql"
	"errors"
	"reflect"
	"testing"

	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/store"
)

// Fixed identities make ordering and provenance expectations independent of the
// resolver. Selections deliberately arrive in the opposite order to bindings.
func seedSnapshot(t *testing.T, s *Store, ctx context.Context) {
	t.Helper()
	err := s.db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		statements := []string{
			`INSERT INTO categories (id, code, name, parent_id, path, created_at, updated_at) VALUES
			 ('root', 'ROOT', 'Root', NULL, '/root/', '2026-10-08T00:00:00Z', '2026-10-08T00:00:00Z'),
			 ('child', 'CHILD', 'Child', 'root', '/root/child/', '2026-10-08T00:00:00Z', '2026-10-08T00:00:00Z'),
			 ('leaf', 'LEAF', 'Leaf', 'child', '/root/child/leaf/', '2026-10-08T00:00:00Z', '2026-10-08T00:00:00Z'),
			 ('sibling', 'SIBLING', 'Sibling', 'root', '/root/sibling/', '2026-10-08T00:00:00Z', '2026-10-08T00:00:00Z')`,
			`INSERT INTO field_definitions (id, key, label, type, options, is_unique, searchable, required, created_at, updated_at) VALUES
			 ('a', 'tag', 'Tag', 'text', '{"pattern":"^[A-Z]+$"}', 1, 1, 1, '2026-10-08T00:00:00Z', '2026-10-08T00:00:00Z'),
			 ('b', 'note', 'Note', 'text', '{}', 0, 0, 0, '2026-10-08T00:00:00Z', '2026-10-08T00:00:00Z'),
			 ('c', 'ports', 'Ports', 'number', '{"min":1,"max":48,"precision":0}', 0, 0, 0, '2026-10-08T00:00:00Z', '2026-10-08T00:00:00Z'),
			 ('d', 'watts', 'Watts', 'number', '{}', 0, 0, 0, '2026-10-08T00:00:00Z', '2026-10-08T00:00:00Z'),
			 ('e', 'ports', 'Sibling ports', 'text', '{}', 0, 0, 0, '2026-10-08T00:00:00Z', '2026-10-08T00:00:00Z')`,
			`INSERT INTO category_fields (category_id, field_id, sort) VALUES
			 ('root', 'b', 20), ('root', 'a', 10), ('child', 'c', 1), ('leaf', 'd', 0), ('sibling', 'e', 1)`,
			`INSERT INTO category_field_selections (category_id, field_id) VALUES
			 ('child', 'a'), ('leaf', 'c'), ('leaf', 'a')`,
		}
		for _, query := range statements {
			if _, err := tx.ExecContext(ctx, query); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		t.Fatalf("seed snapshot: %v", err)
	}
}

func snapshotIDs(fields []model.BoundField) []string {
	ids := make([]string, len(fields))
	for i, f := range fields {
		ids[i] = f.ID
	}
	return ids
}

func TestSnapshotSelectsParentFieldsInSourceOrder(t *testing.T) {
	s, ctx := newStore(t)
	seedSnapshot(t, s, ctx)
	snap, err := s.Snapshot(ctx)
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		id   string
		want []string
	}{
		{"root", []string{"a", "b"}},
		{"child", []string{"a", "c"}},
		{"leaf", []string{"a", "c", "d"}},
		{"sibling", []string{"e"}},
	} {
		t.Run(tc.id, func(t *testing.T) {
			fields, err := snap.EffectiveFields(tc.id)
			if err != nil {
				t.Fatal(err)
			}
			if got := snapshotIDs(fields); !reflect.DeepEqual(got, tc.want) {
				t.Fatalf("field IDs = %v, want %v", got, tc.want)
			}
		})
	}
	fields, err := snap.EffectiveFields("leaf")
	if err != nil {
		t.Fatal(err)
	}
	for i, want := range []string{"root", "child", ""} {
		if fields[i].InheritedFrom != want {
			t.Errorf("field %s source = %q, want %q", fields[i].ID, fields[i].InheritedFrom, want)
		}
	}
	if !fields[0].Required || !fields[0].IsUnique || !fields[0].Searchable || fields[0].Sort != 10 {
		t.Fatalf("inherited rules changed: %+v", fields[0])
	}
	if _, err := snap.EffectiveFields("missing"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("unknown category error = %v", err)
	}
}

// This spy forwards every query to a real transaction. Its count guards the
// no-per-asset-SQL contract, not a mocked storage implementation.
type snapshotQueryCounter struct {
	store.Querier
	calls int
}

func (q *snapshotQueryCounter) QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error) {
	q.calls++
	return q.Querier.QueryContext(ctx, query, args...)
}

func (q *snapshotQueryCounter) QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row {
	q.calls++
	return q.Querier.QueryRowContext(ctx, query, args...)
}

func TestSnapshotLoadsOnceAndReadsUncommittedSelections(t *testing.T) {
	s, ctx := newStore(t)
	seedSnapshot(t, s, ctx)
	rollback := errors.New("rollback snapshot fixture")
	err := s.db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		if _, err := tx.ExecContext(ctx, `INSERT INTO category_field_selections VALUES ('child', 'b')`); err != nil {
			return err
		}
		q := &snapshotQueryCounter{Querier: tx}
		snap, err := LoadSchemaSnapshot(ctx, q)
		if err != nil {
			return err
		}
		loaded := q.calls
		if loaded == 0 || loaded > 8 {
			t.Fatalf("snapshot requires %d queries, want at most eight batch loads", loaded)
		}
		for range 100 {
			fields, err := snap.EffectiveFields("child")
			if err != nil {
				return err
			}
			if got := snapshotIDs(fields); !reflect.DeepEqual(got, []string{"a", "b", "c"}) {
				t.Fatalf("snapshot missed its transaction's selection: %v", got)
			}
			fields[0].Label = "caller mutation"
			*fields[2].Options.Min = 999
			*fields[2].Options.Max = 999
			*fields[2].Options.Precision = 9
		}
		if q.calls != loaded {
			t.Fatalf("resolving cached categories issued %d additional queries", q.calls-loaded)
		}
		fields, err := snap.EffectiveFields("child")
		if err != nil {
			return err
		}
		if fields[0].Label != "Tag" || *fields[2].Options.Min != 1 || *fields[2].Options.Max != 48 || *fields[2].Options.Precision != 0 {
			t.Fatal("caller mutation poisoned the cached field definition or nested options")
		}
		return rollback
	})
	if !errors.Is(err, rollback) {
		t.Fatal(err)
	}
	snap, err := s.Snapshot(ctx)
	if err != nil {
		t.Fatal(err)
	}
	fields, err := snap.EffectiveFields("child")
	if err != nil {
		t.Fatal(err)
	}
	if got := snapshotIDs(fields); !reflect.DeepEqual(got, []string{"a", "c"}) {
		t.Fatalf("rolled-back selection leaked: %v", got)
	}
}

func TestSnapshotKeepsDeviceFieldsSeparate(t *testing.T) {
	s, ctx := newStore(t)
	seedSnapshot(t, s, ctx)
	vendorID := vendorNamed(t, s, ctx, "Acme")
	first, err := s.CreateModel(ctx, CreateModelInput{Name: "First", VendorID: vendorID})
	if err != nil {
		t.Fatal(err)
	}
	second, err := s.CreateModel(ctx, CreateModelInput{Name: "Second"})
	if err != nil {
		t.Fatal(err)
	}
	shared, err := s.CreateField(ctx, CreateFieldInput{Key: "serial", Label: "Serial", Type: model.FieldText})
	if err != nil {
		t.Fatal(err)
	}
	other, err := s.CreateField(ctx, CreateFieldInput{Key: "serial", Label: "Other serial", Type: model.FieldText})
	if err != nil {
		t.Fatal(err)
	}
	for _, bind := range []func() error{
		func() error { return s.BindVendor(ctx, vendorID, shared.ID, 10) },
		func() error { return s.BindModel(ctx, first.ID, shared.ID, 10) },
		func() error { return s.BindModel(ctx, second.ID, other.ID, 20) },
	} {
		if err := bind(); err != nil {
			t.Fatal(err)
		}
	}
	snap, err := s.Snapshot(ctx)
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		modelID string
		want    []string
	}{
		{"", []string{"e"}},
		{first.ID, []string{"e", shared.ID}},
		{second.ID, []string{"e", other.ID}},
	} {
		fields, err := snap.FieldsForAsset("/root/sibling/", tc.modelID)
		if err != nil {
			t.Fatal(err)
		}
		if got := snapshotIDs(fields); !reflect.DeepEqual(got, tc.want) {
			t.Fatalf("model %q fields = %v, want %v", tc.modelID, got, tc.want)
		}
		if tc.modelID == first.ID {
			if !reflect.DeepEqual(fields[1].VendorIDs, []string{vendorID}) || !reflect.DeepEqual(fields[1].ModelIDs, []string{first.ID}) {
				t.Fatalf("vendor/direct union lost or duplicated provenance: %+v", fields[1])
			}
			fields[1].ModelIDs[0] = "caller mutation"
		}
	}
	all, err := snap.EveryPossibleField("sibling")
	if err != nil {
		t.Fatal(err)
	}
	if got := snapshotIDs(all); !reflect.DeepEqual(got, []string{"e", shared.ID, other.ID}) {
		t.Fatalf("mixed-model columns = %v", got)
	}
	fields, err := snap.FieldsForAsset("/root/sibling/", first.ID)
	if err != nil || fields[1].ModelIDs[0] != first.ID {
		t.Fatalf("device cache corrupted: %v, %v", fields, err)
	}
}

func TestSnapshotKeepsExistingChoicesWhenParentGainsFields(t *testing.T) {
	s, ctx := newStore(t)
	seedSnapshot(t, s, ctx)
	before, err := s.Snapshot(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if err := s.db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `INSERT INTO field_definitions
			(id, key, label, type, options, created_at, updated_at)
			VALUES ('new', 'new_key', 'New', 'text', '{}', '2026-10-08T00:00:00Z', '2026-10-08T00:00:00Z')`)
		if err != nil {
			return err
		}
		_, err = tx.ExecContext(ctx, `INSERT INTO category_fields (category_id, field_id, sort) VALUES ('root', 'new', 10)`)
		return err
	}); err != nil {
		t.Fatal(err)
	}
	parent := "root"
	child, err := s.CreateCategory(ctx, CreateCategoryInput{Code: "NEW", Name: "New child", ParentID: &parent})
	if err != nil {
		t.Fatal(err)
	}
	after, err := s.Snapshot(ctx)
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		snapshot *SchemaSnapshot
		category string
		want     []string
	}{
		{before, "root", []string{"a", "b"}},
		{after, "root", []string{"a", "new", "b"}},
		{after, "child", []string{"a", "c"}},
		{after, "leaf", []string{"a", "c", "d"}},
		{after, child.ID, []string{}},
	} {
		fields, err := tc.snapshot.EffectiveFields(tc.category)
		if err != nil {
			t.Fatal(err)
		}
		if got := snapshotIDs(fields); !reflect.DeepEqual(got, tc.want) {
			t.Fatalf("category %s fields = %v, want %v", tc.category, got, tc.want)
		}
	}
}

func TestSnapshotRejectsBrokenCategoryGraphs(t *testing.T) {
	for _, tc := range []struct {
		name     string
		query    string
		category string
	}{
		{"root selection", `INSERT INTO category_field_selections VALUES ('root', 'a')`, "root"},
		{"parent cycle", `UPDATE categories SET parent_id = 'leaf' WHERE id = 'root'`, "leaf"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			s, ctx := newStore(t)
			seedSnapshot(t, s, ctx)
			if err := s.db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
				_, err := tx.ExecContext(ctx, tc.query)
				return err
			}); err != nil {
				t.Fatal(err)
			}
			snap, err := s.Snapshot(ctx)
			if err != nil {
				t.Fatal(err)
			}
			if _, err := snap.EffectiveFields(tc.category); err == nil {
				t.Fatal("invalid category graph resolved successfully")
			}
		})
	}
}

func TestSnapshotRejectsUnselectedAncestorKeyConflict(t *testing.T) {
	s, ctx := newStore(t)
	seedSnapshot(t, s, ctx)
	if err := s.db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `INSERT INTO category_fields (category_id, field_id, sort) VALUES ('root', 'e', 30)`)
		return err
	}); err != nil {
		t.Fatal(err)
	}
	snap, err := s.Snapshot(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := snap.EffectiveFields("child"); !errors.Is(err, ErrKeyConflict) {
		t.Fatalf("same-chain keys must conflict even without inheritance, got %v", err)
	}
}

func TestSnapshotRejectsSelectionsThatSkipTheParent(t *testing.T) {
	s, ctx := newStore(t)
	seedSnapshot(t, s, ctx)
	if err := s.db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `INSERT INTO category_field_selections VALUES ('leaf', 'b')`)
		return err
	}); err != nil {
		t.Fatal(err)
	}
	snap, err := s.Snapshot(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := snap.EffectiveFields("leaf"); err == nil {
		t.Fatal("a grandparent binding absent from the parent must not become effective")
	}
}
