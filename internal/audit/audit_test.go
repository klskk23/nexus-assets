package audit

import (
	"context"
	"encoding/json"
	"path/filepath"
	"testing"
	"time"

	"github.com/klskk23/nexus-assets/internal/auth"
	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/store"
)

func newStore(t *testing.T) (*Store, *auth.Store, context.Context, string) {
	t.Helper()
	ctx := context.Background()
	db, err := store.Open(filepath.Join(t.TempDir(), "a.db"))
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if err := db.Migrate(ctx); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	users := auth.NewStore(db)
	u, err := users.Create(ctx, auth.CreateInput{
		Email: "admin@example.com", Name: "管理员", AuthType: model.AuthLocal, Password: "correct-horse",
	})
	if err != nil {
		t.Fatal(err)
	}
	return New(db), users, ctx, u.ID
}

func TestRecordKeepsBeforeAndAfter(t *testing.T) {
	s, _, ctx, actor := newStore(t)

	before := map[string]any{"sn_template": "hex2dec(attrs.mac)"}
	after := map[string]any{"sn_template": `{{ printf "%s-%s" .category.code .attrs.mac }}`}
	if err := s.Record(ctx, actor, ActionUpdate, TargetCategory, "cat-1", before, after); err != nil {
		t.Fatalf("record: %v", err)
	}

	page, err := s.List(ctx, Filter{Limit: 10})
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if page.Total != 1 || len(page.Items) != 1 {
		t.Fatalf("total/items = %d/%d, want 1/1", page.Total, len(page.Items))
	}
	e := page.Items[0]
	if e.Action != ActionUpdate || e.TargetType != TargetCategory || e.TargetID != "cat-1" {
		t.Errorf("entry = %+v", e)
	}
	// The name is joined so the log reads as people rather than ids.
	if e.ActorName != "管理员" {
		t.Errorf("actor name = %q", e.ActorName)
	}

	// Changing a serial-number rule renumbers a whole warehouse, so knowing
	// what it said before is the entire point.
	var got map[string]any
	if err := json.Unmarshal(e.Before, &got); err != nil {
		t.Fatalf("decode before: %v", err)
	}
	if got["sn_template"] != before["sn_template"] {
		t.Errorf("before = %v", got)
	}
}

func TestRecordAcceptsAnAbsentSide(t *testing.T) {
	s, _, ctx, actor := newStore(t)
	if err := s.Record(ctx, actor, ActionCreate, TargetField, "f-1", nil, map[string]any{"key": "mac"}); err != nil {
		t.Fatalf("create entry: %v", err)
	}
	if err := s.Record(ctx, actor, ActionArchive, TargetField, "f-1", map[string]any{"key": "mac"}, nil); err != nil {
		t.Fatalf("archive entry: %v", err)
	}
	page, _ := s.List(ctx, Filter{Limit: 10})
	if len(page.Items) != 2 {
		t.Fatalf("got %d entries", len(page.Items))
	}
	// Newest first.
	if page.Items[0].Action != ActionArchive {
		t.Errorf("ordering is wrong: %+v", page.Items[0].Action)
	}
	if page.Items[0].After != nil {
		t.Error("an archive has no after-state")
	}
	if page.Items[1].Before != nil {
		t.Error("a creation has no before-state")
	}
}

func TestListFiltersByTargetTypeAndTimeRange(t *testing.T) {
	s, _, ctx, actor := newStore(t)

	for _, spec := range []struct {
		target TargetType
		id     string
	}{
		{TargetCategory, "c1"}, {TargetField, "f1"}, {TargetField, "f2"}, {TargetHolder, "h1"},
	} {
		if err := s.Record(ctx, actor, ActionCreate, spec.target, spec.id, nil, map[string]any{"id": spec.id}); err != nil {
			t.Fatal(err)
		}
	}

	page, err := s.List(ctx, Filter{TargetType: string(TargetField), Limit: 10})
	if err != nil {
		t.Fatal(err)
	}
	if page.Total != 2 {
		t.Errorf("target-type filter should narrow to 2, got %d", page.Total)
	}

	page, err = s.List(ctx, Filter{TargetID: "f1", Limit: 10})
	if err != nil {
		t.Fatal(err)
	}
	if page.Total != 1 {
		t.Errorf("target-id filter should narrow to 1, got %d", page.Total)
	}

	future := time.Now().UTC().Add(time.Hour)
	page, err = s.List(ctx, Filter{From: &future, Limit: 10})
	if err != nil {
		t.Fatal(err)
	}
	if page.Total != 0 {
		t.Errorf("a future start should exclude everything, got %d", page.Total)
	}

	past := time.Now().UTC().Add(-time.Hour)
	page, err = s.List(ctx, Filter{From: &past, Limit: 10})
	if err != nil {
		t.Fatal(err)
	}
	if page.Total != 4 {
		t.Errorf("a past start should include everything, got %d", page.Total)
	}
}

func TestListPaginates(t *testing.T) {
	s, _, ctx, actor := newStore(t)
	for i := 0; i < 7; i++ {
		if err := s.Record(ctx, actor, ActionCreate, TargetField, "f", nil, map[string]any{"i": i}); err != nil {
			t.Fatal(err)
		}
	}
	page, err := s.List(ctx, Filter{Offset: 5, Limit: 5})
	if err != nil {
		t.Fatal(err)
	}
	if page.Total != 7 {
		t.Errorf("total counts every match, got %d", page.Total)
	}
	if len(page.Items) != 2 {
		t.Errorf("the last page holds 2, got %d", len(page.Items))
	}
}

// A deleted account still leaves its id behind; the trail must survive it.
func TestListFallsBackToTheActorIdWhenTheAccountIsGone(t *testing.T) {
	s, _, ctx, _ := newStore(t)
	if err := s.Record(ctx, "ghost-user", ActionCreate, TargetField, "f1", nil, nil); err != nil {
		t.Fatal(err)
	}
	page, _ := s.List(ctx, Filter{Limit: 10})
	if page.Items[0].ActorName != "ghost-user" {
		t.Errorf("actor name should fall back to the id, got %q", page.Items[0].ActorName)
	}
}
