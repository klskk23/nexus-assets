package schema

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"testing"

	"github.com/klskk23/nexus-assets/internal/store"
)

// A form that sends only what it changed must not blank the rest.
//
// TestUpdateModelReplacesItsCategories used to stand above this one, pinning
// that a patch replaced the category list wholesale. 029 removed the list --
// a model belongs to no category -- so there is nothing left of that test to
// keep.
func TestUpdateModelLeavesUnsentFieldsAlone(t *testing.T) {
	s, ctx := newStore(t)

	m, err := s.CreateModel(ctx, CreateModelInput{
		Name: "X100", VendorID: vendorNamed(t, s, ctx, "Acme"),
		AttrDefaults: map[string]any{"firmware": "1.0"},
	})
	if err != nil {
		t.Fatal(err)
	}

	vendor := vendorNamed(t, s, ctx, "Beta")
	if _, err := s.UpdateModel(ctx, m.ID, UpdateModelInput{VendorID: &vendor}); err != nil {
		t.Fatal(err)
	}
	got, _ := s.GetModel(ctx, m.ID)
	// The name comes back from the join, so a rename would follow it here.
	if got.VendorName != "Beta" {
		t.Errorf("vendor = %q", got.VendorName)
	}
	if got.Name != "X100" {
		t.Errorf("name should be untouched, got %q", got.Name)
	}
	if got.AttrDefaults["firmware"] != "1.0" {
		t.Errorf("defaults should be untouched, got %v", got.AttrDefaults)
	}
}

// Renaming onto another vendor's product is still a collision, and the message
// has to name both halves.
func TestUpdateModelIntoADuplicateIsRefused(t *testing.T) {
	s, ctx := newStore(t)

	if _, err := s.CreateModel(ctx, CreateModelInput{Name: "X100", VendorID: vendorNamed(t, s, ctx, "Acme")}); err != nil {
		t.Fatal(err)
	}
	other, err := s.CreateModel(ctx, CreateModelInput{Name: "X200", VendorID: vendorNamed(t, s, ctx, "Acme")})
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

	m, err := s.CreateModel(ctx, CreateModelInput{Name: "X100", VendorID: vendorNamed(t, s, ctx, "Acme")})
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
