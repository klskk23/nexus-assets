package main

import (
	"context"
	"path/filepath"
	"strings"
	"testing"

	"github.com/klskk23/nexus-assets/internal/asset"
	"github.com/klskk23/nexus-assets/internal/audit"
	"github.com/klskk23/nexus-assets/internal/auth"
	"github.com/klskk23/nexus-assets/internal/config"
	"github.com/klskk23/nexus-assets/internal/holder"
	"github.com/klskk23/nexus-assets/internal/importer"
	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/schema"
	"github.com/klskk23/nexus-assets/internal/store"
	"github.com/klskk23/nexus-assets/internal/transfer"
)

func newApp(t *testing.T) (*app, string, string) {
	t.Helper()
	ctx := context.Background()

	db, err := store.Open(filepath.Join(t.TempDir(), "v.db"))
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if err := db.Migrate(ctx); err != nil {
		t.Fatalf("migrate: %v", err)
	}

	sch := schema.New(db)
	a := &app{
		cfg: &config.Config{}, db: db,
		users: auth.NewStore(db), schema: sch, holders: holder.New(db),
		assets: asset.NewService(db, sch), audit: audit.New(db),
	}
	a.transfers = transfer.New(db, a.holders)
	a.importer = importer.New(db, sch, a.holders, a.users, a.assets)

	u, err := a.users.Create(ctx, auth.CreateInput{
		Email: "admin@example.com", Name: "管理员", AuthType: model.AuthLocal, Password: "correct-horse",
	})
	if err != nil {
		t.Fatal(err)
	}
	loc, err := a.holders.Create(ctx, holder.CreateInput{Type: model.EntityLocation, Name: "上海仓库"})
	if err != nil {
		t.Fatal(err)
	}
	cat, err := sch.CreateCategory(ctx, schema.CreateCategoryInput{
		Code: "RT", Name: "路由器",
	})
	if err != nil {
		t.Fatal(err)
	}
	mac, _ := sch.CreateField(ctx, schema.CreateFieldInput{
		Key: "mac", Label: "MAC", Type: model.FieldMAC, IsUnique: true,
	})
	if err := sch.Bind(ctx, cat.ID, mac.ID, 10); err != nil {
		t.Fatal(err)
	}

	for i := 1; i <= 3; i++ {
		if _, err := a.assets.Save(ctx, asset.SaveInput{
			CategoryID: cat.ID, Status: model.StatusInStock, OwnerID: u.ID,
			Holder:  model.Holder{Type: model.HolderTypeEntity, ID: loc.ID},
			Attrs:   map[string]any{"mac": strings.ToUpper(padHex(i))},
			ActorID: u.ID,
		}); err != nil {
			t.Fatalf("seed %d: %v", i, err)
		}
	}
	return a, u.ID, loc.ID
}

func padHex(i int) string {
	const digits = "0123456789ABCDEF"
	out := make([]byte, 12)
	for j := 11; j >= 0; j-- {
		out[j] = digits[i&0xf]
		i >>= 4
	}
	return string(out)
}

func TestVerifyPassesOnAConsistentDatabase(t *testing.T) {
	a, _, _ := newApp(t)
	if err := runVerify(context.Background(), a); err != nil {
		t.Fatalf("a database written only through the pipeline must reconcile: %v", err)
	}
}

// The whole reason verify exists: catching a write that went around the save
// pipeline. Nothing else would notice, because the row itself looks fine.
func TestVerifyCatchesASnapshotWrittenAroundThePipeline(t *testing.T) {
	a, _, _ := newApp(t)
	ctx := context.Background()

	if _, err := a.db.WriteDBForTest().ExecContext(ctx,
		`UPDATE assets SET status = 'in_repair' WHERE id = (SELECT id FROM assets LIMIT 1)`); err != nil {
		t.Fatal(err)
	}

	err := runVerify(ctx, a)
	if err == nil {
		t.Fatal("a snapshot that disagrees with its last event must be reported")
	}
	if !strings.Contains(err.Error(), "problem") {
		t.Errorf("error should say how many problems were found, got: %v", err)
	}
}

func TestVerifyCatchesABrokenEventChain(t *testing.T) {
	a, userID, _ := newApp(t)
	ctx := context.Background()

	// A chain needs two links, so give one asset a second event first. A
	// creation carries no from_* by design and cannot demonstrate a break.
	var assetID string
	if err := a.db.ReadDB().QueryRowContext(ctx, `SELECT id FROM assets LIMIT 1`).Scan(&assetID); err != nil {
		t.Fatal(err)
	}
	if _, err := a.transfers.Apply(ctx, transfer.Request{
		AssetIDs: []string{assetID},
		ToStatus: statusPtr(model.StatusInUse),
		ToHolder: &model.Holder{Type: model.HolderTypeUser, ID: userID},
		ActorID:  userID,
	}); err != nil {
		t.Fatalf("second event: %v", err)
	}
	if err := runVerify(ctx, a); err != nil {
		t.Fatalf("the chain should still be sound: %v", err)
	}

	// Now break the second event's from_*.
	if _, err := a.db.WriteDBForTest().ExecContext(ctx,
		`UPDATE asset_transfers SET from_status = 'in_repair', from_holder_type = 'user',
		     from_holder_id = 'ghost', from_owner_id = 'ghost'
		 WHERE asset_id = ? AND kind != 'create'`, assetID); err != nil {
		t.Fatal(err)
	}
	if err := runVerify(ctx, a); err == nil {
		t.Fatal("an event whose from_* does not follow the previous to_* must be reported")
	}
}

func statusPtr(s model.AssetStatus) *model.AssetStatus { return &s }

func TestVerifyCatchesAnAssetWithNoHistory(t *testing.T) {
	a, _, _ := newApp(t)
	ctx := context.Background()

	if _, err := a.db.WriteDBForTest().ExecContext(ctx,
		`DELETE FROM asset_transfers WHERE asset_id = (SELECT id FROM assets LIMIT 1)`); err != nil {
		t.Fatal(err)
	}
	if err := runVerify(ctx, a); err == nil {
		t.Fatal("an asset with no transfer history must be reported")
	}
}
