package transfer

import (
	"testing"

	"github.com/klskk23/nexus-assets/internal/model"
)

// A shipment of twenty devices to one customer is one action, and the ledger
// has to be able to say so afterwards.
func TestBatchSharesOneIdAndCommitsTogether(t *testing.T) {
	f := newFixture(t)
	ids := f.newAsset(t, 20)

	res, err := f.svc.Apply(f.ctx, Request{
		AssetIDs: ids,
		ToStatus: status(model.StatusInUse),
		ToHolder: &model.Holder{Type: model.HolderTypeUser, ID: f.otherID},
		Note:     "发往 XX 集团",
		ActorID:  f.userID,
	})
	if err != nil {
		t.Fatalf("batch: %v", err)
	}
	if len(res.Transfers) != 20 {
		t.Fatalf("got %d transfers, want 20", len(res.Transfers))
	}
	if res.BatchID == nil {
		t.Fatal("a multi-asset transfer must carry a batch id")
	}
	for i, tr := range res.Transfers {
		if tr.BatchID == nil || *tr.BatchID != *res.BatchID {
			t.Fatalf("transfer %d does not share the batch id", i)
		}
	}

	var n int
	if err := f.db.ReadDB().QueryRowContext(f.ctx,
		`SELECT count(*) FROM asset_transfers WHERE batch_id = ?`, *res.BatchID).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 20 {
		t.Errorf("persisted %d rows for the batch, want 20", n)
	}
}

func TestSingleAssetTransferCarriesNoBatchId(t *testing.T) {
	f := newFixture(t)
	id := f.newAsset(t, 1)[0]

	res, err := f.svc.Apply(f.ctx, Request{
		AssetIDs: []string{id}, ToStatus: status(model.StatusInUse),
		ToHolder: &model.Holder{Type: model.HolderTypeUser, ID: f.otherID}, ActorID: f.userID,
	})
	if err != nil {
		t.Fatal(err)
	}
	if res.BatchID != nil {
		t.Error("a batch id on a single transfer would fold it in the timeline for no reason")
	}
}

// All or nothing: a half-applied shipment would leave the operator unable to
// tell which devices actually went out.
func TestBatchRollsBackEntirelyOnOneFailure(t *testing.T) {
	f := newFixture(t)
	ids := f.newAsset(t, 5)

	// Retire the third asset, so the batch's move out of retired is refused.
	if _, err := f.svc.Apply(f.ctx, Request{
		AssetIDs: []string{ids[2]}, ToStatus: status(model.StatusRetired), ActorID: f.userID,
	}); err != nil {
		t.Fatalf("retire: %v", err)
	}

	before := f.countTransfers(t)
	_, err := f.svc.Apply(f.ctx, Request{
		AssetIDs: ids, ToStatus: status(model.StatusInUse),
		ToHolder: &model.Holder{Type: model.HolderTypeUser, ID: f.otherID}, ActorID: f.userID,
	})
	if err == nil {
		t.Fatal("the batch must fail because one member is retired")
	}
	if after := f.countTransfers(t); after != before {
		t.Errorf("transfer rows went from %d to %d; the batch was partially applied", before, after)
	}
	for i, id := range ids {
		if i == 2 {
			continue
		}
		if snap := f.snapshot(t, id); snap.Status != model.StatusInStock {
			t.Errorf("asset %d moved despite the rollback: %s", i, snap.Status)
		}
	}
}

func (f *fixture) countTransfers(t *testing.T) int {
	t.Helper()
	var n int
	if err := f.db.ReadDB().QueryRowContext(f.ctx, `SELECT count(*) FROM asset_transfers`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}
