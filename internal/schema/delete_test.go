package schema

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"testing"

	"github.com/klskk23/nexus-assets/internal/model"
)

// seedAsset writes an asset row directly. The schema package has no asset
// service, and what these tests need from one is only that a row exists with a
// given attrs blob.
func seedAsset(t *testing.T, s *Store, ctx context.Context, categoryID, id, attrs string) {
	t.Helper()
	const ts = "2026-01-01T00:00:00Z"
	err := s.db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		if _, err := tx.ExecContext(ctx,
			`INSERT OR IGNORE INTO users (id, email, name, auth_type, created_at, updated_at)
			 VALUES ('u1', 'a@example.com', '管理员', 'local', ?, ?)`, ts, ts); err != nil {
			return err
		}
		_, err := tx.ExecContext(ctx,
			`INSERT INTO assets (id, category_id, status, owner_id, holder_type, holder_id,
			                     attrs, created_at, updated_at)
			 VALUES (?, ?, 'in_stock', 'u1', 'user', 'u1', ?, ?, ?)`,
			id, categoryID, attrs, ts, ts)
		return err
	})
	if err != nil {
		t.Fatalf("seed asset %s: %v", id, err)
	}
}

// The whole point of the change: a mistake made during configuration should be
// removable, not permanently parked in a list of disabled entries.
func TestDeleteFieldRemovesAnUnusedItemEntirely(t *testing.T) {
	s, ctx := newStore(t)
	root, _ := tree(t, s, ctx)

	f, err := s.CreateField(ctx, CreateFieldInput{Key: "typo", Label: "打错了", Type: model.FieldText})
	if err != nil {
		t.Fatal(err)
	}
	if _, _, _, err := s.DeleteField(ctx, f.ID); err != nil {
		t.Fatalf("an unbound field must delete: %v", err)
	}

	// Bound but never filled in is still deletable -- that is the common case
	// for a configuration mistake, and refusing it would defeat the purpose.
	g, err := s.CreateField(ctx, CreateFieldInput{Key: "rack", Label: "机柜", Type: model.FieldText})
	if err != nil {
		t.Fatal(err)
	}
	if err := s.Bind(ctx, root.ID, g.ID, false, 10); err != nil {
		t.Fatal(err)
	}
	if _, _, _, err := s.DeleteField(ctx, g.ID); err != nil {
		t.Fatalf("a bound but unused field must delete: %v", err)
	}
	fields, err := s.EffectiveFields(ctx, root.ID)
	if err != nil {
		t.Fatal(err)
	}
	for _, bf := range fields {
		if bf.Key == "rack" {
			t.Error("the binding should have gone with the definition")
		}
	}
}

func TestDeleteFieldRefusedWhileAssetsCarryAValue(t *testing.T) {
	s, ctx := newStore(t)
	root, _ := tree(t, s, ctx)

	f, err := s.CreateField(ctx, CreateFieldInput{Key: "rack", Label: "机柜", Type: model.FieldText})
	if err != nil {
		t.Fatal(err)
	}
	if err := s.Bind(ctx, root.ID, f.ID, false, 10); err != nil {
		t.Fatal(err)
	}
	seedAsset(t, s, ctx, root.ID, "a1", `{"rack":"R-01"}`)
	seedAsset(t, s, ctx, root.ID, "a2", `{"rack":"R-02"}`)

	_, blockers, total, err := s.DeleteField(ctx, f.ID)
	if !errors.Is(err, ErrFieldInUse) {
		t.Fatalf("want ErrFieldInUse, got %v", err)
	}
	if total != 2 || len(blockers) != 2 {
		t.Errorf("blockers = %d of %d, want 2 of 2", len(blockers), total)
	}
	// The message has to say what to do instead, or "cannot delete" is a dead end.
	if !strings.Contains(err.Error(), "解绑") {
		t.Errorf("the refusal should point at unbinding, got %v", err)
	}
	if _, err := s.GetField(ctx, f.ID); err != nil {
		t.Errorf("the field must survive a refused delete: %v", err)
	}
}

// A field that was filled in once and later cleared leaves an empty string
// behind. Counting that as "in use" would make it undeletable for ever while
// the screen shows the column as blank.
func TestDeleteFieldIgnoresEmptyAndBlankValues(t *testing.T) {
	s, ctx := newStore(t)
	root, _ := tree(t, s, ctx)

	f, err := s.CreateField(ctx, CreateFieldInput{Key: "rack", Label: "机柜", Type: model.FieldText})
	if err != nil {
		t.Fatal(err)
	}
	if err := s.Bind(ctx, root.ID, f.ID, false, 10); err != nil {
		t.Fatal(err)
	}
	seedAsset(t, s, ctx, root.ID, "a1", `{"rack":""}`)
	seedAsset(t, s, ctx, root.ID, "a2", `{"rack":"   "}`)
	seedAsset(t, s, ctx, root.ID, "a3", `{"other":"x"}`)

	if _, _, _, err := s.DeleteField(ctx, f.ID); err != nil {
		t.Fatalf("blank residue must not block a delete: %v", err)
	}

	// And the residue is gone with it, so "delete" means what it says.
	var n int
	if err := s.db.ReadDB().QueryRowContext(ctx,
		`SELECT count(*) FROM assets WHERE json_extract(attrs, '$.rack') IS NOT NULL`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 0 {
		t.Errorf("%d assets still carry the key after the delete", n)
	}
}

func TestDeleteFieldRefusedWhileConfigurationPointsAtIt(t *testing.T) {
	s, ctx := newStore(t)
	root, _ := tree(t, s, ctx)

	mac, err := s.CreateField(ctx, CreateFieldInput{
		Key: "mac", Label: "基准 MAC", Type: model.FieldMAC, IsUnique: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	sn, err := s.CreateField(ctx, CreateFieldInput{
		Key: "sn", Label: "设备编号", Type: model.FieldComputed, IsUnique: true,
		Options: model.FieldOptions{Template: "{{ .attrs.mac | hex2dec }}"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := s.Bind(ctx, root.ID, mac.ID, true, 10); err != nil {
		t.Fatal(err)
	}
	if err := s.Bind(ctx, root.ID, sn.ID, false, 20); err != nil {
		t.Fatal(err)
	}

	// Read by an expression key.
	refs, _, _, err := s.DeleteField(ctx, mac.ID)
	if !errors.Is(err, ErrFieldReferenced) {
		t.Fatalf("want ErrFieldReferenced, got %v", err)
	}
	if len(refs) != 1 || refs[0].Kind != "field" {
		t.Errorf("the referrer should be the expression key, got %+v", refs)
	}

	// Nominated as the display key.
	key := "sn"
	if _, err := s.UpdateCategory(ctx, root.ID, UpdateCategoryInput{DisplayKey: &key}); err != nil {
		t.Fatal(err)
	}
	refs, _, _, err = s.DeleteField(ctx, sn.ID)
	if !errors.Is(err, ErrFieldReferenced) {
		t.Fatalf("want ErrFieldReferenced, got %v", err)
	}
	if len(refs) != 1 || refs[0].Kind != "display_key" {
		t.Errorf("the referrer should be the category display key, got %+v", refs)
	}
}
