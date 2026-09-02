package holder

import (
	"context"
	"errors"
	"path/filepath"
	"strings"
	"testing"

	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/store"
)

func newFixture(t *testing.T) (*Store, *store.Store, context.Context) {
	t.Helper()
	ctx := context.Background()
	db, err := store.Open(filepath.Join(t.TempDir(), "h.db"))
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if err := db.Migrate(ctx); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	// Foreign keys are on, so the rows the seeded assets point at must exist.
	for _, q := range []string{
		`INSERT INTO users (id, email, name, auth_type, status, role, token_version, created_at, updated_at)
		 VALUES ('u1', 'a@example.com', '管理员', 'local', 'active', 'admin', 0,
		         '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`,
		`INSERT INTO categories (id, code, name, path, display_key, created_at, updated_at)
		 VALUES ('cat', 'RT', '路由器', '/cat/', 'tag', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`,
	} {
		if _, err := db.WriteDBForTest().ExecContext(ctx, q); err != nil {
			t.Fatalf("seed reference rows: %v", err)
		}
	}
	return New(db), db, ctx
}

func TestBlockersFindsBothPossessionAndReference(t *testing.T) {
	hs, db, ctx := newFixture(t)

	warehouse, err := hs.Create(ctx, CreateInput{Type: model.EntityLocation, Name: "上海仓库"})
	if err != nil {
		t.Fatal(err)
	}
	other, err := hs.Create(ctx, CreateInput{Type: model.EntityLocation, Name: "北京仓库"})
	if err != nil {
		t.Fatal(err)
	}

	insert := `INSERT INTO assets (id, category_id, status, owner_id, holder_type, holder_id, attrs, created_at, updated_at)
	           VALUES (?, 'cat', 'in_stock', 'u1', 'entity', ?, ?, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`
	seed := func(id, holderID, attrs string) {
		t.Helper()
		if _, err := db.WriteDBForTest().ExecContext(ctx, insert, id, holderID, attrs); err != nil {
			t.Fatalf("seed %s: %v", id, err)
		}
	}
	// Held by the warehouse. The category's display key is "tag", so the
	// blocker list must name the device by that rather than by its UUID.
	seed("a1", warehouse.ID, `{"tag":"SN-1"}`)
	// Not held by it, but names it in a reference field -- the second way to
	// be in the way, and the one a possession-only check would miss.
	seed("a2", other.ID, `{"tag":"SN-2","install_location":"`+warehouse.ID+`"}`)
	// Unrelated.
	seed("a3", other.ID, `{"tag":"SN-3"}`)

	blockers, total, err := hs.Blockers(ctx, warehouse.ID)
	if err != nil {
		t.Fatalf("blockers: %v", err)
	}
	if total != 2 {
		t.Fatalf("total = %d, want 2", total)
	}
	byReason := map[string]string{}
	for _, b := range blockers {
		byReason[b.Reason] = b.Name
	}
	if byReason["holder"] != "SN-1" {
		t.Errorf("possession blocker = %+v", blockers)
	}
	if byReason["reference"] != "SN-2" {
		t.Errorf("reference blocker = %+v", blockers)
	}
}

func TestDeleteRefusedWithAnActionableMessage(t *testing.T) {
	hs, db, ctx := newFixture(t)
	warehouse, err := hs.Create(ctx, CreateInput{Type: model.EntityLocation, Name: "上海仓库"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.WriteDBForTest().ExecContext(ctx,
		`INSERT INTO assets (id, category_id, status, owner_id, holder_type, holder_id, attrs, created_at, updated_at)
		 VALUES ('a1', 'cat', 'in_stock', 'u1', 'entity', ?, '{"tag":"SN-1"}', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`,
		warehouse.ID); err != nil {
		t.Fatal(err)
	}

	_, err = hs.Delete(ctx, warehouse.ID)
	if !errors.Is(err, ErrReferenced) {
		t.Fatalf("want ErrReferenced, got %v", err)
	}
	for _, want := range []string{"上海仓库", "SN-1", "持有"} {
		if !strings.Contains(err.Error(), want) {
			t.Errorf("the message should mention %q, got: %v", want, err)
		}
	}

	if _, err := hs.Get(ctx, warehouse.ID); err != nil {
		t.Errorf("the entity must still be there: %v", err)
	}
}

func TestDeleteSucceedsOnceNothingPointsAtIt(t *testing.T) {
	hs, _, ctx := newFixture(t)
	e, err := hs.Create(ctx, CreateInput{Type: model.EntityCompany, Name: "旧客户"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := hs.Delete(ctx, e.ID); err != nil {
		t.Fatalf("delete: %v", err)
	}
	if _, err := hs.Get(ctx, e.ID); !errors.Is(err, ErrNotFound) {
		t.Errorf("the entity should be gone, got %v", err)
	}
}

func TestBlockerListIsCappedButTheTotalIsNot(t *testing.T) {
	hs, db, ctx := newFixture(t)
	w, err := hs.Create(ctx, CreateInput{Type: model.EntityLocation, Name: "上海仓库"})
	if err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 12; i++ {
		if _, err := db.WriteDBForTest().ExecContext(ctx,
			`INSERT INTO assets (id, category_id, status, owner_id, holder_type, holder_id, attrs, created_at, updated_at)
			 VALUES (?, 'cat', 'in_stock', 'u1', 'entity', ?, ?, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`,
			string(rune('a'+i)), w.ID, `{"tag":"SN-`+string(rune('A'+i))+`"}`); err != nil {
			t.Fatal(err)
		}
	}
	blockers, total, err := hs.Blockers(ctx, w.ID)
	if err != nil {
		t.Fatal(err)
	}
	if total != 12 {
		t.Errorf("total = %d, want 12", total)
	}
	if len(blockers) != blockerLimit {
		t.Errorf("the listed sample should be capped at %d, got %d", blockerLimit, len(blockers))
	}
	// The message has to say the list is partial, or it reads as the whole set.
	msg := describeBlockers("上海仓库", blockers, total).Error()
	if !strings.Contains(msg, "仅列出前") {
		t.Errorf("the message should say the list is truncated: %s", msg)
	}
}

// The default stock marker moves; it does not switch off. Archiving used to
// clear it on the way out, which was a back door around exactly that rule.
func TestArchivingTheDefaultStockPointIsRefused(t *testing.T) {
	hs, _, ctx := newFixture(t)

	a, err := hs.Create(ctx, CreateInput{Type: model.EntityLocation, Name: "上海仓库"})
	if err != nil {
		t.Fatal(err)
	}
	b, err := hs.Create(ctx, CreateInput{Type: model.EntityLocation, Name: "北京仓库"})
	if err != nil {
		t.Fatal(err)
	}
	if err := hs.SetDefaultStock(ctx, a.ID); err != nil {
		t.Fatal(err)
	}

	_, err = hs.Delete(ctx, a.ID)
	if !errors.Is(err, ErrDefaultStockRequired) {
		t.Fatalf("want ErrDefaultStockRequired, got %v", err)
	}
	if !strings.Contains(err.Error(), "上海仓库") {
		t.Errorf("the message should name the location, got %v", err)
	}

	// Still the default, and still there.
	cur, ok, err := hs.DefaultStock(ctx)
	if err != nil || !ok || cur.ID != a.ID {
		t.Fatalf("the marker must survive the refused delete: %v %v %+v", err, ok, cur)
	}

	// Move it first, then the delete goes through.
	if err := hs.SetDefaultStock(ctx, b.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := hs.Delete(ctx, a.ID); err != nil {
		t.Fatalf("once the marker has moved, deleting must succeed: %v", err)
	}
	cur, ok, err = hs.DefaultStock(ctx)
	if err != nil || !ok || cur.ID != b.ID {
		t.Errorf("the marker should now be on the other location: %v %v %+v", err, ok, cur)
	}
}
