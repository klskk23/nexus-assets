package schema

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/klskk23/nexus-assets/internal/i18n"
	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/store"
)

// ErrStatusBuiltin blocks removing one of the five the code is written against.
var ErrStatusBuiltin = errors.New("built-in statuses carry behaviour and cannot be removed")

// ErrStatusInUse blocks removing a status assets are currently in.
var ErrStatusInUse = errors.New("status is still in use")

// ErrStatusInvalid marks a rejected key, label or colour.
//
// A sentinel rather than a bare error: without one the HTTP layer's default
// branch turns "that colour is not on the palette" into a 500, which tells the
// operator the server broke rather than that their input needs one edit.
var ErrStatusInvalid = errors.New("invalid status")

// statusKeyPattern keeps keys usable as identifiers: they travel in URLs, CSV
// imports and template expressions, where a space or a colon is a hazard.
var statusKeyPattern = regexp.MustCompile(`^[a-z][a-z0-9_]{0,31}$`)

// PaletteColors are the slots a status may take.
//
// Names rather than values: the palette is defined once per theme in
// index.css, so a status keeps reading well when the page turns dark. A free
// hex field would look more flexible and be wrong half the time.
var PaletteColors = []string{"slate", "green", "blue", "amber", "red", "violet", "teal", "rose"}

// ListStatuses returns every status in display order.
func (s *Store) ListStatuses(ctx context.Context) ([]model.Status, error) {
	return store.LoadStatuses(ctx, s.db.ReadDB())
}

// StatusSet loads the configured statuses ready for the rules that read them.
func (s *Store) StatusSet(ctx context.Context) (model.StatusSet, error) {
	return store.LoadStatusSet(ctx, s.db.ReadDB())
}

// GetStatus loads one status.
func (s *Store) GetStatus(ctx context.Context, key string) (model.Status, error) {
	st, err := store.ScanStatus(s.db.ReadDB().QueryRowContext(ctx,
		`SELECT `+store.StatusColumns+` FROM statuses WHERE key = ?`, key))
	if errors.Is(err, sql.ErrNoRows) {
		return st, ErrNotFound
	}
	return st, err
}

// CreateStatusInput describes a status an administrator is adding.
type CreateStatusInput struct {
	Key               string
	Label             string
	Color             string
	RequiresLocation  bool
	CountsAsAvailable bool
	Terminal          bool
}

// CreateStatus registers a status.
func (s *Store) CreateStatus(ctx context.Context, in CreateStatusInput) (model.Status, error) {
	key := strings.TrimSpace(in.Key)
	if !statusKeyPattern.MatchString(key) {
		return model.Status{}, i18n.Wrap(ErrStatusInvalid, i18n.KeyStatusKeyShape)
	}
	if strings.TrimSpace(in.Label) == "" {
		return model.Status{}, i18n.Wrap(ErrStatusInvalid, i18n.KeyStatusNeedsLabel)
	}
	color := in.Color
	if !validColor(color) {
		return model.Status{}, i18n.Wrap(ErrStatusInvalid, i18n.KeyStatusBadColor, color)
	}

	now := time.Now().UTC()
	st := model.Status{
		Key: model.AssetStatus(key), Label: in.Label, Color: color,
		RequiresLocation: in.RequiresLocation, CountsAsAvailable: in.CountsAsAvailable,
		Terminal: in.Terminal, CreatedAt: now, UpdatedAt: now,
	}
	err := s.db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		// New statuses sort after everything already there.
		if err := tx.QueryRowContext(ctx,
			`SELECT coalesce(max(sort), 0) + 10 FROM statuses`).Scan(&st.Sort); err != nil {
			return err
		}
		_, err := tx.ExecContext(ctx,
			`INSERT INTO statuses (`+store.StatusColumns+`) VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`,
			string(st.Key), st.Label, st.Color, st.Sort,
			boolInt(st.RequiresLocation), boolInt(st.CountsAsAvailable), boolInt(st.Terminal),
			store.FormatTime(now), store.FormatTime(now))
		return err
	})
	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE constraint failed") {
			return st, i18n.Wrap(ErrKeyConflict, i18n.KeyStatusKeyTaken, key)
		}
		return st, fmt.Errorf("create status: %w", err)
	}
	return st, nil
}

// UpdateStatusInput carries the mutable parts of a status.
//
// A built-in may be relabelled, recoloured and reordered. Of its three
// switches only `requires_location` is editable: nothing but the holder check
// reads it, so it is a policy an operator is entitled to set -- and a company
// with several warehouses, or one that hands stock to a department, is
// entitled to say no. `counts_as_available` and `terminal` stay fixed on the
// built-ins, because the rest of the system is written against what those two
// mean for these five.
type UpdateStatusInput struct {
	Label             *string
	Color             *string
	Sort              *int
	RequiresLocation  *bool
	CountsAsAvailable *bool
	Terminal          *bool
}

// UpdateStatus changes a status.
func (s *Store) UpdateStatus(ctx context.Context, key string, in UpdateStatusInput) (model.Status, error) {
	cur, err := s.GetStatus(ctx, key)
	if err != nil {
		return cur, err
	}
	if in.Label != nil {
		if strings.TrimSpace(*in.Label) == "" {
			return cur, i18n.Wrap(ErrStatusInvalid, i18n.KeyStatusNeedsLabel)
		}
		cur.Label = *in.Label
	}
	if in.Color != nil {
		if !validColor(*in.Color) {
			return cur, i18n.Wrap(ErrStatusInvalid, i18n.KeyStatusBadColor, *in.Color)
		}
		cur.Color = *in.Color
	}
	if in.Sort != nil {
		cur.Sort = *in.Sort
	}
	if in.RequiresLocation != nil {
		cur.RequiresLocation = *in.RequiresLocation
	}
	if !cur.Builtin {
		if in.CountsAsAvailable != nil {
			cur.CountsAsAvailable = *in.CountsAsAvailable
		}
		if in.Terminal != nil {
			cur.Terminal = *in.Terminal
		}
	}

	cur.UpdatedAt = time.Now().UTC()
	err = s.db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx,
			`UPDATE statuses SET label = ?, color = ?, sort = ?,
			                     requires_location = ?, counts_as_available = ?, terminal = ?,
			                     updated_at = ?
			 WHERE key = ?`,
			cur.Label, cur.Color, cur.Sort,
			boolInt(cur.RequiresLocation), boolInt(cur.CountsAsAvailable), boolInt(cur.Terminal),
			store.FormatTime(cur.UpdatedAt), key)
		return err
	})
	return cur, err
}

// StatusUsageCounts is what deleting a status would cost.
type StatusUsageCounts struct {
	Assets  int `json:"assets"`
	History int `json:"history"`
}

// AllStatusUsage counts every status in one pass.
//
// Per-row on demand would mean a request per delete button; the confirm dialog
// has to state the cost before the click, so the whole table comes with the
// list. Two aggregates, regardless of how many statuses exist.
func (s *Store) AllStatusUsage(ctx context.Context) (map[string]StatusUsageCounts, error) {
	out := map[string]StatusUsageCounts{}

	assets, err := s.db.ReadDB().QueryContext(ctx,
		`SELECT status, count(*) FROM assets GROUP BY status`)
	if err != nil {
		return nil, fmt.Errorf("count assets by status: %w", err)
	}
	for assets.Next() {
		var k string
		var n int
		if err := assets.Scan(&k, &n); err != nil {
			assets.Close()
			return nil, err
		}
		c := out[k]
		c.Assets = n
		out[k] = c
	}
	assets.Close()
	if err := assets.Err(); err != nil {
		return nil, err
	}

	// An event names two statuses; a move within one status would otherwise be
	// counted twice, so the two columns are unioned rather than added.
	hist, err := s.db.ReadDB().QueryContext(ctx,
		`SELECT st, count(*) FROM (
		   SELECT id, from_status AS st FROM asset_transfers WHERE from_status IS NOT NULL
		   UNION
		   SELECT id, to_status AS st FROM asset_transfers
		 ) GROUP BY st`)
	if err != nil {
		return nil, fmt.Errorf("count transfers by status: %w", err)
	}
	defer hist.Close()
	for hist.Next() {
		var k string
		var n int
		if err := hist.Scan(&k, &n); err != nil {
			return nil, err
		}
		c := out[k]
		c.History = n
		out[k] = c
	}
	return out, hist.Err()
}

// StatusUsage reports how many assets are in a status and how many transfer
// events mention it.
//
// The two are treated differently on delete: assets refuse it, history only
// warns. See DeleteStatus.
func (s *Store) StatusUsage(ctx context.Context, key string) (assets, history int, err error) {
	if err = s.db.ReadDB().QueryRowContext(ctx,
		`SELECT count(*) FROM assets WHERE status = ?`, key).Scan(&assets); err != nil {
		return 0, 0, fmt.Errorf("count assets in status %q: %w", key, err)
	}
	if err = s.db.ReadDB().QueryRowContext(ctx,
		`SELECT count(*) FROM asset_transfers WHERE from_status = ? OR to_status = ?`,
		key, key).Scan(&history); err != nil {
		return 0, 0, fmt.Errorf("count transfers mentioning %q: %w", key, err)
	}
	return assets, history, nil
}

// DeleteStatus removes a status an administrator added.
//
// Assets currently in it refuse the delete: that is data, and the operator can
// act on it by moving those devices. Transfer events mentioning it only warn --
// the timeline falls back to the raw key, which is a loss of readability rather
// than of data, and refusing would make a status used once undeletable for
// good.
func (s *Store) DeleteStatus(ctx context.Context, key string) (int, error) {
	cur, err := s.GetStatus(ctx, key)
	if err != nil {
		return 0, err
	}
	if cur.Builtin {
		return 0, i18n.Wrap(ErrStatusBuiltin, i18n.KeyStatusBuiltin, cur.Label)
	}

	assets, _, err := s.StatusUsage(ctx, key)
	if err != nil {
		return 0, err
	}
	if assets > 0 {
		return assets, i18n.Wrap(ErrStatusInUse, i18n.KeyStatusInUse, assets, cur.Label)
	}

	err = s.db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `DELETE FROM statuses WHERE key = ?`, key)
		return err
	})
	return 0, err
}

func validColor(c string) bool {
	for _, p := range PaletteColors {
		if p == c {
			return true
		}
	}
	return false
}
