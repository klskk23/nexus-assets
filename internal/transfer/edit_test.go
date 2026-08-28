package transfer

import (
	"errors"
	"testing"

	"github.com/klskk23/nexus-assets/internal/model"
)

func TestTailEventIsEditableAndLeavesATrace(t *testing.T) {
	f := newFixture(t)
	id := f.newAsset(t, 1)[0]

	res, err := f.svc.Apply(f.ctx, Request{
		AssetIDs: []string{id}, ToStatus: status(model.StatusInUse),
		ToHolder: &model.Holder{Type: model.HolderTypeUser, ID: f.otherID},
		Note:     "选错人了", ActorID: f.userID,
	})
	if err != nil {
		t.Fatalf("checkout: %v", err)
	}
	wrong := res.Transfers[0]

	corrected := "改为交给管理员"
	edited, err := f.svc.Edit(f.ctx, wrong.ID, EditRequest{
		ToHolder: &model.Holder{Type: model.HolderTypeUser, ID: f.userID},
		Note:     &corrected,
		EditorID: f.userID,
	})
	if err != nil {
		t.Fatalf("edit: %v", err)
	}
	if len(edited) != 1 || edited[0].ToHolder.ID != f.userID {
		t.Fatalf("edit did not take: %+v", edited)
	}

	// Without the trace the immutable-log decision would buy nothing.
	stored, err := f.svc.Get(f.ctx, wrong.ID)
	if err != nil {
		t.Fatal(err)
	}
	if stored.EditedAt == nil || stored.EditedBy == nil || *stored.EditedBy != f.userID {
		t.Errorf("the correction left no trace: edited_at=%v edited_by=%v", stored.EditedAt, stored.EditedBy)
	}
	var original string
	if err := f.db.ReadDB().QueryRowContext(f.ctx,
		`SELECT coalesce(original, '') FROM asset_transfers WHERE id = ?`, wrong.ID).Scan(&original); err != nil {
		t.Fatal(err)
	}
	if original == "" {
		t.Error("the pre-edit values must be kept")
	}

	// The edited event is the tail, so the snapshot follows it.
	if snap := f.snapshot(t, id); snap.Holder.ID != f.userID {
		t.Errorf("asset snapshot did not follow the correction: %+v", snap)
	}
}

func TestOnlyTheTailEventCanBeEdited(t *testing.T) {
	f := newFixture(t)
	f.setDefaultStock(t)
	id := f.newAsset(t, 1)[0]

	first, err := f.svc.Apply(f.ctx, Request{
		AssetIDs: []string{id}, ToStatus: status(model.StatusInUse),
		ToHolder: &model.Holder{Type: model.HolderTypeUser, ID: f.otherID}, ActorID: f.userID,
	})
	if err != nil {
		t.Fatal(err)
	}
	// A later event closes the window on the earlier one. No timer involved.
	if _, err := f.svc.Apply(f.ctx, Request{
		AssetIDs: []string{id}, ToStatus: status(model.StatusInStock), CheckIn: true, ActorID: f.userID,
	}); err != nil {
		t.Fatal(err)
	}

	_, err = f.svc.Edit(f.ctx, first.Transfers[0].ID, EditRequest{
		ToHolder: &model.Holder{Type: model.HolderTypeUser, ID: f.userID}, EditorID: f.userID,
	})
	if !errors.Is(err, ErrNotTailEvent) {
		t.Fatalf("want ErrNotTailEvent, got %v", err)
	}
}

func TestBatchEventEditsAsAWhole(t *testing.T) {
	f := newFixture(t)
	ids := f.newAsset(t, 4)

	res, err := f.svc.Apply(f.ctx, Request{
		AssetIDs: ids, ToStatus: status(model.StatusInUse),
		ToHolder: &model.Holder{Type: model.HolderTypeUser, ID: f.otherID}, ActorID: f.userID,
	})
	if err != nil {
		t.Fatal(err)
	}

	// Editing one member corrects the whole batch: leaving the rest behind
	// would make the batch describe two different things at once.
	edited, err := f.svc.Edit(f.ctx, res.Transfers[0].ID, EditRequest{
		ToHolder: &model.Holder{Type: model.HolderTypeUser, ID: f.userID}, EditorID: f.userID,
	})
	if err != nil {
		t.Fatalf("edit: %v", err)
	}
	if len(edited) != 4 {
		t.Fatalf("edited %d events, want the whole batch of 4", len(edited))
	}
	for i, id := range ids {
		if snap := f.snapshot(t, id); snap.Holder.ID != f.userID {
			t.Errorf("asset %d did not follow the batch correction: %+v", i, snap)
		}
	}
}

func TestASecondEditKeepsTheFirstOriginal(t *testing.T) {
	f := newFixture(t)
	id := f.newAsset(t, 1)[0]
	res, err := f.svc.Apply(f.ctx, Request{
		AssetIDs: []string{id}, ToStatus: status(model.StatusInUse),
		ToHolder: &model.Holder{Type: model.HolderTypeUser, ID: f.otherID},
		Note:     "第一版", ActorID: f.userID,
	})
	if err != nil {
		t.Fatal(err)
	}
	eventID := res.Transfers[0].ID

	second := "第二版"
	third := "第三版"
	if _, err := f.svc.Edit(f.ctx, eventID, EditRequest{Note: &second, EditorID: f.userID}); err != nil {
		t.Fatal(err)
	}
	if _, err := f.svc.Edit(f.ctx, eventID, EditRequest{Note: &third, EditorID: f.userID}); err != nil {
		t.Fatal(err)
	}

	var original string
	if err := f.db.ReadDB().QueryRowContext(f.ctx,
		`SELECT original FROM asset_transfers WHERE id = ?`, eventID).Scan(&original); err != nil {
		t.Fatal(err)
	}
	// What the event said when first written is what matters for an audit.
	if !contains(original, "第一版") {
		t.Errorf("the original must survive a second edit, got %s", original)
	}
}

func contains(haystack, needle string) bool {
	return len(haystack) >= len(needle) && (haystack == needle || indexOf(haystack, needle) >= 0)
}

func indexOf(h, n string) int {
	for i := 0; i+len(n) <= len(h); i++ {
		if h[i:i+len(n)] == n {
			return i
		}
	}
	return -1
}
