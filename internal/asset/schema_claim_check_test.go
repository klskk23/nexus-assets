package asset

import (
	"context"
	"database/sql"
	"fmt"
	"testing"
	"time"

	"github.com/klskk23/nexus-assets/internal/model"
)

// Repeatedly scanning all requested slots for every untouched claim makes a
// partial restore quadratic. Exercise the real query with a generous deadline,
// and ensure the last requested slot still detects an untouched owner's claim.
func TestSchemaClaimCheckLargePartialRestore(t *testing.T) {
	f := newFixture(t)
	owner, err := f.save(t, SaveInput{Attrs: map[string]any{"mac": "001A2B3C4D5E"}})
	if err != nil {
		t.Fatal(err)
	}
	const count = 3000
	if err := f.svc.db.Write(f.ctx, func(ctx context.Context, tx *sql.Tx) error {
		for i := range count {
			_, err := tx.ExecContext(ctx, `INSERT INTO asset_unique_values
				(asset_id, field_key, value, scope_id, created_at)
				VALUES (?, 'serial', ?, ?, '2026-10-08T00:00:00Z')`, owner.ID, fmt.Sprintf("occupied-%d", i), f.rootID)
			if err != nil {
				return err
			}
		}
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	fields := []model.BoundField{{FieldDefinition: model.FieldDefinition{ID: "serial-field", Key: "serial"}}}
	effects := make([]schemaAssetEffect, count)
	for i := range effects {
		value := fmt.Sprintf("restored-%d", i)
		if i == count-1 {
			value = "occupied-2999"
		}
		effects[i] = schemaAssetEffect{
			asset:  model.Asset{ID: fmt.Sprintf("restored-%d", i), CategoryID: f.catID},
			fields: fields,
			claims: schemaClaimChange{want: map[string]UniqueValue{"serial": {Value: value, Scope: f.rootID}}},
		}
	}
	ctx, cancel := context.WithTimeout(f.ctx, 5*time.Second)
	defer cancel()
	issues, err := checkSchemaClaims(ctx, f.svc.db.ReadDB(), effects)
	if err != nil {
		t.Fatalf("partial restore claim check: %v", err)
	}
	if len(issues) != 1 || issues[0].AssetID != "restored-2999" || issues[0].ConflictAssetID != owner.ID || issues[0].FieldID != "serial-field" {
		t.Fatalf("last-slot collision = %+v", issues)
	}
}
