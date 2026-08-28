package asset

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/schema"
	"github.com/klskk23/nexus-assets/internal/store"
)

// Get loads one asset and splits its stored values into live and orphan keys.
func (s *Service) Get(ctx context.Context, id string) (model.Asset, error) {
	a, err := scanAsset(s.db.ReadDB().QueryRowContext(ctx, `SELECT `+assetCols+` FROM assets WHERE id = ?`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return a, ErrNotFound
	}
	if err != nil {
		return a, err
	}
	fields, err := s.schema.EffectiveFields(ctx, a.CategoryID)
	if err != nil {
		return a, err
	}
	a.Attrs, a.ArchivedAttrs = SplitAttrs(schema.ActiveFields(fields), a.Attrs)

	var displayKey string
	if err := s.db.ReadDB().QueryRowContext(ctx,
		`SELECT coalesce(display_key, '') FROM categories WHERE id = ?`, a.CategoryID).Scan(&displayKey); err != nil {
		return a, err
	}
	a.DisplayName = model.AssetDisplayName(a.ID, a.Attrs, displayKey)
	return a, nil
}

// ListFilter carries the supported list-page filters.
type ListFilter struct {
	Q                  string
	CategoryID         string
	IncludeDescendants bool
	Status             string
	OwnerID            string
	HolderType         string
	HolderID           string
	AttrFilters        map[string]string
	Offset             int
	Limit              int
}

// ListResult is one page plus the total, which the list page needs in order to
// show "1,847 items".
type ListResult struct {
	Items        []model.Asset
	Total        int
	ExactMatchID string
}

const defaultLimit, maxLimit = 50, 200

// List runs the list query.
//
// Names for holder, owner and model are not joined per row: the caller batches
// them with one IN query each, so the statement count stays constant no matter
// how many rows come back.
func (s *Service) List(ctx context.Context, f ListFilter) (ListResult, error) {
	var res ListResult
	if f.Limit <= 0 {
		f.Limit = defaultLimit
	}
	if f.Limit > maxLimit {
		f.Limit = maxLimit
	}

	where := []string{"1 = 1"}
	args := []any{}

	if f.CategoryID != "" {
		if f.IncludeDescendants {
			var path string
			if err := s.db.ReadDB().QueryRowContext(ctx,
				`SELECT path FROM categories WHERE id = ?`, f.CategoryID).Scan(&path); err != nil {
				if errors.Is(err, sql.ErrNoRows) {
					return res, schema.ErrNotFound
				}
				return res, err
			}
			where = append(where,
				`category_id IN (SELECT id FROM categories WHERE path LIKE ? || '%')`)
			args = append(args, path)
		} else {
			where = append(where, `category_id = ?`)
			args = append(args, f.CategoryID)
		}
	}
	if f.Status != "" {
		where = append(where, `status = ?`)
		args = append(args, f.Status)
	}
	if f.OwnerID != "" {
		where = append(where, `owner_id = ?`)
		args = append(args, f.OwnerID)
	}
	if f.HolderType != "" && f.HolderID != "" {
		where = append(where, `holder_type = ? AND holder_id = ?`)
		args = append(args, f.HolderType, f.HolderID)
	}
	for k, v := range f.AttrFilters {
		where = append(where, `json_extract(attrs, '$.' || ?) = ?`)
		args = append(args, k, v)
	}

	if q := strings.TrimSpace(f.Q); q != "" {
		// Exact first: a scanner types the whole code, and a single hit should
		// land on the device rather than on a one-row list.
		id, found, err := s.exactMatch(ctx, q)
		if err != nil {
			return res, err
		}
		if found {
			res.ExactMatchID = id
		}
		like := "%" + q + "%"
		upper := "%" + normaliseScan(q) + "%"
		// Every unique value, live or retired, is reachable through one table,
		// so a scanner finds a device by its asset tag, its MAC or its vendor
		// serial without any of those keys being named here.
		where = append(where, `(
			id IN (SELECT asset_id FROM asset_unique_values WHERE value LIKE ? OR value LIKE ?)
			OR model_id IN (SELECT id FROM product_models WHERE name LIKE ?)
			OR id LIKE ?
		)`)
		args = append(args, like, upper, like, q+"%")
	}

	clause := strings.Join(where, " AND ")

	if err := s.db.ReadDB().QueryRowContext(ctx,
		`SELECT count(*) FROM assets WHERE `+clause, args...).Scan(&res.Total); err != nil {
		return res, fmt.Errorf("count assets: %w", err)
	}

	rows, err := s.db.ReadDB().QueryContext(ctx,
		`SELECT `+assetCols+` FROM assets WHERE `+clause+` ORDER BY created_at DESC, id LIMIT ? OFFSET ?`,
		append(args, f.Limit, f.Offset)...)
	if err != nil {
		return res, fmt.Errorf("list assets: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		a, err := scanAsset(rows)
		if err != nil {
			return res, err
		}
		res.Items = append(res.Items, a)
	}
	if err := rows.Err(); err != nil {
		return res, err
	}

	// One map for the whole page rather than a lookup per row: display names
	// are the first column, so resolving them must not scale with the page.
	if len(res.Items) > 0 {
		displayKeys, err := s.schema.DisplayKeys(ctx)
		if err != nil {
			return res, err
		}
		for i := range res.Items {
			it := &res.Items[i]
			it.DisplayName = model.AssetDisplayName(it.ID, it.Attrs, displayKeys[it.CategoryID])
		}
	}
	return res, nil
}

// exactMatch resolves a scanned code to a single asset.
//
// Live values first, then retired ones, then the UUID. Ambiguity stops the
// jump rather than picking a winner: a retired value may legitimately belong to
// several devices over time -- a swapped mainboard carries its MAC to the next
// machine -- and silently opening one of them would be worse than showing both.
func (s *Service) exactMatch(ctx context.Context, q string) (string, bool, error) {
	normalised := normaliseScan(q)
	probes := []struct {
		sql  string
		args []any
	}{
		{`SELECT DISTINCT asset_id FROM asset_unique_values
		  WHERE archived_at IS NULL AND value IN (?, ?)`, []any{q, normalised}},
		{`SELECT DISTINCT asset_id FROM asset_unique_values
		  WHERE archived_at IS NOT NULL AND value IN (?, ?)`, []any{q, normalised}},
		{`SELECT id FROM assets WHERE id = ?`, []any{q}},
	}
	for _, p := range probes {
		ids, err := s.collectIDs(ctx, p.sql+` LIMIT 2`, p.args...)
		if err != nil {
			return "", false, err
		}
		switch len(ids) {
		case 0:
			continue
		case 1:
			return ids[0], true, nil
		default:
			// Several devices answer to this code; let the list show them.
			return "", false, nil
		}
	}
	return "", false, nil
}

func (s *Service) collectIDs(ctx context.Context, q string, args ...any) ([]string, error) {
	rows, err := s.db.ReadDB().QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out = append(out, id)
	}
	return out, rows.Err()
}

// normaliseScan strips the separators a scanner or a human may include, so a
// MAC typed as aa-bb-cc matches one stored as AABBCC.
func normaliseScan(q string) string {
	return strings.ToUpper(strings.NewReplacer(":", "", "-", "", ".", "", " ", "").Replace(q))
}

// HistoricValue is one value an asset used to carry on a unique field.
type HistoricValue struct {
	Key        string    `json:"key"`
	Value      string    `json:"value"`
	ArchivedAt time.Time `json:"archived_at"`
}

// ValueHistory returns the retired unique values of one asset, newest first.
//
// This is what keeps an already-printed label useful after the value behind it
// changed: the old code still resolves, it simply no longer holds the slot.
func (s *Service) ValueHistory(ctx context.Context, assetID string) ([]HistoricValue, error) {
	rows, err := s.db.ReadDB().QueryContext(ctx,
		`SELECT field_key, value, archived_at FROM asset_unique_values
		 WHERE asset_id = ? AND archived_at IS NOT NULL
		 ORDER BY archived_at DESC, field_key`, assetID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []HistoricValue
	for rows.Next() {
		var h HistoricValue
		var archived string
		if err := rows.Scan(&h.Key, &h.Value, &archived); err != nil {
			return nil, err
		}
		var err error
		if h.ArchivedAt, err = store.ParseTime(archived); err != nil {
			return nil, err
		}
		out = append(out, h)
	}
	return out, rows.Err()
}

// Delete removes an asset outright, along with its transfer history and its
// unique-value rows.
//
// The caller types the asset's display name to confirm. For a category with no
// display key that is the short UUID, which is still eight characters someone
// has to copy deliberately -- the point is to make deletion a considered act,
// not to make it convenient.
func (s *Service) Delete(ctx context.Context, id, confirm string) error {
	return s.db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		var attrsJSON, displayKey string
		err := tx.QueryRowContext(ctx,
			`SELECT a.attrs, coalesce(c.display_key, '')
			 FROM assets a JOIN categories c ON c.id = a.category_id WHERE a.id = ?`, id).
			Scan(&attrsJSON, &displayKey)
		if errors.Is(err, sql.ErrNoRows) {
			return ErrNotFound
		}
		if err != nil {
			return err
		}
		attrs, err := store.UnmarshalJSONMap(attrsJSON)
		if err != nil {
			return err
		}
		if model.AssetDisplayName(id, attrs, displayKey) != confirm {
			return FieldErrors{"confirm": "输入的编号与该资产不符"}
		}
		for _, q := range []string{
			`DELETE FROM asset_transfers WHERE asset_id = ?`,
			`DELETE FROM asset_unique_values WHERE asset_id = ?`,
			`DELETE FROM assets WHERE id = ?`,
		} {
			if _, err := tx.ExecContext(ctx, q, id); err != nil {
				return err
			}
		}
		return nil
	})
}
