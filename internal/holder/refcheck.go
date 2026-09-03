package holder

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/klskk23/nexus-assets/internal/i18n"
	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/store"
)

// Blocker names one asset standing in the way of removing a holder entity.
type Blocker struct {
	AssetID string `json:"asset_id"`
	// Name is how the asset is referred to: its category's display key, or the
	// short UUID when the category has not nominated one.
	Name string `json:"name"`
	// Reason is "holder" when the asset is currently held by the entity,
	// "home" when the entity is where the asset belongs once it comes back, or
	// "reference" when a field on the asset points at it.
	Reason string `json:"reason"`
}

// blockerLimit caps how many are listed. Enough to show what is going on
// without turning an error message into a report.
const blockerLimit = 5

// Blockers returns the assets that prevent an entity from being removed.
//
// Three distinct ways to be in the way, and all three must be checked:
//
//   - the asset is sitting in the warehouse;
//   - the warehouse is the asset's home -- where a check-in sends it when
//     nobody names a destination;
//   - a field on the asset names it, an "install location" say.
//
// The home case was missed until 013 and is the worst of the three: a device
// out on loan does not hold its home, so the warehouse deleted cleanly, and
// the next check-in resolved a home id that no longer existed. Nothing on that
// path checks the destination exists, so the device landed on a holder with no
// name and nothing was raised.
func (s *Store) Blockers(ctx context.Context, entityID string) ([]Blocker, int, error) {
	var out []Blocker
	var total int

	err := s.db.Read(ctx, func(ctx context.Context, db *sql.DB) error {
		if err := db.QueryRowContext(ctx, countBlockersSQL, entityID, entityID, entityID).Scan(&total); err != nil {
			return fmt.Errorf("count blockers: %w", err)
		}
		// Six placeholders: two for the CASE, three for the WHERE, one limit.
		rows, err := db.QueryContext(ctx, listBlockersSQL,
			entityID, entityID, entityID, entityID, entityID, blockerLimit)
		if err != nil {
			return fmt.Errorf("list blockers: %w", err)
		}
		defer rows.Close()
		for rows.Next() {
			var b Blocker
			var attrsJSON, displayKey string
			if err := rows.Scan(&b.AssetID, &attrsJSON, &displayKey, &b.Reason); err != nil {
				return err
			}
			attrs, err := store.UnmarshalJSONMap(attrsJSON)
			if err != nil {
				return err
			}
			b.Name = model.AssetDisplayName(b.AssetID, attrs, displayKey)
			out = append(out, b)
		}
		return rows.Err()
	})
	return out, total, err
}

const blockerPredicate = `
	(holder_type = 'entity' AND holder_id = ?)
	OR (home_holder_type = 'entity' AND home_holder_id = ?)
	OR EXISTS (SELECT 1 FROM json_each(assets.attrs) WHERE json_each.value = ?)`

const countBlockersSQL = `SELECT count(*) FROM assets WHERE ` + blockerPredicate

// The display name is assembled in Go rather than SQL, so ordering falls back
// to creation order: stable, and the same order the list page shows.
const listBlockersSQL = `
	SELECT a.id, a.attrs, coalesce(c.display_key, ''),
	       CASE
	         WHEN a.holder_type = 'entity' AND a.holder_id = ? THEN 'holder'
	         WHEN a.home_holder_type = 'entity' AND a.home_holder_id = ? THEN 'home'
	         ELSE 'reference'
	       END
	FROM assets a JOIN categories c ON c.id = a.category_id
	WHERE (a.holder_type = 'entity' AND a.holder_id = ?)
	   OR (a.home_holder_type = 'entity' AND a.home_holder_id = ?)
	   OR EXISTS (SELECT 1 FROM json_each(a.attrs) WHERE json_each.value = ?)
	ORDER BY a.created_at, a.id LIMIT ?`

// describeBlockers builds a message a person can act on, in whichever language
// they end up reading it in.
//
// The device names are data and stay as they are; everything around them --
// the reason each one is in the way, the separator, the "showing the first N"
// tail -- is a nested Message, resolved only when the HTTP layer renders.
func describeBlockers(entityName string, blockers []Blocker, total int) error {
	parts := make([]any, 0, len(blockers))
	for _, b := range blockers {
		reasonKey := i18n.KeyHolderBlockerHold
		switch b.Reason {
		case "home":
			reasonKey = i18n.KeyHolderBlockerHome
		case "reference":
			reasonKey = i18n.KeyHolderBlockerRef
		}
		parts = append(parts, i18n.M(i18n.KeyBlockerEntry, b.Name, i18n.M(reasonKey)))
	}

	var list any = i18n.M(i18n.KeyHolderBlockerPlain)
	if len(parts) > 0 {
		list = i18n.M(i18n.KeyHolderBlockerList, i18n.Join(i18n.KeyListSeparator, parts...))
	}
	var tail any = ""
	if total > len(blockers) {
		tail = i18n.M(i18n.KeyHolderReferencedMore, len(blockers))
	}
	return i18n.Wrap(ErrReferenced,
		i18n.KeyHolderReferenced, entityName, total, i18n.Join("", list, tail))
}
