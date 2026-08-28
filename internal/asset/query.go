package asset

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"

	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/schema"
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
		where = append(where, `(
			sn LIKE ?
			OR json_extract(attrs, '$.mac') LIKE ?
			OR id IN (SELECT asset_id FROM asset_sn_history WHERE sn LIKE ?)
			OR model_id IN (SELECT id FROM product_models WHERE name LIKE ?)
		)`)
		upper := "%" + strings.ToUpper(strings.NewReplacer(":", "", "-", "", ".", "").Replace(q)) + "%"
		args = append(args, like, upper, like, like)
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
	return res, rows.Err()
}

// exactMatch tries the serial number, its history and a normalised MAC.
func (s *Service) exactMatch(ctx context.Context, q string) (string, bool, error) {
	normalised := strings.ToUpper(strings.NewReplacer(":", "", "-", "", ".", "", " ", "").Replace(q))
	queries := []struct {
		sql string
		arg string
	}{
		{`SELECT id FROM assets WHERE sn = ?`, q},
		{`SELECT id FROM assets WHERE json_extract(attrs, '$.mac') = ?`, normalised},
		{`SELECT asset_id FROM asset_sn_history WHERE sn = ?`, q},
	}
	for _, tc := range queries {
		var id string
		err := s.db.ReadDB().QueryRowContext(ctx, tc.sql+` LIMIT 2`, tc.arg).Scan(&id)
		if errors.Is(err, sql.ErrNoRows) {
			continue
		}
		if err != nil {
			return "", false, err
		}
		return id, true, nil
	}
	return "", false, nil
}

// SNHistory returns the retired serial numbers of one asset, newest first.
func (s *Service) SNHistory(ctx context.Context, assetID string) ([]string, error) {
	rows, err := s.db.ReadDB().QueryContext(ctx,
		`SELECT sn FROM asset_sn_history WHERE asset_id = ? ORDER BY replaced_at DESC`, assetID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var sn string
		if err := rows.Scan(&sn); err != nil {
			return nil, err
		}
		out = append(out, sn)
	}
	return out, rows.Err()
}

// Delete removes an asset outright, cascading its transfer history and serial
// number aliases. The caller is responsible for the typed-SN confirmation.
func (s *Service) Delete(ctx context.Context, id, confirmSN string) error {
	return s.db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		var sn string
		if err := tx.QueryRowContext(ctx, `SELECT sn FROM assets WHERE id = ?`, id).Scan(&sn); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return ErrNotFound
			}
			return err
		}
		if sn != confirmSN {
			return FieldErrors{"confirm_sn": "输入的编号与该资产不符"}
		}
		for _, q := range []string{
			`DELETE FROM asset_transfers WHERE asset_id = ?`,
			`DELETE FROM asset_sn_history WHERE asset_id = ?`,
			`DELETE FROM assets WHERE id = ?`,
		} {
			if _, err := tx.ExecContext(ctx, q, id); err != nil {
				return err
			}
		}
		return nil
	})
}
