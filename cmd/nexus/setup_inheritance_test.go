package main

import (
	"context"
	"database/sql"
	"errors"
	"path/filepath"
	"testing"

	"github.com/klskk23/nexus-assets/internal/asset"
	"github.com/klskk23/nexus-assets/internal/config"
	"github.com/klskk23/nexus-assets/internal/holder"
	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/schema"
)

// Exercise production assembly rather than constructing a separate schema store
// in the test. A missing adapter must not hide behind effects-only test fixtures.
func TestSetupAppliesInheritedFieldEffects(t *testing.T) {
	dir := t.TempDir()
	for key, value := range map[string]string{
		config.EnvFileVar: "unused", "NEXUS_DB_PATH": filepath.Join(dir, "test.db"),
		"NEXUS_JWT_SECRET":            "test-only-not-a-deployment-secret",
		"NEXUS_ALLOWED_EMAIL_DOMAINS": "example.com", "NEXUS_ADMIN_EMAIL": "admin@example.com",
		"NEXUS_ADMIN_PASSWORD": "test-password-only", "NEXUS_ADMIN_API_KEY": "",
		"NEXUS_JWT_TTL": "15m", "NEXUS_REFRESH_TTL": "720h", "NEXUS_OIDC_REQUIRE_HD": "true",
	} {
		if key == config.EnvFileVar {
			value = filepath.Join(dir, "absent.env")
		}
		t.Setenv(key, value)
	}
	ctx := context.Background()
	a, err := setup(ctx)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := a.db.Close(); err != nil {
			t.Error(err)
		}
	})
	root, err := a.schema.CreateCategory(ctx, schema.CreateCategoryInput{Code: "ROOT", Name: "Root"})
	if err != nil {
		t.Fatal(err)
	}
	child, err := a.schema.CreateCategory(ctx, schema.CreateCategoryInput{Code: "CHILD", Name: "Child", ParentID: &root.ID})
	if err != nil {
		t.Fatal(err)
	}
	field, err := a.schema.CreateField(ctx, schema.CreateFieldInput{
		Key: "rack_tag", Label: "Rack tag", Type: model.FieldText, IsUnique: true, CategoryIDs: []string{root.ID},
	})
	if err != nil {
		t.Fatal(err)
	}
	loc, err := a.holders.Create(ctx, holder.CreateInput{Type: model.EntityLocation, Name: "Stock"})
	if err != nil {
		t.Fatal(err)
	}
	var userID string
	if err := a.db.ReadDB().QueryRowContext(ctx, `SELECT id FROM users WHERE email = 'admin@example.com'`).Scan(&userID); err != nil {
		t.Fatal(err)
	}
	saved, err := a.assets.Save(ctx, asset.SaveInput{
		CategoryID: child.ID, Status: model.StatusInStock, OwnerID: userID, ActorID: userID,
		Holder: model.Holder{Type: model.HolderTypeEntity, ID: loc.ID}, Attrs: map[string]any{},
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := a.db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `UPDATE assets SET attrs = '{"rack_tag":"RACK-A"}' WHERE id = ?`, saved.ID)
		return err
	}); err != nil {
		t.Fatal(err)
	}
	selected := []string{field.ID}
	if _, err := a.schema.UpdateCategory(ctx, child.ID, schema.UpdateCategoryInput{InheritedFieldIDs: &selected}); err != nil {
		t.Fatalf("production assembly did not apply inherited field: %v", err)
	}
	got, err := a.assets.Get(ctx, saved.ID)
	if err != nil || got.Version != saved.Version+1 || got.Attrs[field.Key] != "RACK-A" {
		t.Fatalf("restored asset = %+v, %v", got, err)
	}
	var scope, value string
	if err := a.db.ReadDB().QueryRowContext(ctx, `SELECT scope_id, value FROM asset_unique_values WHERE asset_id = ? AND field_key = 'rack_tag' AND archived_at IS NULL AND search_suppressed = 0`, saved.ID).Scan(&scope, &value); err != nil || scope != root.ID || value != "RACK-A" {
		t.Fatalf("restored claim = %q/%q, %v", scope, value, err)
	}
	selected = []string{}
	if _, err := a.schema.UpdateCategory(ctx, child.ID, schema.UpdateCategoryInput{InheritedFieldIDs: &selected}); !errors.Is(err, schema.ErrConfirmationRequired) {
		t.Fatalf("unconfirmed production withdrawal = %v", err)
	}
}
