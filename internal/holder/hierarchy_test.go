package holder

import (
	"errors"
	"strings"
	"testing"

	"github.com/klskk23/nexus-assets/internal/model"
)

// A department is always somebody's department. Letting one float free is how
// an org chart stops being one.
func TestDepartmentNeedsACompany(t *testing.T) {
	s, _, ctx := newFixture(t)

	_, err := s.Create(ctx, CreateInput{Type: model.EntityDepartment, Name: "运维部"})
	if !errors.Is(err, ErrParentRequired) {
		t.Fatalf("got %v, want ErrParentRequired", err)
	}
	// The message has to say what to do first, not just that it failed.
	if !strings.Contains(err.Error(), "公司") {
		t.Errorf("message should name what is missing, got %v", err)
	}

	co, err := s.Create(ctx, CreateInput{Type: model.EntityCompany, Name: "XX 集团"})
	if err != nil {
		t.Fatal(err)
	}
	dept, err := s.Create(ctx, CreateInput{
		Type: model.EntityDepartment, Name: "运维部", ParentID: &co.ID,
	})
	if err != nil {
		t.Fatalf("a department under a company: %v", err)
	}
	if dept.ParentID == nil || *dept.ParentID != co.ID {
		t.Errorf("parent = %v, want %s", dept.ParentID, co.ID)
	}
}

func TestDepartmentCannotHangFromALocation(t *testing.T) {
	s, _, ctx := newFixture(t)

	loc, err := s.Create(ctx, CreateInput{Type: model.EntityLocation, Name: "上海仓库"})
	if err != nil {
		t.Fatal(err)
	}
	_, err = s.Create(ctx, CreateInput{
		Type: model.EntityDepartment, Name: "运维部", ParentID: &loc.ID,
	})
	if !errors.Is(err, ErrParentInvalid) {
		t.Fatalf("got %v, want ErrParentInvalid", err)
	}
	if !strings.Contains(err.Error(), "上海仓库") {
		t.Errorf("message should name the parent that was refused, got %v", err)
	}
}

// A warehouse may belong to a company, be run by a department, or be a
// third-party site that belongs to neither.
func TestLocationParentIsOptionalAndAcceptsEither(t *testing.T) {
	s, _, ctx := newFixture(t)

	co, err := s.Create(ctx, CreateInput{Type: model.EntityCompany, Name: "XX 集团"})
	if err != nil {
		t.Fatal(err)
	}
	dept, err := s.Create(ctx, CreateInput{
		Type: model.EntityDepartment, Name: "运维部", ParentID: &co.ID,
	})
	if err != nil {
		t.Fatal(err)
	}

	for name, parent := range map[string]*string{
		"无上级": nil, "属于公司": &co.ID, "属于部门": &dept.ID,
	} {
		if _, err := s.Create(ctx, CreateInput{
			Type: model.EntityLocation, Name: "仓库-" + name, ParentID: parent,
		}); err != nil {
			t.Errorf("location %s: %v", name, err)
		}
	}
}

func TestCompanyCannotHaveAParent(t *testing.T) {
	s, _, ctx := newFixture(t)

	co, err := s.Create(ctx, CreateInput{Type: model.EntityCompany, Name: "XX 集团"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.Create(ctx, CreateInput{
		Type: model.EntityCompany, Name: "YY 子公司", ParentID: &co.ID,
	}); !errors.Is(err, ErrParentInvalid) {
		t.Fatalf("got %v, want ErrParentInvalid", err)
	}
}

func TestNoteRoundTrips(t *testing.T) {
	s, _, ctx := newFixture(t)

	loc, err := s.Create(ctx, CreateInput{
		Type: model.EntityLocation, Name: "上海仓库", Note: "B 座三层，A01–A24 号货架",
	})
	if err != nil {
		t.Fatal(err)
	}
	got, err := s.Get(ctx, loc.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.Note != "B 座三层，A01–A24 号货架" {
		t.Errorf("note = %q", got.Note)
	}

	note := "改到 C 座"
	if _, err := s.Update(ctx, loc.ID, UpdateInput{Note: &note}); err != nil {
		t.Fatal(err)
	}
	if got, _ = s.Get(ctx, loc.ID); got.Note != note {
		t.Errorf("note after update = %q", got.Note)
	}
}

// A cycle would make every ancestor walk non-terminating, and the tree
// unrenderable.
func TestMoveRefusesToCreateACycle(t *testing.T) {
	s, _, ctx := newFixture(t)

	co, _ := s.Create(ctx, CreateInput{Type: model.EntityCompany, Name: "XX 集团"})
	dept, err := s.Create(ctx, CreateInput{
		Type: model.EntityDepartment, Name: "运维部", ParentID: &co.ID,
	})
	if err != nil {
		t.Fatal(err)
	}
	loc, err := s.Create(ctx, CreateInput{
		Type: model.EntityLocation, Name: "上海仓库", ParentID: &dept.ID,
	})
	if err != nil {
		t.Fatal(err)
	}

	// The warehouse is under the department; putting the warehouse over it
	// would close the loop.
	under := &loc.ID
	if _, err := s.Update(ctx, dept.ID, UpdateInput{ParentID: &under}); err == nil {
		t.Fatal("a cycle must be refused")
	}

	// Detaching is expressed as an explicit null, and for a department it is
	// still refused -- the rule does not weaken on the way out.
	var none *string
	if _, err := s.Update(ctx, dept.ID, UpdateInput{ParentID: &none}); !errors.Is(err, ErrParentRequired) {
		t.Fatalf("detaching a department: got %v, want ErrParentRequired", err)
	}
}

// Deleting takes over from archiving, and follows the rule information items
// and statuses already use: refused while anything points at it.
func TestDeleteRefusedWhileChildrenHangFromIt(t *testing.T) {
	s, _, ctx := newFixture(t)

	co, err := s.Create(ctx, CreateInput{Type: model.EntityCompany, Name: "XX 集团"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.Create(ctx, CreateInput{
		Type: model.EntityDepartment, Name: "运维部", ParentID: &co.ID,
	}); err != nil {
		t.Fatal(err)
	}

	usage, err := s.Delete(ctx, co.ID)
	if !errors.Is(err, ErrHasChildren) {
		t.Fatalf("got %v, want ErrHasChildren", err)
	}
	if usage.Children != 1 {
		t.Errorf("refusal should carry the count, got %d", usage.Children)
	}
	// Reparenting them silently would move somebody's org chart without asking.
	if _, err := s.Get(ctx, co.ID); err != nil {
		t.Errorf("the company must still be there: %v", err)
	}
}

// History only warns. Refusing there would make a warehouse used once
// undeletable for good, and the cost is a timeline showing an id instead of a
// name -- readability, not data.
func TestDeleteAllowedWhenOnlyHistoryMentionsIt(t *testing.T) {
	s, db, ctx := newFixture(t)

	old, err := s.Create(ctx, CreateInput{Type: model.EntityLocation, Name: "旧仓库"})
	if err != nil {
		t.Fatal(err)
	}
	const ts = "2026-01-01T00:00:00Z"
	if _, err := db.WriteDBForTest().ExecContext(ctx,
		`INSERT INTO assets (id, category_id, status, owner_id, holder_type, holder_id, attrs, created_at, updated_at)
		 VALUES ('a1', 'cat', 'in_stock', 'u1', 'user', 'u1', '{}', ?, ?)`, ts, ts); err != nil {
		t.Fatal(err)
	}
	if _, err := db.WriteDBForTest().ExecContext(ctx,
		`INSERT INTO asset_transfers
		   (id, asset_id, kind, from_status, from_holder_type, from_holder_id, from_owner_id,
		    to_status, to_holder_type, to_holder_id, to_owner_id, actor_id, created_at)
		 VALUES ('t1', 'a1', 'transfer', 'in_stock', 'entity', ?, 'u1',
		         'in_stock', 'user', 'u1', 'u1', 'u1', ?)`, old.ID, ts); err != nil {
		t.Fatal(err)
	}

	usage, err := s.Usage(ctx, old.ID)
	if err != nil {
		t.Fatal(err)
	}
	if usage.Assets != 0 || usage.History != 1 {
		t.Fatalf("usage = %+v, want 0 assets / 1 event", usage)
	}
	if _, err := s.Delete(ctx, old.ID); err != nil {
		t.Fatalf("history alone must not block the delete: %v", err)
	}
	// The event survives; only the name it can resolve to is gone.
	var n int
	if err := db.ReadDB().QueryRowContext(ctx,
		`SELECT count(*) FROM asset_transfers WHERE id = 't1'`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 1 {
		t.Error("the transfer event must survive the delete")
	}
}

// A move within one entity names it on both sides of the event; counting it
// twice would overstate the cost the confirm dialog reports.
func TestHistoryCountsAnEventOnceWhenBothEndsMatch(t *testing.T) {
	s, db, ctx := newFixture(t)

	w, err := s.Create(ctx, CreateInput{Type: model.EntityLocation, Name: "上海仓库"})
	if err != nil {
		t.Fatal(err)
	}
	const ts = "2026-01-01T00:00:00Z"
	if _, err := db.WriteDBForTest().ExecContext(ctx,
		`INSERT INTO assets (id, category_id, status, owner_id, holder_type, holder_id, attrs, created_at, updated_at)
		 VALUES ('a1', 'cat', 'in_stock', 'u1', 'user', 'u1', '{}', ?, ?)`, ts, ts); err != nil {
		t.Fatal(err)
	}
	if _, err := db.WriteDBForTest().ExecContext(ctx,
		`INSERT INTO asset_transfers
		   (id, asset_id, kind, from_status, from_holder_type, from_holder_id, from_owner_id,
		    to_status, to_holder_type, to_holder_id, to_owner_id, actor_id, created_at)
		 VALUES ('t1', 'a1', 'reassign', 'in_stock', 'entity', ?, 'u1',
		         'in_stock', 'entity', ?, 'u1', 'u1', ?)`, w.ID, w.ID, ts); err != nil {
		t.Fatal(err)
	}

	usage, err := s.Usage(ctx, w.ID)
	if err != nil {
		t.Fatal(err)
	}
	if usage.History != 1 {
		t.Errorf("history = %d, want the event counted once", usage.History)
	}
}
