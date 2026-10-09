package schema

import (
	"context"
	"database/sql"
	"testing"
)

// selectFixtureFields models explicit choices without exposing an unguarded
// production write API. Mutation/confirmation tests must use the real planner.
func selectFixtureFields(t *testing.T, s *Store, ctx context.Context, categoryID string, fieldIDs ...string) {
	t.Helper()
	if err := s.db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
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
