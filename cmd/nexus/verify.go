package main

import (
	"context"
	"database/sql"
	"fmt"
	"log"

	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/store"
)

// runVerify replays every transfer event and reconciles it against the
// materialised snapshot on the asset rows.
//
// Two checks, and the second is the one that earns its keep: comparing each
// event's from_* against the previous event's to_* catches any code path that
// wrote to assets directly, bypassing the save pipeline. That is the only way
// the snapshot can drift, and nothing else would notice it.
//
// A third pass reconciles asset_unique_values against attrs. That table is a
// derived copy maintained by the same pipeline, and a derived copy nobody
// checks is a derived copy that silently rots.
func runVerify(ctx context.Context, a *app) error {
	db := a.db.ReadDB()

	rows, err := db.QueryContext(ctx, `
		SELECT a.id, a.attrs, coalesce(c.display_key, ''),
		       a.status, a.holder_type, a.holder_id, a.owner_id
		FROM assets a JOIN categories c ON c.id = a.category_id
		ORDER BY a.id`)
	if err != nil {
		return fmt.Errorf("load assets: %w", err)
	}
	type snapshot struct {
		name, status, holderType, holderID, ownerID string
	}
	snaps := map[string]snapshot{}
	for rows.Next() {
		var id, attrsJSON, displayKey string
		var s snapshot
		if err := rows.Scan(&id, &attrsJSON, &displayKey,
			&s.status, &s.holderType, &s.holderID, &s.ownerID); err != nil {
			rows.Close()
			return err
		}
		attrs, err := store.UnmarshalJSONMap(attrsJSON)
		if err != nil {
			rows.Close()
			return err
		}
		s.name = model.AssetDisplayName(id, attrs, displayKey)
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
						"something wrote to assets outside the save pipeline", snap.name, line, kind)
				}
			} else if kind != string(model.KindCreate) {
				problems++
				log.Printf("asset %s: the first event is %q, expected create", snap.name, kind)
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
			log.Printf("asset %s has no transfer history at all", snap.name)
			continue
		}
		if lastTo.status != snap.status || lastTo.holderType != snap.holderType ||
			lastTo.holderID != snap.holderID || lastTo.ownerID != snap.ownerID {
			problems++
			log.Printf("asset %s: snapshot (%s / %s:%s / owner %s) disagrees with the last event "+
				"(%s / %s:%s / owner %s)",
				snap.name, snap.status, snap.holderType, snap.holderID, snap.ownerID,
				lastTo.status, lastTo.holderType, lastTo.holderID, lastTo.ownerID)
		}
		if snap.ownerID == "" {
			problems++
			log.Printf("asset %s has no owner", snap.name)
		}
	}

	drift, err := verifyUniqueValues(ctx, db)
	if err != nil {
		return err
	}
	problems += drift

	if problems > 0 {
		return fmt.Errorf("verify found %d problem(s) across %d asset(s)", problems, len(snaps))
	}
	log.Printf("verify: %d asset(s) reconcile with their transfer history and unique values", len(snaps))
	return nil
}

// verifyUniqueValues checks the reverse-lookup table both ways: no live row
// that disagrees with attrs, and no unique field carrying a value without one.
func verifyUniqueValues(ctx context.Context, db *sql.DB) (int, error) {
	problems := 0

	stale, err := db.QueryContext(ctx, `
		SELECT uv.asset_id, uv.field_key, uv.value,
		       coalesce(json_extract(a.attrs, '$.' || uv.field_key), '')
		FROM asset_unique_values uv JOIN assets a ON a.id = uv.asset_id
		WHERE uv.archived_at IS NULL
		  AND coalesce(json_extract(a.attrs, '$.' || uv.field_key), '') != uv.value`)
	if err != nil {
		return 0, fmt.Errorf("scan stale unique values: %w", err)
	}
	for stale.Next() {
		var id, key, indexed, actual string
		if err := stale.Scan(&id, &key, &indexed, &actual); err != nil {
			stale.Close()
			return 0, err
		}
		problems++
		log.Printf("asset %s: unique index holds %s=%q but attrs says %q; "+
			"something wrote to assets outside the save pipeline", model.ShortID(id), key, indexed, actual)
	}
	stale.Close()
	if err := stale.Err(); err != nil {
		return 0, err
	}

	// The other direction: a unique field with a value and no live row would
	// leave the value unsearchable and, worse, free for another device to take.
	missing, err := db.QueryContext(ctx, `
		SELECT DISTINCT a.id, f.key
		FROM assets a
		JOIN categories c  ON c.id = a.category_id
		JOIN categories cc ON c.path LIKE cc.path || '%'
		JOIN category_fields cf ON cf.category_id = cc.id
		JOIN field_definitions f ON f.id = cf.field_id
		WHERE f.is_unique = 1
		  AND coalesce(trim(json_extract(a.attrs, '$.' || f.key)), '') != ''
		  AND NOT EXISTS (
		        SELECT 1 FROM asset_unique_values uv
		        WHERE uv.asset_id = a.id AND uv.field_key = f.key AND uv.archived_at IS NULL)`)
	if err != nil {
		return 0, fmt.Errorf("scan missing unique values: %w", err)
	}
	defer missing.Close()
	for missing.Next() {
		var id, key string
		if err := missing.Scan(&id, &key); err != nil {
			return 0, err
		}
		problems++
		log.Printf("asset %s: %s carries a value but has no live row in the unique index", model.ShortID(id), key)
	}
	return problems, missing.Err()
}
