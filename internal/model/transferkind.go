package model

// DeriveTransferKind labels a state change.
//
// The order of the checks matters and must not be rearranged. A checkout moves
// both the status and the holder; if the holder were tested first the event
// would be recorded as a plain transfer and the timeline would no longer show
// that a checkout happened.
func DeriveTransferKind(from *AssetState, to AssetState) (TransferKind, bool) {
	if from == nil {
		return KindCreate, true
	}
	switch {
	case from.Status == StatusInStock && to.Status == StatusInUse:
		return KindCheckout, true
	case from.Status == StatusInUse && to.Status == StatusInStock:
		return KindCheckin, true
	case from.Status != to.Status:
		return KindStatusChange, true
	case !from.Holder.Equal(to.Holder):
		return KindTransfer, true
	case from.OwnerID != to.OwnerID:
		return KindReassign, true
	default:
		// Nothing in the triple moved: an attribute-only edit, which does not
		// belong in the transfer timeline.
		return "", false
	}
}
