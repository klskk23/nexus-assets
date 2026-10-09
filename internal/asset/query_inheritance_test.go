package asset

import (
	"context"
	"database/sql"
	"testing"

	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/schema"
)

// Build the persisted post-withdrawal index state directly: this tests the two
// search readers independently of the still-fail-closed withdrawal writer.
func TestInheritanceSearchExcludesSuppressedUniqueValues(t *testing.T) {
	for _, archived := range []bool{false, true} {
		name := "live"
		if archived {
			name = "history"
		}
		t.Run(name, func(t *testing.T) {
			f := newFixture(t)
			a, err := f.save(t, SaveInput{Attrs: map[string]any{"mac": "00:1A:2B:3C:4D:5E"}})
			if err != nil {
				t.Fatal(err)
			}
			err = f.svc.db.Write(f.ctx, func(ctx context.Context, tx *sql.Tx) error {
				var retired any
				if archived {
					retired = "2026-10-08T00:00:00Z"
				}
				if _, err := tx.ExecContext(ctx, `UPDATE asset_unique_values SET search_suppressed = 1, archived_at = ? WHERE asset_id = ? AND field_key = 'mac'`, retired, a.ID); err != nil {
					return err
				}
				_, err := tx.ExecContext(ctx, `DELETE FROM asset_search_values WHERE asset_id = ? AND field_key = 'mac'`, a.ID)
				return err
			})
			if err != nil {
				t.Fatal(err)
			}
			for _, query := range []string{"001A2B3C4D5E", "00:1a:2b:3c:4d:5e", "2B3C4D"} {
				result, err := f.svc.List(f.ctx, ListFilter{Q: query})
				if err != nil {
					t.Fatal(err)
				}
				if result.Total != 0 || len(result.Items) != 0 || result.ExactMatchID != "" {
					t.Errorf("suppressed %s query %q reached asset: %+v", name, query, result)
				}
			}
			result, err := f.svc.List(f.ctx, ListFilter{Q: a.ID})
			if err != nil || result.Total != 1 || result.ExactMatchID != a.ID {
				t.Fatalf("UUID identity must remain reachable: %+v, err=%v", result, err)
			}
			if archived {
				history, err := f.svc.ValueHistory(f.ctx, a.ID)
				if err != nil || len(history) != 1 || history[0].Key != "mac" || history[0].Value != "001A2B3C4D5E" {
					t.Fatalf("suppression hid readable history: %+v, err=%v", history, err)
				}
			}
		})
	}
}

func TestInheritanceSearchKeepsIndependentEffectiveMatch(t *testing.T) {
	f := newFixture(t)
	field, err := f.schema.CreateField(f.ctx, schema.CreateFieldInput{Key: "service_tag", Label: "Service tag", Type: model.FieldText, Searchable: true})
	if err != nil {
		t.Fatal(err)
	}
	if err := f.schema.Bind(f.ctx, f.catID, field.ID, 40); err != nil {
		t.Fatal(err)
	}
	a, err := f.save(t, SaveInput{Attrs: map[string]any{"mac": "00:1A:2B:3C:4D:5E", "service_tag": "001A2B3C4D5E"}})
	if err != nil {
		t.Fatal(err)
	}
	err = f.svc.db.Write(f.ctx, func(ctx context.Context, tx *sql.Tx) error {
		if _, err := tx.ExecContext(ctx, `UPDATE asset_unique_values SET search_suppressed = 1, archived_at = '2026-10-08T00:00:00Z' WHERE asset_id = ? AND field_key = 'mac'`, a.ID); err != nil {
			return err
		}
		_, err := tx.ExecContext(ctx, `DELETE FROM asset_search_values WHERE asset_id = ? AND field_key = 'mac'`, a.ID)
		return err
	})
	if err != nil {
		t.Fatal(err)
	}
	result, err := f.svc.List(f.ctx, ListFilter{Q: "001A2B3C4D5E"})
	if err != nil || result.Total != 1 || len(result.Items) != 1 || result.Items[0].ID != a.ID || result.ExactMatchID != "" {
		t.Fatalf("independent non-unique field should list without exact jump: %+v, err=%v", result, err)
	}
}

func TestInheritanceSearchPreservesOrdinaryNumberHistory(t *testing.T) {
	f := newFixture(t)
	a, err := f.save(t, SaveInput{Attrs: map[string]any{"mac": "00:1A:2B:3C:4D:5E"}})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.save(t, SaveInput{ID: a.ID, Version: a.Version, Attrs: map[string]any{"mac": "00:1A:2B:3C:4D:5F"}}); err != nil {
		t.Fatal(err)
	}
	for _, query := range []string{"001A2B3C4D5E", "00:1a:2b:3c:4d:5e"} {
		result, err := f.svc.List(f.ctx, ListFilter{Q: query})
		if err != nil || result.Total != 1 || result.ExactMatchID != a.ID {
			t.Fatalf("ordinary retired code lost reachability: %+v, err=%v", result, err)
		}
	}
}
