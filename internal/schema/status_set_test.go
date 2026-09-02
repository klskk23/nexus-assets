package schema

import (
	"testing"

	"github.com/klskk23/nexus-assets/internal/model"
)

// TestStatusSetCarriesTheConfiguredBehaviour covers the load the write path
// depends on: a status is data now, and every rule that reads one -- what
// counts as available, what is terminal, what may follow what -- reads it
// through this.
func TestStatusSetCarriesTheConfiguredBehaviour(t *testing.T) {
	s, ctx := newStore(t)

	if _, err := s.CreateStatus(ctx, CreateStatusInput{
		Key: "on_loan", Label: "借出", Color: "blue", CountsAsAvailable: false,
	}); err != nil {
		t.Fatalf("create status: %v", err)
	}

	set, err := s.StatusSet(ctx)
	if err != nil {
		t.Fatalf("status set: %v", err)
	}

	// The built-ins are still there, and the new one alongside them.
	if got := set.Label("on_loan"); got != "借出" {
		t.Errorf("the custom status should carry its own label, got %q", got)
	}
	if got := set.Label(model.StatusInStock); got == "" {
		t.Error("the built-in statuses must survive adding a custom one")
	}

	// The two behaviour switches, as stored.
	if set.CountsAsAvailable("on_loan") {
		t.Error("this status was created as unavailable")
	}
	if !set.CountsAsAvailable(model.StatusInStock) {
		t.Error("in_stock counts as available")
	}

	// Built-in to built-in stays on the original matrix; anything involving a
	// custom status is allowed, which is what keeps the existing guardrails
	// exactly as tight as they were.
	if err := set.ValidateTransition(model.StatusInStock, "on_loan"); err != nil {
		t.Errorf("a custom status should be reachable: %v", err)
	}
	if err := set.ValidateTransition(model.StatusRetired, model.StatusInUse); err == nil {
		t.Error("retired is terminal; that transition must still be refused")
	}
}

// TestSameParentTellsAMoveFromANoOp pins the guard behind "移动类别" refusals:
// asking for the parent a category already has is not a move, and treating it
// as one refused edits that changed nothing about the tree.
func TestSameParentTellsAMoveFromANoOp(t *testing.T) {
	a, b := "cat-1", "cat-2"
	cases := []struct {
		name string
		x, y *string
		want bool
	}{
		{"both at the root", nil, nil, true},
		{"the same parent", &a, &a, true},
		{"a different parent", &a, &b, false},
		{"moving to the root", &a, nil, false},
		{"moving off the root", nil, &a, false},
	}
	for _, c := range cases {
		if got := sameParent(c.x, c.y); got != c.want {
			t.Errorf("%s: got %v, want %v", c.name, got, c.want)
		}
	}
}
