package asset

import (
	"context"
	"database/sql"
	"testing"

	"github.com/klskk23/nexus-assets/internal/store"
)

// selectFixtureFields describes explicit inheritance in legacy asset scenarios.
// Schema mutation tests must exercise the planner rather than this fixture helper.
func selectFixtureFields(t *testing.T, db *store.Store, ctx context.Context, categoryID string, fieldIDs ...string) {
	t.Helper()
	if err := db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		for _, fieldID := range fieldIDs {
			if _, err := tx.ExecContext(ctx, `INSERT INTO category_field_selections (category_id, field_id) VALUES (?, ?)`, categoryID, fieldID); err != nil {
				return err
			}
		}
		return nil
	}); err != nil {
		t.Fatalf("select fixture fields: %v", err)
	}
}
