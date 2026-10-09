package main

import (
	"context"
	"fmt"
	"log"

	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/schema"
	"github.com/klskk23/nexus-assets/internal/store"
)

// runVerify observes metadata, assets, indexes and events from one read-only
// transaction. It diagnoses drift; it never repairs either current or historical data.
func runVerify(ctx context.Context, a *app) error {
	return a.db.ReadTx(ctx, func(ctx context.Context, q store.Querier) error {
		return verifyDatabase(ctx, q)
	})
}

func verifyDatabase(ctx context.Context, q store.Querier) error {
	sch, err := schema.LoadSchemaSnapshot(ctx, q)
	if err != nil {
		return fmt.Errorf("verify schema: %w", err)
	}
	snaps, err := loadSnapshots(ctx, q)
	if err != nil {
		return err
	}
	problems := verifySchema(sch)
	for id, snap := range snaps {
		n, err := verifyHistory(ctx, q, id, snap)
		if err != nil {
			return err
		}
		problems += n
	}
	for _, check := range []func() (int, error){
		func() (int, error) { return verifyIndexes(ctx, q, sch, snaps) },
		func() (int, error) { return verifyKeyConflicts(ctx, q) },
		func() (int, error) { return verifyReferences(ctx, q) },
	} {
		n, err := check()
		if err != nil {
			return err
		}
		problems += n
	}
	if problems > 0 {
		return fmt.Errorf("verify found %d problem(s) across %d asset(s)", problems, len(snaps))
	}
	log.Printf("verify: %d asset(s) reconcile with schema, transfer history, unique and search values", len(snaps))
	return nil
}

// snapshot is an asset as the assets table has it.
type snapshot struct {
	name, status, holderType, holderID, ownerID string
	categoryID                                  string
	modelID                                     *string
	attrs                                       map[string]any
}

// loadSnapshots includes assets with missing categories so corruption cannot
// disappear behind an inner join.
func loadSnapshots(ctx context.Context, db store.Querier) (map[string]snapshot, error) {
	rows, err := db.QueryContext(ctx, `
  SELECT a.id, a.attrs, coalesce(c.display_key, ''),
         a.status, a.holder_type, a.holder_id, a.owner_id, a.category_id, a.model_id
  FROM assets a LEFT JOIN categories c ON c.id = a.category_id
  ORDER BY a.id`)
	if err != nil {
		return nil, fmt.Errorf("load assets: %w", err)
	}
	defer rows.Close()
	snaps := map[string]snapshot{}
	for rows.Next() {
		var id, attrsJSON, displayKey string
		var s snapshot
		if err := rows.Scan(&id, &attrsJSON, &displayKey,
			&s.status, &s.holderType, &s.holderID, &s.ownerID, &s.categoryID, &s.modelID); err != nil {
			return nil, fmt.Errorf("scan asset snapshot: %w", err)
		}
		attrs, err := store.UnmarshalJSONMap(attrsJSON)
		if err != nil {
			return nil, fmt.Errorf("decode asset %s attrs: %w", id, err)
		}
		s.attrs = attrs
		s.name = model.AssetDisplayName(id, attrs, displayKey)
		snaps[id] = s
	}
	return snaps, rows.Err()
}

// verifyHistory retains both event-chain checks: each from_* follows the previous
// to_*, and the last event agrees with the materialized row.
func verifyHistory(ctx context.Context, db store.Querier, id string, snap snapshot) (int, error) {
	evs, err := db.QueryContext(ctx, `
  SELECT kind, from_status, from_holder_type, from_holder_id, from_owner_id,
         to_status, to_holder_type, to_holder_id, to_owner_id
  FROM asset_transfers WHERE asset_id = ? ORDER BY created_at, rowid`, id)
	if err != nil {
		return 0, fmt.Errorf("load transfers for %s: %w", id, err)
	}
	defer evs.Close()
	problems := 0
	var prevTo, lastTo *snapshot
	line := 0
	for evs.Next() {
		line++
		var kind string
		var fs, fht, fhi, fo *string
		var ts, tht, thi, to string
		if err := evs.Scan(&kind, &fs, &fht, &fhi, &fo, &ts, &tht, &thi, &to); err != nil {
			return 0, fmt.Errorf("scan transfer for %s: %w", id, err)
		}
		if prevTo != nil {
			if !follows(*prevTo, fs, fht, fhi, fo) {
				problems++
				log.Printf("asset %s event #%d (%s): from_* does not match the previous event's to_*; something wrote to assets outside the save pipeline", snap.name, line, kind)
			}
		} else if kind != string(model.KindCreate) {
			problems++
			log.Printf("asset %s: the first event is %q, expected create", snap.name, kind)
		}
		cur := snapshot{status: ts, holderType: tht, holderID: thi, ownerID: to}
		prevTo, lastTo = &cur, &cur
	}
	if err := evs.Err(); err != nil {
		return 0, err
	}
	if lastTo == nil {
		log.Printf("asset %s has no transfer history at all", snap.name)
		return problems + 1, nil
	}
	if lastTo.status != snap.status || lastTo.holderType != snap.holderType ||
		lastTo.holderID != snap.holderID || lastTo.ownerID != snap.ownerID {
		problems++
		log.Printf("asset %s: snapshot (%s / %s:%s / owner %s) disagrees with the last event (%s / %s:%s / owner %s)",
			snap.name, snap.status, snap.holderType, snap.holderID, snap.ownerID,
			lastTo.status, lastTo.holderType, lastTo.holderID, lastTo.ownerID)
	}
	if snap.ownerID == "" {
		problems++
		log.Printf("asset %s has no owner", snap.name)
	}
	return problems, nil
}

// Nullable from_* columns are only expected on the initial create event.
func follows(prev snapshot, status, holderType, holderID, ownerID *string) bool {
	for _, pair := range []struct {
		got  *string
		want string
	}{
		{status, prev.status}, {holderType, prev.holderType}, {holderID, prev.holderID}, {ownerID, prev.ownerID},
	} {
		if pair.got == nil || *pair.got != pair.want {
			return false
		}
	}
	return true
}
