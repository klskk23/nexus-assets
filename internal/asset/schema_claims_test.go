package asset

import (
	"context"
	"database/sql"
	"reflect"
	"strings"
	"testing"
	"time"
)

// Per-asset release/insert rejects a valid exchange because the other asset's
// old claim is still live. The final batch, not its intermediate order, matters.
func TestSchemaClaimsReleaseWholeBatchBeforeInsert(t *testing.T) {
	f := newFixture(t)
	a, err := f.save(t, SaveInput{Attrs: map[string]any{"mac": "001A2B3C4D5E"}})
	if err != nil {
		t.Fatal(err)
	}
	b, err := f.save(t, SaveInput{Attrs: map[string]any{"mac": "001A2B3C4D5F"}})
	if err != nil {
		t.Fatal(err)
	}
	changes := []schemaClaimChange{
		{assetID: a.ID, want: map[string]UniqueValue{
			"mac": {Value: "001A2B3C4D5F", Scope: f.rootID},
			"sn":  {Value: "112394521950", Scope: f.rootID},
		}},
		{assetID: b.ID, want: map[string]UniqueValue{
			"mac": {Value: "001A2B3C4D5E", Scope: f.rootID},
			"sn":  {Value: "112394521951", Scope: f.rootID},
		}},
	}
	before := preparedAssetState(t, f)
	err = f.svc.db.Write(f.ctx, func(ctx context.Context, tx *sql.Tx) error {
		return syncSchemaClaims(ctx, tx, changes, time.Now().UTC())
	})
	if err != nil {
		t.Fatalf("valid final exchange refused: %v", err)
	}
	assertSchemaClaimRows(t, f, a.ID, "mac", []claimRow{
		{"001A2B3C4D5E", f.rootID, true, false},
		{"001A2B3C4D5F", f.rootID, false, false},
	})
	assertSchemaClaimRows(t, f, b.ID, "mac", []claimRow{
		{"001A2B3C4D5F", f.rootID, true, false},
		{"001A2B3C4D5E", f.rootID, false, false},
	})
	assertSchemaClaimRows(t, f, a.ID, "sn", []claimRow{{"112394521950", f.rootID, false, false}})
	after := preparedAssetState(t, f)
	for _, table := range []string{"assets", "asset_search_values", "asset_transfers"} {
		if !reflect.DeepEqual(before[table], after[table]) {
			t.Errorf("claim writer unexpectedly changed %s", table)
		}
	}
}

// Withdrawal is different from ordinary renumbering: every past identity for
// the withdrawn key stops being searchable, even if it was already archived.
func TestSchemaClaimsWithdrawalAndRestoreKeepHistorySuppressed(t *testing.T) {
	f := newFixture(t)
	a, err := f.save(t, SaveInput{Attrs: map[string]any{"mac": "001A2B3C4D5E"}})
	if err != nil {
		t.Fatal(err)
	}
	a, err = f.save(t, SaveInput{ID: a.ID, Version: a.Version, Attrs: map[string]any{"mac": "001A2B3C4D5F"}})
	if err != nil {
		t.Fatal(err)
	}
	keep := map[string]UniqueValue{"sn": {Value: "112394521951", Scope: f.rootID}}
	apply := func(change schemaClaimChange) {
		t.Helper()
		if err := f.svc.db.Write(f.ctx, func(ctx context.Context, tx *sql.Tx) error {
			return syncSchemaClaims(ctx, tx, []schemaClaimChange{change}, time.Now().UTC())
		}); err != nil {
			t.Fatal(err)
		}
	}
	apply(schemaClaimChange{assetID: a.ID, want: keep, withdrawn: []string{"mac"}})
	assertSchemaClaimRows(t, f, a.ID, "mac", []claimRow{
		{"001A2B3C4D5E", f.rootID, true, true},
		{"001A2B3C4D5F", f.rootID, true, true},
	})
	assertSchemaClaimRows(t, f, a.ID, "sn", []claimRow{
		{"112394521950", f.rootID, true, false},
		{"112394521951", f.rootID, false, false},
	})
	keep["mac"] = UniqueValue{Value: "001A2B3C4D5F", Scope: f.rootID}
	apply(schemaClaimChange{assetID: a.ID, want: keep})
	want := []claimRow{
		{"001A2B3C4D5E", f.rootID, true, true},
		{"001A2B3C4D5F", f.rootID, true, true},
		{"001A2B3C4D5F", f.rootID, false, false},
	}
	assertSchemaClaimRows(t, f, a.ID, "mac", want)
	before := preparedAssetState(t, f)
	apply(schemaClaimChange{assetID: a.ID, want: keep})
	if !reflect.DeepEqual(before, preparedAssetState(t, f)) {
		t.Fatal("unchanged final claims rewrote current or historical rows")
	}
}

func TestSchemaClaimsSourceChangeKeepsHistorySearchable(t *testing.T) {
	f := newFixture(t)
	a, err := f.save(t, SaveInput{Attrs: map[string]any{"mac": "001A2B3C4D5E"}})
	if err != nil {
		t.Fatal(err)
	}
	err = f.svc.db.Write(f.ctx, func(ctx context.Context, tx *sql.Tx) error {
		return syncSchemaClaims(ctx, tx, []schemaClaimChange{{assetID: a.ID, want: map[string]UniqueValue{
			"mac": {Value: "001A2B3C4D5E", Scope: f.catID},
			"sn":  {Value: "112394521950", Scope: f.rootID},
		}}}, time.Now().UTC())
	})
	if err != nil {
		t.Fatal(err)
	}
	assertSchemaClaimRows(t, f, a.ID, "mac", []claimRow{
		{"001A2B3C4D5E", f.rootID, true, false},
		{"001A2B3C4D5E", f.catID, false, false},
	})
}

func TestSchemaClaimsFailureRollsBackReleasesAndMetadata(t *testing.T) {
	for _, failure := range []string{"untouched_collision", "insert_failure"} {
		t.Run(failure, func(t *testing.T) {
			f := newFixture(t)
			a, err := f.save(t, SaveInput{Attrs: map[string]any{"mac": "001A2B3C4D5E"}})
			if err != nil {
				t.Fatal(err)
			}
			if _, err := f.save(t, SaveInput{Attrs: map[string]any{"mac": "001A2B3C4D5F"}}); err != nil {
				t.Fatal(err)
			}
			before := preparedAssetState(t, f)
			err = f.svc.db.Write(f.ctx, func(ctx context.Context, tx *sql.Tx) error {
				if _, err := tx.ExecContext(ctx, `UPDATE categories SET name = 'Must roll back' WHERE id = ?`, f.catID); err != nil {
					return err
				}
				value := "001A2B3C4D5F"
				if failure == "insert_failure" {
					value = "001A2B3C4D60"
					if _, err := tx.ExecContext(ctx, `CREATE TEMP TRIGGER refuse_schema_claim BEFORE INSERT ON asset_unique_values
						BEGIN SELECT RAISE(ABORT, 'injected claim failure'); END`); err != nil {
						return err
					}
				}
				return syncSchemaClaims(ctx, tx, []schemaClaimChange{{assetID: a.ID, withdrawn: []string{"sn"}, want: map[string]UniqueValue{
					"mac": {Value: value, Scope: f.rootID},
				}}}, time.Now().UTC())
			})
			if err == nil {
				t.Fatal("claim failure was accepted")
			}
			wantError := "UNIQUE constraint failed"
			if failure == "insert_failure" {
				wantError = "injected claim failure"
			}
			if !strings.Contains(err.Error(), wantError) {
				t.Fatalf("batch did not reach expected failure: %v", err)
			}
			if !reflect.DeepEqual(before, preparedAssetState(t, f)) {
				t.Fatal("failed batch left partial releases, suppression or claims")
			}
			var name string
			if err := f.svc.db.ReadDB().QueryRowContext(f.ctx, `SELECT name FROM categories WHERE id = ?`, f.catID).Scan(&name); err != nil {
				t.Fatal(err)
			}
			if name != "SDWAN 路由器" {
				t.Fatalf("failed batch left metadata: %s", name)
			}
		})
	}
}

type claimRow struct {
	value, scope         string
	archived, suppressed bool
}

func assertSchemaClaimRows(t *testing.T, f *fixture, assetID, key string, want []claimRow) {
	t.Helper()
	rows, err := f.svc.db.ReadDB().QueryContext(f.ctx, `SELECT value, scope_id, archived_at IS NOT NULL, search_suppressed
		FROM asset_unique_values WHERE asset_id = ? AND field_key = ? ORDER BY rowid`, assetID, key)
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		if err := rows.Close(); err != nil {
			t.Error(err)
		}
	}()
	var got []claimRow
	for rows.Next() {
		var row claimRow
		if err := rows.Scan(&row.value, &row.scope, &row.archived, &row.suppressed); err != nil {
			t.Fatal(err)
		}
		got = append(got, row)
	}
	if err := rows.Err(); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("%s claims = %+v, want %+v", key, got, want)
	}
}
