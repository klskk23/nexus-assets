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

// StatusSet is the configured status list, with the rules that read it.
//
// Statuses used to be five constants, so the rules could be package-level
// functions. They are rows now, which means every rule needs the current set in
// hand -- and having it in hand is what lets an administrator add a status
// without a release.
type StatusSet struct {
	byKey map[AssetStatus]Status
	order []Status
}

// NewStatusSet indexes the configured statuses.
func NewStatusSet(list []Status) StatusSet {
	set := StatusSet{byKey: make(map[AssetStatus]Status, len(list)), order: list}
	for _, s := range list {
		set.byKey[s.Key] = s
	}
	return set
}

// Get returns one status.
func (set StatusSet) Get(k AssetStatus) (Status, bool) {
	s, ok := set.byKey[k]
	return s, ok
}

// Label returns a status's display name, falling back to the raw key.
//
// The fallback is what makes a deleted status survivable: history that
// mentions it reads a little worse rather than blowing up.
func (set StatusSet) Label(k AssetStatus) string {
	if s, ok := set.byKey[k]; ok {
		return s.Label
	}
	return string(k)
}

// All returns the statuses in display order.
func (set StatusSet) All() []Status { return set.order }

// CanTransition reports whether from -> to is allowed.
//
// Staying in the same status is always allowed: nothing moved, so there is
// nothing to validate. Editing a note on a retired device must not be blocked
// by the rule that retired cannot transition out of itself.
//
// Between two built-in statuses the original matrix applies unchanged -- every
// guard it encoded is still in force. When either side was added at runtime
// the move is allowed, because the matrix encodes what these five *mean*, and
// the system has no idea what a status somebody added means. Refusing on that
// basis would make custom statuses unusable; a status marked terminal is still
// an end whatever else it is.
func (set StatusSet) CanTransition(from, to AssetStatus) bool {
	if from == to {
		return true
	}
	if s, ok := set.byKey[from]; ok && s.Terminal {
		return false
	}
	if from.Builtin() && to.Builtin() {
		return legalTransitions[from][to]
	}
	return true
}

// ValidateTransition returns a descriptive error when the move is not allowed.
func (set StatusSet) ValidateTransition(from, to AssetStatus) error {
	if _, ok := set.byKey[to]; !ok {
		return fmt.Errorf("unknown status %q", to)
	}
	if set.CanTransition(from, to) {
		return nil
	}
	if s, ok := set.byKey[from]; ok && s.Terminal {
		return fmt.Errorf("%s is terminal: correct a mistaken write-off by editing the tail transfer event", from)
	}
	if from == StatusLost && to == StatusInUse {
		return fmt.Errorf("a recovered device must be checked back in before it can be checked out again")
	}
	return fmt.Errorf("transition %s -> %s is not allowed", from, to)
}

// RequiresLocationHolder reports whether a status constrains the holder to a
// location entity.
func (set StatusSet) RequiresLocationHolder(k AssetStatus) bool {
	s, ok := set.byKey[k]
	return ok && s.RequiresLocation
}

// CountsAsAvailable reports whether a status belongs in the category
// distribution. An unknown status counts: leaving it out would understate the
// total without saying so.
func (set StatusSet) CountsAsAvailable(k AssetStatus) bool {
	s, ok := set.byKey[k]
	return !ok || s.CountsAsAvailable
}
