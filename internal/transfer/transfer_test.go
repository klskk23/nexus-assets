package transfer

import (
	"context"
	"errors"
	"fmt"
	"path/filepath"
	"strings"
	"testing"

	"github.com/klskk23/nexus-assets/internal/asset"
	"github.com/klskk23/nexus-assets/internal/auth"
	"github.com/klskk23/nexus-assets/internal/holder"
	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/schema"
	"github.com/klskk23/nexus-assets/internal/store"
)

type fixture struct {
	svc     *Service
	assets  *asset.Service
	holders *holder.Store
	users   *auth.Store
	db      *store.Store
	ctx     context.Context

	userID, otherID string
	warehouseID     string
	catID           string

	// macSeq keeps generated MACs unique across every call in one test, so a
	// second batch cannot collide with the first.
	macSeq int
}

func newFixture(t *testing.T) *fixture {
	t.Helper()
	ctx := context.Background()

	db, err := store.Open(filepath.Join(t.TempDir(), "t.db"))
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	if err := db.Migrate(ctx); err != nil {
		t.Fatalf("migrate: %v", err)
	}

	sch := schema.New(db)
	hs := holder.New(db)
	us := auth.NewStore(db)

	admin, err := us.Create(ctx, auth.CreateInput{
		Email: "admin@example.com", Name: "管理员", AuthType: model.AuthLocal, Password: "correct-horse",
	})
	if err != nil {
		t.Fatalf("create admin: %v", err)
	}
	zhang, err := us.Create(ctx, auth.CreateInput{
		Email: "zhang@example.com", Name: "张三", AuthType: model.AuthLocal, Password: "correct-horse",
	})
	if err != nil {
		t.Fatalf("create zhang: %v", err)
	}

	wh, err := hs.Create(ctx, holder.CreateInput{Type: model.EntityLocation, Name: "上海仓库"})
	if err != nil {
		t.Fatalf("create warehouse: %v", err)
	}

	cat, err := sch.CreateCategory(ctx, schema.CreateCategoryInput{
		Code: "RT", Name: "SDWAN 路由器",
	})
	if err != nil {
		t.Fatalf("create category: %v", err)
	}
	mac, err := sch.CreateField(ctx, schema.CreateFieldInput{
		Key: "mac", Label: "基准 MAC", Type: model.FieldMAC, IsUnique: true,
	})
	if err != nil {
		t.Fatalf("create field: %v", err)
	}
	if err := sch.Bind(ctx, cat.ID, mac.ID, true, 10); err != nil {
		t.Fatalf("bind: %v", err)
	}

	return &fixture{
		svc: New(db, hs), assets: asset.NewService(db, sch), holders: hs, users: us, db: db, ctx: ctx,
		userID: admin.ID, otherID: zhang.ID, warehouseID: wh.ID, catID: cat.ID,
	}
}

// setDefaultStock marks the warehouse as the return destination.
func (f *fixture) setDefaultStock(t *testing.T) {
	t.Helper()
	if err := f.holders.SetDefaultStock(f.ctx, f.warehouseID); err != nil {
		t.Fatalf("set default stock: %v", err)
	}
}

func (f *fixture) newAsset(t *testing.T, n int) []string {
	t.Helper()
	ids := make([]string, 0, n)
	for i := 0; i < n; i++ {
		f.macSeq++
		a, err := f.assets.Save(f.ctx, asset.SaveInput{
			CategoryID: f.catID, Status: model.StatusInStock, OwnerID: f.userID,
			Holder:  model.Holder{Type: model.HolderTypeEntity, ID: f.warehouseID},
			Attrs:   map[string]any{"mac": fmt.Sprintf("001A2B3C%04X", f.macSeq)},
			ActorID: f.userID,
		})
		if err != nil {
			t.Fatalf("create asset %d: %v", i, err)
		}
		ids = append(ids, a.ID)
	}
	return ids
}

func (f *fixture) snapshot(t *testing.T, assetID string) model.AssetState {
	t.Helper()
	var s model.AssetState
	err := f.db.ReadDB().QueryRowContext(f.ctx,
		`SELECT status, holder_type, holder_id, owner_id FROM assets WHERE id = ?`, assetID).
		Scan(&s.Status, &s.Holder.Type, &s.Holder.ID, &s.OwnerID)
	if err != nil {
		t.Fatalf("read snapshot: %v", err)
	}
	return s
}

func status(s model.AssetStatus) *model.AssetStatus { return &s }

func TestCheckoutRecordsFullBeforeAndAfter(t *testing.T) {
	f := newFixture(t)
	id := f.newAsset(t, 1)[0]

	res, err := f.svc.Apply(f.ctx, Request{
		AssetIDs: []string{id},
		ToStatus: status(model.StatusInUse),
		ToHolder: &model.Holder{Type: model.HolderTypeUser, ID: f.otherID},
		Note:     "借给张三做测试",
		ActorID:  f.userID,
	})
	if err != nil {
		t.Fatalf("checkout: %v", err)
	}
	if len(res.Transfers) != 1 {
		t.Fatalf("got %d transfers, want 1", len(res.Transfers))
	}
	tr := res.Transfers[0]

	if tr.Kind != model.KindCheckout {
		t.Errorf("kind = %q, want checkout", tr.Kind)
	}
	// Both status and holder moved; recording only the destination would make
	// the timeline unable to say where the device came from.
	if tr.FromStatus == nil || *tr.FromStatus != model.StatusInStock {
		t.Errorf("from_status = %v, want in_stock", tr.FromStatus)
	}
	if tr.FromHolder == nil || tr.FromHolder.ID != f.warehouseID {
		t.Errorf("from_holder = %v, want the warehouse", tr.FromHolder)
	}
	if tr.ToStatus != model.StatusInUse || tr.ToHolder.ID != f.otherID {
		t.Errorf("to = %v / %v", tr.ToStatus, tr.ToHolder)
	}
	if tr.Note != "借给张三做测试" {
		t.Errorf("note = %q", tr.Note)
	}

	snap := f.snapshot(t, id)
	if snap.Status != model.StatusInUse || snap.Holder.ID != f.otherID {
		t.Errorf("the asset snapshot did not follow the event: %+v", snap)
	}
}

func TestCheckinReturnsToTheDefaultStockPoint(t *testing.T) {
	f := newFixture(t)
	f.setDefaultStock(t)
	id := f.newAsset(t, 1)[0]

	if _, err := f.svc.Apply(f.ctx, Request{
		AssetIDs: []string{id}, ToStatus: status(model.StatusInUse),
		ToHolder: &model.Holder{Type: model.HolderTypeUser, ID: f.otherID}, ActorID: f.userID,
	}); err != nil {
		t.Fatalf("checkout: %v", err)
	}

	res, err := f.svc.Apply(f.ctx, Request{
		AssetIDs: []string{id}, ToStatus: status(model.StatusInStock),
		CheckIn: true, ActorID: f.userID,
	})
	if err != nil {
		t.Fatalf("checkin: %v", err)
	}
	if res.Transfers[0].Kind != model.KindCheckin {
		t.Errorf("kind = %q, want checkin", res.Transfers[0].Kind)
	}
	if res.Transfers[0].ToHolder.ID != f.warehouseID {
		t.Errorf("check-in should default to the marked stock point, got %v", res.Transfers[0].ToHolder)
	}
}

func TestCheckinWithoutADefaultStockPointAsksForALocation(t *testing.T) {
	f := newFixture(t) // no default stock point marked
	id := f.newAsset(t, 1)[0]
	if _, err := f.svc.Apply(f.ctx, Request{
		AssetIDs: []string{id}, ToStatus: status(model.StatusInUse),
		ToHolder: &model.Holder{Type: model.HolderTypeUser, ID: f.otherID}, ActorID: f.userID,
	}); err != nil {
		t.Fatal(err)
	}

	_, err := f.svc.Apply(f.ctx, Request{
		AssetIDs: []string{id}, ToStatus: status(model.StatusInStock), CheckIn: true, ActorID: f.userID,
	})
	// Failing outright would strand the operator; the rule is to ask.
	if !errors.Is(err, ErrNoDefaultStock) {
		t.Fatalf("want ErrNoDefaultStock, got %v", err)
	}
}

func TestReassignOnlyChangesTheOwner(t *testing.T) {
	f := newFixture(t)
	id := f.newAsset(t, 1)[0]

	res, err := f.svc.Apply(f.ctx, Request{
		AssetIDs: []string{id}, ToOwnerID: &f.otherID, ActorID: f.userID,
	})
	if err != nil {
		t.Fatalf("reassign: %v", err)
	}
	if res.Transfers[0].Kind != model.KindReassign {
		t.Errorf("kind = %q, want reassign", res.Transfers[0].Kind)
	}
	if snap := f.snapshot(t, id); snap.Status != model.StatusInStock {
		t.Errorf("status should not move on a reassignment, got %s", snap.Status)
	}
}

func TestNoMovementRecordsNothing(t *testing.T) {
	f := newFixture(t)
	id := f.newAsset(t, 1)[0]

	res, err := f.svc.Apply(f.ctx, Request{
		AssetIDs: []string{id},
		ToHolder: &model.Holder{Type: model.HolderTypeEntity, ID: f.warehouseID},
		ActorID:  f.userID,
	})
	if err != nil {
		t.Fatalf("apply: %v", err)
	}
	if len(res.Transfers) != 0 {
		t.Errorf("a transfer that changes nothing must not appear in the timeline, got %d", len(res.Transfers))
	}
}

func TestIllegalTransitionsRefused(t *testing.T) {
	f := newFixture(t)

	t.Run("retired is terminal", func(t *testing.T) {
		id := f.newAsset(t, 1)[0]
		if _, err := f.svc.Apply(f.ctx, Request{
			AssetIDs: []string{id}, ToStatus: status(model.StatusRetired), ActorID: f.userID,
		}); err != nil {
			t.Fatalf("retire: %v", err)
		}
		_, err := f.svc.Apply(f.ctx, Request{
			AssetIDs: []string{id}, ToStatus: status(model.StatusInStock),
			ToHolder: &model.Holder{Type: model.HolderTypeEntity, ID: f.warehouseID}, ActorID: f.userID,
		})
		if err == nil || !strings.Contains(err.Error(), "terminal") {
			t.Fatalf("want a terminal-status error, got %v", err)
		}
	})

	t.Run("lost cannot go straight to in_use", func(t *testing.T) {
		id := f.newAsset(t, 1)[0]
		if _, err := f.svc.Apply(f.ctx, Request{
			AssetIDs: []string{id}, ToStatus: status(model.StatusLost), ActorID: f.userID,
		}); err != nil {
			t.Fatalf("mark lost: %v", err)
		}
		_, err := f.svc.Apply(f.ctx, Request{
			AssetIDs: []string{id}, ToStatus: status(model.StatusInUse),
			ToHolder: &model.Holder{Type: model.HolderTypeUser, ID: f.otherID}, ActorID: f.userID,
		})
		if err == nil || !strings.Contains(err.Error(), "checked back in") {
			t.Fatalf("want a check-in-first error, got %v", err)
		}
	})
}

func TestInStockRequiresALocationHolder(t *testing.T) {
	f := newFixture(t)
	id := f.newAsset(t, 1)[0]
	if _, err := f.svc.Apply(f.ctx, Request{
		AssetIDs: []string{id}, ToStatus: status(model.StatusInUse),
		ToHolder: &model.Holder{Type: model.HolderTypeUser, ID: f.otherID}, ActorID: f.userID,
	}); err != nil {
		t.Fatal(err)
	}

	// Back in stock but held by a person: the stocktake question would have no
	// answer, so it is refused.
	_, err := f.svc.Apply(f.ctx, Request{
		AssetIDs: []string{id}, ToStatus: status(model.StatusInStock),
		ToHolder: &model.Holder{Type: model.HolderTypeUser, ID: f.otherID}, ActorID: f.userID,
	})
	if err == nil || !strings.Contains(err.Error(), "位置") {
		t.Fatalf("want a location-required error, got %v", err)
	}
}

func TestTimelineIsOrderedAndComplete(t *testing.T) {
	f := newFixture(t)
	f.setDefaultStock(t)
	id := f.newAsset(t, 1)[0]

	for _, step := range []Request{
		{ToStatus: status(model.StatusInUse), ToHolder: &model.Holder{Type: model.HolderTypeUser, ID: f.otherID}},
		{ToStatus: status(model.StatusInStock), CheckIn: true},
		{ToStatus: status(model.StatusInRepair)},
	} {
		step.AssetIDs = []string{id}
		step.ActorID = f.userID
		if _, err := f.svc.Apply(f.ctx, step); err != nil {
			t.Fatalf("step: %v", err)
		}
	}

	timeline, err := f.svc.ByAsset(f.ctx, id)
	if err != nil {
		t.Fatalf("timeline: %v", err)
	}
	want := []model.TransferKind{
		model.KindCreate, model.KindCheckout, model.KindCheckin, model.KindStatusChange,
	}
	if len(timeline) != len(want) {
		t.Fatalf("got %d events, want %d", len(timeline), len(want))
	}
	for i, k := range want {
		if timeline[i].Kind != k {
			t.Errorf("event %d = %q, want %q", i, timeline[i].Kind, k)
		}
	}
	// Chain integrity: each event picks up where the previous one left off.
	for i := 1; i < len(timeline); i++ {
		prev, cur := timeline[i-1], timeline[i]
		if cur.FromStatus == nil || *cur.FromStatus != prev.ToStatus {
			t.Errorf("event %d from_status %v does not follow %v", i, cur.FromStatus, prev.ToStatus)
		}
		if cur.FromHolder == nil || !cur.FromHolder.Equal(prev.ToHolder) {
			t.Errorf("event %d from_holder %v does not follow %v", i, cur.FromHolder, prev.ToHolder)
		}
	}
}
