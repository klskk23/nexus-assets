package model

import "fmt"

// legalTransitions is the status machine defined in data-model.md section 3.
//
// Two rules carry intent that is easy to lose:
//
//   - retired is terminal. A device that finished the write-off process has
//     usually been physically disposed of; letting it come back would empty the
//     status of meaning. A mistaken write-off is corrected by editing the tail
//     transfer event instead, while it is still the tail.
//   - lost may only return to in_stock, never straight to in_use. A recovered
//     device is checked back into a location before it goes out again.
var legalTransitions = map[AssetStatus]map[AssetStatus]bool{
	StatusInStock: {
		StatusInUse: true, StatusInRepair: true, StatusLost: true, StatusRetired: true,
	},
	StatusInUse: {
		StatusInStock: true, StatusInUse: true, StatusInRepair: true,
		StatusLost: true, StatusRetired: true,
	},
	StatusInRepair: {
		StatusInStock: true, StatusInUse: true, StatusLost: true, StatusRetired: true,
	},
	StatusLost: {
		StatusInStock: true, StatusRetired: true,
	},
	StatusRetired: {},
}

// CanTransition reports whether from -> to is allowed.
//
// Staying in the same status is always allowed: nothing moved, so there is
// nothing to validate. Editing a note on a retired device must not be blocked
// by the rule that retired cannot transition out of itself.
func CanTransition(from, to AssetStatus) bool {
	if from == to {
		return true
	}
	return legalTransitions[from][to]
}

// ValidateTransition returns a descriptive error when the move is not allowed.
func ValidateTransition(from, to AssetStatus) error {
	if !to.Valid() {
		return fmt.Errorf("unknown status %q", to)
	}
	if CanTransition(from, to) {
		return nil
	}
	if from == StatusRetired {
		return fmt.Errorf("%s is terminal: correct a mistaken write-off by editing the tail transfer event", from)
	}
	if from == StatusLost && to == StatusInUse {
		return fmt.Errorf("a recovered device must be checked back in before it can be checked out again")
	}
	return fmt.Errorf("transition %s -> %s is not allowed", from, to)
}

// RequiresLocationHolder reports whether a status constrains the holder to a
// location entity.
//
// in_stock means the device sits in a warehouse. Allowing "in stock but held by
// a person" would make the stocktake question -- which warehouse is it in --
// unanswerable.
func RequiresLocationHolder(s AssetStatus) bool {
	return s == StatusInStock
}
