package holder

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/store"
)

// Blocker names one asset standing in the way of removing a holder entity.
type Blocker struct {
	AssetID string `json:"asset_id"`
	// Name is how the asset is referred to: its category's display key, or the
	// short UUID when the category has not nominated one.
	Name string `json:"name"`
	// Reason is "holder" when the asset is currently held by the entity, or
	// "reference" when a reference field on the asset points at it.
	Reason string `json:"reason"`
}

// blockerLimit caps how many are listed. Enough to show what is going on
// without turning an error message into a report.
const blockerLimit = 5

// Blockers returns the assets that prevent an entity from being removed.
//
// Two distinct ways to be in the way, and both must be checked: an asset can
// be sitting in a warehouse, or it can merely name that warehouse in a
// reference field such as "install location". Checking only possession would
// let the second kind become a dangling pointer.
func (s *Store) Blockers(ctx context.Context, entityID string) ([]Blocker, int, error) {
	var out []Blocker
	var total int

	err := s.db.Read(ctx, func(ctx context.Context, db *sql.DB) error {
		if err := db.QueryRowContext(ctx, countBlockersSQL, entityID, entityID).Scan(&total); err != nil {
			return fmt.Errorf("count blockers: %w", err)
		}
		// Four placeholders: the CASE, the possession test, the reference
		// test, and the limit.
		rows, err := db.QueryContext(ctx, listBlockersSQL, entityID, entityID, entityID, blockerLimit)
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
	OR EXISTS (SELECT 1 FROM json_each(assets.attrs) WHERE json_each.value = ?)`

const countBlockersSQL = `SELECT count(*) FROM assets WHERE ` + blockerPredicate

// The display name is assembled in Go rather than SQL, so ordering falls back
// to creation order: stable, and the same order the list page shows.
const listBlockersSQL = `
	SELECT a.id, a.attrs, coalesce(c.display_key, ''),
	       CASE WHEN a.holder_type = 'entity' AND a.holder_id = ? THEN 'holder' ELSE 'reference' END
	FROM assets a JOIN categories c ON c.id = a.category_id
	WHERE (a.holder_type = 'entity' AND a.holder_id = ?)
	   OR EXISTS (SELECT 1 FROM json_each(a.attrs) WHERE json_each.value = ?)
	ORDER BY a.created_at, a.id LIMIT ?`

// describeBlockers renders a message a person can act on.
func describeBlockers(entityName string, blockers []Blocker, total int) string {
	parts := make([]string, 0, len(blockers))
	for _, b := range blockers {
		reason := "持有"
		if b.Reason == "reference" {
			reason = "引用"
		}
		parts = append(parts, fmt.Sprintf("%s（%s）", b.Name, reason))
	}
	msg := fmt.Sprintf("「%s」仍被 %d 台设备%s", entityName, total, joinOr(parts))
	if total > len(blockers) {
		msg += fmt.Sprintf("，此处仅列出前 %d 台", len(blockers))
	}
	return msg + "，请先转移或改绑后再停用"
}

func joinOr(parts []string) string {
	if len(parts) == 0 {
		return "使用"
	}
	return "使用：" + strings.Join(parts, "、")
}
