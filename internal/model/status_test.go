package model

import (
	"strings"
	"testing"
)

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
			if got := CanTransition(from, to); got != allowed {
				t.Errorf("CanTransition(%s, %s) = %v, want %v", from, to, got, allowed)
			}
		}
	}
}

func TestRetiredIsTerminalWithHelpfulMessage(t *testing.T) {
	err := ValidateTransition(StatusRetired, StatusInStock)
	if err == nil {
		t.Fatal("retired must be terminal")
	}
	if !strings.Contains(err.Error(), "tail transfer event") {
		t.Errorf("error should point at the correction path, got: %v", err)
	}
}

func TestLostCannotGoStraightToInUse(t *testing.T) {
	err := ValidateTransition(StatusLost, StatusInUse)
	if err == nil {
		t.Fatal("lost -> in_use must be refused")
	}
	if !strings.Contains(err.Error(), "checked back in") {
		t.Errorf("error should explain the check-in requirement, got: %v", err)
	}
}

func TestUnknownStatusRejected(t *testing.T) {
	if err := ValidateTransition(StatusInStock, AssetStatus("nonsense")); err == nil {
		t.Fatal("unknown target status must be rejected")
	}
}

func TestRequiresLocationHolder(t *testing.T) {
	if !RequiresLocationHolder(StatusInStock) {
		t.Error("in_stock must require a location holder")
	}
	for _, s := range []AssetStatus{StatusInUse, StatusInRepair, StatusLost, StatusRetired} {
		if RequiresLocationHolder(s) {
			t.Errorf("%s must not constrain the holder", s)
		}
	}
}
