package model

import "testing"

func state(s AssetStatus, holderID, owner string) AssetState {
	return AssetState{
		Status:  s,
		Holder:  Holder{Type: HolderTypeEntity, ID: holderID},
		OwnerID: owner,
	}
}

func TestDeriveTransferKind(t *testing.T) {
	warehouse := state(StatusInStock, "loc-1", "u1")

	cases := []struct {
		name string
		from *AssetState
		to   AssetState
		want TransferKind
		emit bool
	}{
		{
			name: "creation",
			from: nil,
			to:   warehouse,
			want: KindCreate, emit: true,
		},
		{
			// The precedence guard: this move changes both status and holder.
			// Testing the holder first would mislabel it as a transfer.
			name: "checkout changes status and holder at once",
			from: &warehouse,
			to:   AssetState{Status: StatusInUse, Holder: Holder{Type: HolderTypeUser, ID: "zhang"}, OwnerID: "u1"},
			want: KindCheckout, emit: true,
		},
		{
			name: "checkin",
			from: ptr(AssetState{Status: StatusInUse, Holder: Holder{Type: HolderTypeUser, ID: "zhang"}, OwnerID: "u1"}),
			to:   warehouse,
			want: KindCheckin, emit: true,
		},
		{
			name: "send for repair is a status change",
			from: &warehouse,
			to:   state(StatusInRepair, "vendor-1", "u1"),
			want: KindStatusChange, emit: true,
		},
		{
			name: "person to person keeps in_use and is a transfer",
			from: ptr(AssetState{Status: StatusInUse, Holder: Holder{Type: HolderTypeUser, ID: "zhang"}, OwnerID: "u1"}),
			to:   AssetState{Status: StatusInUse, Holder: Holder{Type: HolderTypeUser, ID: "li"}, OwnerID: "u1"},
			want: KindTransfer, emit: true,
		},
		{
			name: "owner only",
			from: &warehouse,
			to:   state(StatusInStock, "loc-1", "u2"),
			want: KindReassign, emit: true,
		},
		{
			name: "attribute only edit emits nothing",
			from: &warehouse,
			to:   warehouse,
			want: "", emit: false,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, emit := DeriveTransferKind(tc.from, tc.to)
			if emit != tc.emit {
				t.Fatalf("emit = %v, want %v", emit, tc.emit)
			}
			if got != tc.want {
				t.Errorf("kind = %q, want %q", got, tc.want)
			}
		})
	}
}

func ptr(s AssetState) *AssetState { return &s }
