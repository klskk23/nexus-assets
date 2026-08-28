package main

import (
	"context"
	"fmt"
	"log"

	"github.com/klskk23/nexus-assets/internal/model"
)

// runVerify replays every transfer event and reconciles it against the
// materialised snapshot on the asset rows.
//
// Two checks, and the second is the one that earns its keep: comparing each
// event's from_* against the previous event's to_* catches any code path that
// wrote to assets directly, bypassing the save pipeline. That is the only way
// the snapshot can drift, and nothing else would notice it.
func runVerify(ctx context.Context, a *app) error {
	db := a.db.ReadDB()

	rows, err := db.QueryContext(ctx, `
		SELECT id, sn, status, holder_type, holder_id, owner_id FROM assets ORDER BY id`)
	if err != nil {
		return fmt.Errorf("load assets: %w", err)
	}
	type snapshot struct {
		sn, status, holderType, holderID, ownerID string
	}
	snaps := map[string]snapshot{}
	for rows.Next() {
		var id string
		var s snapshot
		if err := rows.Scan(&id, &s.sn, &s.status, &s.holderType, &s.holderID, &s.ownerID); err != nil {
			rows.Close()
			return err
		}
		snaps[id] = s
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}

	problems := 0

	for id, snap := range snaps {
		evs, err := db.QueryContext(ctx, `
			SELECT kind, from_status, from_holder_type, from_holder_id, from_owner_id,
			       to_status, to_holder_type, to_holder_id, to_owner_id
			FROM asset_transfers WHERE asset_id = ? ORDER BY created_at, rowid`, id)
		if err != nil {
			return fmt.Errorf("load transfers for %s: %w", id, err)
		}

		var prevTo *snapshot
		var lastTo *snapshot
		line := 0
		for evs.Next() {
			line++
			var kind string
			var fs, fht, fhi, fo *string
			var ts, tht, thi, to string
			if err := evs.Scan(&kind, &fs, &fht, &fhi, &fo, &ts, &tht, &thi, &to); err != nil {
				evs.Close()
				return err
			}
			// Chain integrity: this event's from_* must equal the previous to_*.
			if prevTo != nil {
				if fs == nil || *fs != prevTo.status ||
					fht == nil || *fht != prevTo.holderType ||
					fhi == nil || *fhi != prevTo.holderID ||
					fo == nil || *fo != prevTo.ownerID {
					problems++
					log.Printf("asset %s event #%d (%s): from_* does not match the previous event's to_*; "+
						"something wrote to assets outside the save pipeline", snap.sn, line, kind)
				}
			} else if kind != string(model.KindCreate) {
				problems++
				log.Printf("asset %s: the first event is %q, expected create", snap.sn, kind)
			}
			cur := snapshot{status: ts, holderType: tht, holderID: thi, ownerID: to}
			prevTo, lastTo = &cur, &cur
		}
		evs.Close()
		if err := evs.Err(); err != nil {
			return err
		}

		if lastTo == nil {
			problems++
			log.Printf("asset %s has no transfer history at all", snap.sn)
			continue
		}
		if lastTo.status != snap.status || lastTo.holderType != snap.holderType ||
			lastTo.holderID != snap.holderID || lastTo.ownerID != snap.ownerID {
			problems++
			log.Printf("asset %s: snapshot (%s / %s:%s / owner %s) disagrees with the last event "+
				"(%s / %s:%s / owner %s)",
				snap.sn, snap.status, snap.holderType, snap.holderID, snap.ownerID,
				lastTo.status, lastTo.holderType, lastTo.holderID, lastTo.ownerID)
		}
		if snap.ownerID == "" {
			problems++
			log.Printf("asset %s has no owner", snap.sn)
		}
	}

	if problems > 0 {
		return fmt.Errorf("verify found %d problem(s) across %d asset(s)", problems, len(snaps))
	}
	log.Printf("verify: %d asset(s) reconcile with their transfer history", len(snaps))
	return nil
}
