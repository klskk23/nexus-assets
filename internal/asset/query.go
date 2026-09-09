package asset

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/klskk23/nexus-assets/internal/i18n"
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
	fields, err := s.schema.EffectiveFieldsForAsset(ctx, a.CategoryID, a.ModelID)
	if err != nil {
		return a, err
	}
	a.Attrs, a.ArchivedAttrs = SplitAttrs(schema.ActiveFields(schema.ForModel(fields, a.ModelID)), a.Attrs)

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
	Q string
	// IDs narrows to exactly these assets, for "print the ones I ticked".
	// Empty means no such narrowing; a non-empty list of ids that match
	// nothing is an empty result, not everything.
	IDs                []string
	CategoryID         string
	IncludeDescendants bool
	Status             string
	OwnerID            string
	// ModelID narrows to one product model. It is what makes a model-bound
	// field's column worth showing (015, decision 103): the column means
	// something only once the list is looking at devices that have the field.
	ModelID string
	// VendorID narrows to every model from one vendor (016). It is the
	// question "show me the Dell fleet", which used to mean picking the models
	// off a list one at a time and remembering which ones were Dell's.
	VendorID    string
	HolderType  string
	HolderID    string
	AttrFilters map[string]string
	Offset      int
	Limit       int
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

	where, args, err := s.filterClause(ctx, f, &res)
	if err != nil {
		return res, err
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
			return FieldErrors{"confirm": i18n.M(i18n.KeyConfirmSNMismatch)}
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

// DeleteMany removes several assets in one transaction.
//
// The single delete asks for the device's number to be typed out. That does
// not scale, so a batch asks for its size instead: you cannot confirm twelve
// deletions without having looked at how many you selected. Checking it here
// as well as on screen keeps the endpoint self-describing -- the count is part
// of the request, not an afterthought of the interface.
//
// All or nothing. A batch that removed nine of twelve and then failed would
// leave the operator with no idea which nine.
func (s *Service) DeleteMany(ctx context.Context, ids []string, confirm string) (int, error) {
	if len(ids) == 0 {
		return 0, FieldErrors{"asset_ids": i18n.M(i18n.KeyNoAssetsSelected)}
	}
	if confirm != strconv.Itoa(len(ids)) {
		return 0, FieldErrors{"confirm": i18n.M(i18n.KeyConfirmCount, len(ids))}
	}

	err := s.db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		for _, id := range ids {
			var exists string
			err := tx.QueryRowContext(ctx, `SELECT id FROM assets WHERE id = ?`, id).Scan(&exists)
			if errors.Is(err, sql.ErrNoRows) {
				return ErrNotFound
			}
			if err != nil {
				return err
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
		}
		return nil
	})
	if err != nil {
		return 0, err
	}
	return len(ids), nil
}

// plainFilters is the half of the filter set that is one column and one value.
//
// Split out from filterClause, which keeps the two that are not: the category
// filter reads a path first, and the search decides an exact match on the way
// through.
func plainFilters(f ListFilter) ([]string, []any) {
	var where []string
	var args []any
	for _, c := range []struct {
		sql string
		val string
	}{
		{`status = ?`, f.Status},
		{`owner_id = ?`, f.OwnerID},
		{`model_id = ?`, f.ModelID},
		// Every model from one vendor. "Show me the Dell fleet" used to mean
		// picking those models off a list one at a time (016).
		{`model_id IN (SELECT id FROM product_models WHERE vendor_id = ?)`, f.VendorID},
	} {
		if c.val != "" {
			where = append(where, c.sql)
			args = append(args, c.val)
		}
	}
	// The kind travels with the id: an id alone would match a user and an
	// entity that happened to share it.
	if f.HolderType != "" && f.HolderID != "" {
		where = append(where, `holder_type = ? AND holder_id = ?`)
		args = append(args, f.HolderType, f.HolderID)
	}
	for k, v := range f.AttrFilters {
		where = append(where, `json_extract(attrs, '$.' || ?) = ?`)
		args = append(args, k, v)
	}
	return where, args
}

// filterClause turns the filter into WHERE fragments and their arguments.
//
// It also fills in ExactMatchID, which is why it takes the result: an exact hit
// on a scanned code is decided by the same search that narrows the list, and
// running that query twice to keep the signature tidy would be a lie about the
// cost.
func (s *Service) filterClause(ctx context.Context, f ListFilter, res *ListResult) ([]string, []any, error) {
	where := []string{"1 = 1"}
	args := []any{}

	if f.CategoryID != "" {
		if f.IncludeDescendants {
			var path string
			if err := s.db.ReadDB().QueryRowContext(ctx,
				`SELECT path FROM categories WHERE id = ?`, f.CategoryID).Scan(&path); err != nil {
				if errors.Is(err, sql.ErrNoRows) {
					return nil, nil, schema.ErrNotFound
				}
				return nil, nil, err
			}
			where = append(where,
				`category_id IN (SELECT id FROM categories WHERE path LIKE ? || '%')`)
			args = append(args, path)
		} else {
			where = append(where, `category_id = ?`)
			args = append(args, f.CategoryID)
		}
	}
	if len(f.IDs) > 0 {
		holes := make([]string, len(f.IDs))
		for i, id := range f.IDs {
			holes[i] = "?"
			args = append(args, id)
		}
		where = append(where, `id IN (`+strings.Join(holes, ",")+`)`)
	}
	plainWhere, plainArgs := plainFilters(f)
	where = append(where, plainWhere...)
	args = append(args, plainArgs...)

	q := strings.TrimSpace(f.Q)
	if q == "" {
		return where, args, nil
	}

	// Exact first: a scanner types the whole code, and a single hit should land
	// on the device rather than on a one-row list.
	id, found, err := s.exactMatch(ctx, q)
	if err != nil {
		return nil, nil, err
	}
	if found {
		res.ExactMatchID = id
	}
	like := "%" + q + "%"
	upper := "%" + normaliseScan(q) + "%"
	// Two tables, because findability and uniqueness stopped being one idea in
	// 026. The unique one carries retired values as well -- an old asset number
	// is still an identity claim, and whoever is holding the old label should
	// find the device -- while the search table holds current values only.
	//
	// A field is reachable here without being named, which is the point: the
	// keys are configuration, and a query that spelled them out would answer
	// yesterday's schema.
	where = append(where, `(
		id IN (SELECT asset_id FROM asset_unique_values WHERE value LIKE ? OR value LIKE ?)
		OR id IN (SELECT asset_id FROM asset_search_values WHERE value LIKE ? OR value LIKE ?)
		OR model_id IN (SELECT id FROM product_models WHERE name LIKE ?)
		OR id LIKE ?
	)`)
	args = append(args, like, upper, like, upper, like, q+"%")
	return where, args, nil
}

// DisplayNames resolves the human-readable number for a set of assets.
//
// The number is not a column: it is whichever attribute the asset's category
// nominates as its display key, falling back to a short form of the id when a
// category nominates none. So "show me the number" is a join plus a lookup,
// and doing it per row would mean two statements per row.
//
// One pass instead: the ids in, one query for their attrs and categories, one
// map of display keys for the whole set. This mirrors what List already does
// for a page of assets -- the statement count stays constant however many
// transfers a page holds.
//
// Ids with no surviving asset are simply absent from the result. Transfers
// cascade with their asset, so in practice that only happens if one is deleted
// between the two queries.
func (s *Service) DisplayNames(ctx context.Context, ids []string) (map[string]string, error) {
	if len(ids) == 0 {
		return map[string]string{}, nil
	}
	seen := make(map[string]struct{}, len(ids))
	args := make([]any, 0, len(ids))
	holes := make([]byte, 0, len(ids)*2)
	for _, id := range ids {
		if _, dup := seen[id]; dup {
			continue
		}
		seen[id] = struct{}{}
		args = append(args, id)
		if len(holes) > 0 {
			holes = append(holes, ',')
		}
		holes = append(holes, '?')
	}

	rows, err := s.db.ReadDB().QueryContext(ctx,
		`SELECT id, category_id, attrs FROM assets WHERE id IN (`+string(holes)+`)`, args...)
	if err != nil {
		return nil, fmt.Errorf("load assets for display names: %w", err)
	}
	defer rows.Close()

	type row struct {
		id, categoryID string
		attrs          map[string]any
	}
	var found []row
	for rows.Next() {
		var r row
		var attrsJSON string
		if err := rows.Scan(&r.id, &r.categoryID, &attrsJSON); err != nil {
			return nil, err
		}
		if err := json.Unmarshal([]byte(attrsJSON), &r.attrs); err != nil {
			return nil, fmt.Errorf("parse attrs of %s: %w", r.id, err)
		}
		found = append(found, r)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	keys, err := s.schema.DisplayKeys(ctx)
	if err != nil {
		return nil, err
	}
	out := make(map[string]string, len(found))
	for _, r := range found {
		out[r.id] = model.AssetDisplayName(r.id, r.attrs, keys[r.categoryID])
	}
	return out, nil
}
