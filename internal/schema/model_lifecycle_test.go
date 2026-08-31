package schema

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"testing"

	"github.com/klskk23/nexus-assets/internal/store"
)

func TestUpdateModelReplacesItsCategories(t *testing.T) {
	s, ctx := newStore(t)
	root, child := tree(t, s, ctx)

	m, err := s.CreateModel(ctx, CreateModelInput{
		Name: "X100", Vendor: "Acme", CategoryIDs: []string{root.ID},
	})
	if err != nil {
		t.Fatal(err)
	}

	// Replaced wholesale: the join table carries nothing a diff would keep.
	ids := []string{child.ID}
	name := "X200"
	out, err := s.UpdateModel(ctx, m.ID, UpdateModelInput{Name: &name, CategoryIDs: &ids})
	if err != nil {
		t.Fatal(err)
	}
	if out.Name != "X200" {
		t.Errorf("name = %q", out.Name)
	}
	got, _ := s.GetModel(ctx, m.ID)
	if len(got.CategoryIDs) != 1 || got.CategoryIDs[0] != child.ID {
		t.Errorf("category_ids = %v, want only the child", got.CategoryIDs)
	}
}

// A form that sends only what it changed must not blank the rest.
func TestUpdateModelLeavesUnsentFieldsAlone(t *testing.T) {
	s, ctx := newStore(t)
	root, _ := tree(t, s, ctx)

	m, err := s.CreateModel(ctx, CreateModelInput{
		Name: "X100", Vendor: "Acme", CategoryIDs: []string{root.ID},
		AttrDefaults: map[string]any{"firmware": "1.0"},
	})
	if err != nil {
		t.Fatal(err)
	}

	vendor := "Beta"
	if _, err := s.UpdateModel(ctx, m.ID, UpdateModelInput{Vendor: &vendor}); err != nil {
		t.Fatal(err)
	}
	got, _ := s.GetModel(ctx, m.ID)
	if got.Vendor != "Beta" {
		t.Errorf("vendor = %q", got.Vendor)
	}
	if got.Name != "X100" {
		t.Errorf("name should be untouched, got %q", got.Name)
	}
	if got.AttrDefaults["firmware"] != "1.0" {
		t.Errorf("defaults should be untouched, got %v", got.AttrDefaults)
	}
	if len(got.CategoryIDs) != 1 {
		t.Errorf("categories should be untouched, got %v", got.CategoryIDs)
	}
}

// Renaming onto another vendor's product is still a collision, and the message
// has to name both halves.
func TestUpdateModelIntoADuplicateIsRefused(t *testing.T) {
	s, ctx := newStore(t)

	if _, err := s.CreateModel(ctx, CreateModelInput{Name: "X100", Vendor: "Acme"}); err != nil {
		t.Fatal(err)
	}
	other, err := s.CreateModel(ctx, CreateModelInput{Name: "X200", Vendor: "Acme"})
	if err != nil {
		t.Fatal(err)
	}

	name := "X100"
	_, err = s.UpdateModel(ctx, other.ID, UpdateModelInput{Name: &name})
	if !errors.Is(err, ErrModelDuplicate) {
		t.Fatalf("got %v, want ErrModelDuplicate", err)
	}
	if !strings.Contains(err.Error(), "Acme") {
		t.Errorf("the message should name the vendor, got %v", err)
	}
}

func TestDeleteModelRefusedWhileAssetsUseIt(t *testing.T) {
	s, ctx := newStore(t)
	root, _ := tree(t, s, ctx)

	m, err := s.CreateModel(ctx, CreateModelInput{Name: "X100", Vendor: "Acme"})
	if err != nil {
		t.Fatal(err)
	}
	seedAsset(t, s, ctx, root.ID, "a1", `{}`)
	setModel(t, s, ctx, m.ID, "a1")

	used, err := s.DeleteModel(ctx, m.ID)
	if !errors.Is(err, ErrModelInUse) {
		t.Fatalf("got %v, want ErrModelInUse", err)
	}
	if used != 1 {
		t.Errorf("refusal should carry the count, got %d", used)
	}
	// Clearing the assignment silently would lose which device is which
	// product, so the operator does it deliberately or not at all.
	if _, err := s.GetModel(ctx, m.ID); err != nil {
		t.Errorf("the model must still be there: %v", err)
	}

	setModel(t, s, ctx, "", "a1")
	if _, err := s.DeleteModel(ctx, m.ID); err != nil {
		t.Fatalf("once nothing uses it: %v", err)
	}
}

func TestDeleteModelTakesItsCategoryLinks(t *testing.T) {
	s, ctx := newStore(t)
	root, _ := tree(t, s, ctx)

	m, err := s.CreateModel(ctx, CreateModelInput{
		Name: "X100", Vendor: "Acme", CategoryIDs: []string{root.ID},
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.DeleteModel(ctx, m.ID); err != nil {
		t.Fatal(err)
	}

	var n int
	if err := s.db.ReadDB().QueryRowContext(ctx,
		`SELECT count(*) FROM product_model_categories WHERE model_id = ?`, m.ID).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 0 {
		t.Errorf("the join rows should be gone, %d left", n)
	}
}

func setModel(t *testing.T, s *Store, ctx context.Context, modelID string, assetID string) {
	t.Helper()
	err := s.db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx,
			`UPDATE assets SET model_id = ? WHERE id = ?`, store.NullString(&modelID), assetID)
		return err
	})
	if err != nil {
		t.Fatalf("set model: %v", err)
	}
}
