package model

import (
	"strings"
	"testing"
)

// builtins mirrors what migration 004 seeds. The tests below assert against
// the rules as configured, which is what the running system consults.
func builtins() StatusSet {
	return NewStatusSet([]Status{
		{Key: StatusInStock, Label: "在库", Color: "green", Sort: 10, Builtin: true,
			RequiresLocation: true, CountsAsAvailable: true},
		{Key: StatusInUse, Label: "已签出", Color: "blue", Sort: 20, Builtin: true,
			CountsAsAvailable: true},
		{Key: StatusInRepair, Label: "维修中", Color: "amber", Sort: 30, Builtin: true,
			CountsAsAvailable: true},
		{Key: StatusLost, Label: "丢失", Color: "red", Sort: 40, Builtin: true,
			CountsAsAvailable: true},
		{Key: StatusRetired, Label: "已报废", Color: "slate", Sort: 50, Builtin: true,
			Terminal: true},
	})
}

func TestTransitionMatrix(t *testing.T) {
	// Mirrors the table in data-model.md section 3. The diagonal is always
	// allowed: an attribute-only edit does not move the status, so there is no
	// transition to check.
	want := map[AssetStatus]map[AssetStatus]bool{
		StatusInStock: {
			StatusInStock: true, StatusInUse: true, StatusInRepair: true,
			StatusLost: true, StatusRetired: true,
		},
		StatusInUse: {
			StatusInStock: true, StatusInUse: true, StatusInRepair: true,
			StatusLost: true, StatusRetired: true,
		},
		StatusInRepair: {
			StatusInStock: true, StatusInUse: true, StatusInRepair: true,
			StatusLost: true, StatusRetired: true,
		},
		StatusLost: {
			StatusInStock: true, StatusInUse: false, StatusInRepair: false,
			StatusLost: true, StatusRetired: true,
		},
		StatusRetired: {
			StatusInStock: false, StatusInUse: false, StatusInRepair: false,
			StatusLost: false, StatusRetired: true,
		},
	}
	for from, row := range want {
		for to, allowed := range row {
			if got := builtins().CanTransition(from, to); got != allowed {
				t.Errorf("CanTransition(%s, %s) = %v, want %v", from, to, got, allowed)
			}
		}
	}
}

func TestRetiredIsTerminalWithHelpfulMessage(t *testing.T) {
	err := builtins().ValidateTransition(StatusRetired, StatusInStock)
	if err == nil {
		t.Fatal("retired must be terminal")
	}
	if !strings.Contains(err.Error(), "tail transfer event") {
		t.Errorf("error should point at the correction path, got: %v", err)
	}
}

func TestLostCannotGoStraightToInUse(t *testing.T) {
	err := builtins().ValidateTransition(StatusLost, StatusInUse)
	if err == nil {
		t.Fatal("lost -> in_use must be refused")
	}
	if !strings.Contains(err.Error(), "checked back in") {
		t.Errorf("error should explain the check-in requirement, got: %v", err)
	}
}

func TestUnknownStatusRejected(t *testing.T) {
	if err := builtins().ValidateTransition(StatusInStock, AssetStatus("nonsense")); err == nil {
		t.Fatal("unknown target status must be rejected")
	}
}

func TestRequiresLocationHolder(t *testing.T) {
	set := builtins()
	if !set.RequiresLocationHolder(StatusInStock) {
		t.Error("in_stock must require a location holder")
	}
	for _, s := range []AssetStatus{StatusInUse, StatusInRepair, StatusLost, StatusRetired} {
		if set.RequiresLocationHolder(s) {
			t.Errorf("%s must not constrain the holder", s)
		}
	}
}

// The point of the split in decision 55: adding a status must not loosen any
// rule that already held between the five the code is written against.
func TestCustomStatusDoesNotLoosenBuiltinRules(t *testing.T) {
	set := NewStatusSet(append(builtins().All(),
		Status{Key: "on_loan", Label: "外借中", Color: "violet", Sort: 60, CountsAsAvailable: true},
		Status{Key: "written_off", Label: "已核销", Color: "slate", Sort: 70, Terminal: true},
	))

	if set.CanTransition(StatusLost, StatusInUse) {
		t.Error("lost -> in_use must still be refused with custom statuses present")
	}
	if set.CanTransition(StatusRetired, StatusInStock) {
		t.Error("retired must still be terminal")
	}
	if !set.CanTransition(StatusLost, "on_loan") {
		t.Error("the matrix says nothing about a status it was not written for; allow it")
	}
	if !set.CanTransition("on_loan", StatusInUse) {
		t.Error("moving out of a custom status must be allowed")
	}
	if set.CanTransition("written_off", StatusInStock) {
		t.Error("a custom status marked terminal is still an end")
	}
}

func TestCountsAsAvailable(t *testing.T) {
	set := builtins()
	if set.CountsAsAvailable(StatusRetired) {
		t.Error("retired must stay out of the stock distribution")
	}
	if !set.CountsAsAvailable(StatusInStock) {
		t.Error("in_stock counts")
	}
	// A status deleted out from under existing rows must not silently
	// disappear from the totals.
	if !set.CountsAsAvailable("gone") {
		t.Error("an unknown status must count rather than vanish")
	}
}

func TestLabelFallsBackToKey(t *testing.T) {
	set := builtins()
	if got := set.Label(StatusInStock); got != "在库" {
		t.Errorf("Label(in_stock) = %q", got)
	}
	if got := set.Label("gone"); got != "gone" {
		t.Errorf("a deleted status must still read as something, got %q", got)
	}
}
