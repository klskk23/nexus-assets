package schema

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"testing"

	"github.com/klskk23/nexus-assets/internal/model"
)

func TestMigrationSeedsTheFiveBuiltinsWithTheirBehaviour(t *testing.T) {
	s, ctx := newStore(t)

	list, err := s.ListStatuses(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 5 {
		t.Fatalf("got %d statuses, want the five built-ins", len(list))
	}
	// Display order, not insertion order.
	want := []model.AssetStatus{
		model.StatusInStock, model.StatusInUse, model.StatusInRepair,
		model.StatusLost, model.StatusRetired,
	}
	for i, w := range want {
		if list[i].Key != w {
			t.Errorf("position %d = %s, want %s", i, list[i].Key, w)
		}
		if !list[i].Builtin {
			t.Errorf("%s must be marked built-in", list[i].Key)
		}
	}

	set := model.NewStatusSet(list)
	if set.CountsAsAvailable(model.StatusRetired) {
		t.Error("retired must still be excluded from the distribution")
	}
	if set.CanTransition(model.StatusRetired, model.StatusInStock) {
		t.Error("retired must still be terminal")
	}
}

func TestCreateStatusRejectsAKeyThatWouldNotSurviveAURL(t *testing.T) {
	s, ctx := newStore(t)

	for _, bad := range []string{"On Loan", "on-loan", "外借", "1st", ""} {
		_, err := s.CreateStatus(ctx, CreateStatusInput{Key: bad, Label: "外借中", Color: "violet"})
		// The sentinel is what keeps this a 422 rather than a 500.
		if !errors.Is(err, ErrStatusInvalid) {
			t.Errorf("key %q gave %v, want ErrStatusInvalid", bad, err)
		}
	}
}

func TestCreateStatusRejectsAColourOutsideThePalette(t *testing.T) {
	s, ctx := newStore(t)

	// A free hex value is exactly what the palette exists to prevent: it would
	// be picked in one theme and unreadable in the other.
	_, err := s.CreateStatus(ctx, CreateStatusInput{
		Key: "on_loan", Label: "外借中", Color: "#ff00aa",
	})
	if !errors.Is(err, ErrStatusInvalid) {
		t.Fatalf("a hex colour gave %v, want ErrStatusInvalid", err)
	}
}

func TestCustomStatusSortsAfterTheBuiltins(t *testing.T) {
	s, ctx := newStore(t)

	st, err := s.CreateStatus(ctx, CreateStatusInput{
		Key: "on_loan", Label: "外借中", Color: "violet", CountsAsAvailable: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	if st.Builtin {
		t.Error("a status created at runtime must not claim to be built-in")
	}

	list, err := s.ListStatuses(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if list[len(list)-1].Key != "on_loan" {
		t.Errorf("new status should sort last, list ends with %s", list[len(list)-1].Key)
	}
}

func TestBuiltinStatusCannotBeDeleted(t *testing.T) {
	s, ctx := newStore(t)

	_, err := s.DeleteStatus(ctx, string(model.StatusInStock))
	if !errors.Is(err, ErrStatusBuiltin) {
		t.Fatalf("got %v, want ErrStatusBuiltin", err)
	}
	// The refusal has to name what is in the way, like every other refusal.
	if !strings.Contains(err.Error(), "在库") {
		t.Errorf("message should name the status, got %v", err)
	}
}

// A built-in may be relabelled and recoloured; its behaviour may not, because
// the overview and the transition matrix are written against what it means.
func TestBuiltinCountingAndTerminalCannotBeRewired(t *testing.T) {
	s, ctx := newStore(t)

	yes, no := true, false
	out, err := s.UpdateStatus(ctx, string(model.StatusRetired), UpdateStatusInput{
		CountsAsAvailable: &yes, Terminal: &no,
	})
	if err != nil {
		t.Fatal(err)
	}
	if out.CountsAsAvailable {
		t.Error("retired must stay out of the category distribution")
	}
	if !out.Terminal {
		t.Error("retired must stay terminal")
	}
}

func TestDeleteStatusRefusesWhileDevicesAreInIt(t *testing.T) {
	s, ctx := newStore(t)
	root, _ := tree(t, s, ctx)

	if _, err := s.CreateStatus(ctx, CreateStatusInput{
		Key: "on_loan", Label: "外借中", Color: "violet", CountsAsAvailable: true,
	}); err != nil {
		t.Fatal(err)
	}
	seedAsset(t, s, ctx, root.ID, "a1", `{}`)
	seedAsset(t, s, ctx, root.ID, "a2", `{}`)
	setStatus(t, s, ctx, "on_loan", "a1", "a2")

	total, err := s.DeleteStatus(ctx, "on_loan")
	if !errors.Is(err, ErrStatusInUse) {
		t.Fatalf("got %v, want ErrStatusInUse", err)
	}
	if total != 2 {
		t.Errorf("refusal should carry the count, got %d", total)
	}
	if !strings.Contains(err.Error(), "2 台") {
		t.Errorf("message should say how many are in the way, got %v", err)
	}

	// Moving them out clears the block; nothing else had to change.
	setStatus(t, s, ctx, string(model.StatusInStock), "a1", "a2")
	if _, err := s.DeleteStatus(ctx, "on_loan"); err != nil {
		t.Fatalf("delete after the devices moved: %v", err)
	}
}

// Decision 60: history warns, it does not refuse. A status used once must not
// become permanently undeletable.
func TestDeleteStatusAllowedWhenOnlyHistoryMentionsIt(t *testing.T) {
	s, ctx := newStore(t)
	root, _ := tree(t, s, ctx)

	if _, err := s.CreateStatus(ctx, CreateStatusInput{
		Key: "on_loan", Label: "外借中", Color: "violet", CountsAsAvailable: true,
	}); err != nil {
		t.Fatal(err)
	}
	seedAsset(t, s, ctx, root.ID, "a1", `{}`)
	seedTransfer(t, s, ctx, "a1", "on_loan", string(model.StatusInStock))

	assets, history, err := s.StatusUsage(ctx, "on_loan")
	if err != nil {
		t.Fatal(err)
	}
	if assets != 0 || history != 1 {
		t.Fatalf("usage = %d assets / %d events, want 0 / 1", assets, history)
	}
	if _, err := s.DeleteStatus(ctx, "on_loan"); err != nil {
		t.Fatalf("history alone must not block the delete: %v", err)
	}
}

func TestAllStatusUsageCountsAnEventOnceWhenBothEndsMatch(t *testing.T) {
	s, ctx := newStore(t)
	root, _ := tree(t, s, ctx)

	seedAsset(t, s, ctx, root.ID, "a1", `{}`)
	// A holder-only move: the status is the same on both sides of the event.
	seedTransfer(t, s, ctx, "a1", string(model.StatusInStock), string(model.StatusInStock))

	usage, err := s.AllStatusUsage(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if got := usage[string(model.StatusInStock)]; got.History != 1 {
		t.Errorf("history = %d, want the event counted once", got.History)
	}
	if got := usage[string(model.StatusInStock)]; got.Assets != 1 {
		t.Errorf("assets = %d, want 1", got.Assets)
	}
}

func setStatus(t *testing.T, s *Store, ctx context.Context, status string, ids ...string) {
	t.Helper()
	err := s.db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		for _, id := range ids {
			if _, err := tx.ExecContext(ctx,
				`UPDATE assets SET status = ? WHERE id = ?`, status, id); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		t.Fatalf("set status: %v", err)
	}
}

func seedTransfer(t *testing.T, s *Store, ctx context.Context, assetID, from, to string) {
	t.Helper()
	const ts = "2026-01-01T00:00:00Z"
	err := s.db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx,
			`INSERT INTO asset_transfers
			   (id, asset_id, kind, from_status, from_holder_type, from_holder_id, from_owner_id,
			    to_status, to_holder_type, to_holder_id, to_owner_id, actor_id, created_at)
			 VALUES ('t-'||?, ?, 'status_change', ?, 'user', 'u1', 'u1', ?, 'user', 'u1', 'u1', 'u1', ?)`,
			assetID, assetID, from, to, ts)
		return err
	})
	if err != nil {
		t.Fatalf("seed transfer: %v", err)
	}
}
