package store

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/klskk23/nexus-assets/internal/model"
)

// Queryer is the read half shared by *sql.DB and *sql.Tx.
//
// Statuses used to be constants, so any rule that read them needed nothing.
// They are rows now, and the rules that read them run in both places: the
// overview reads from the pool, a transfer's transition check reads from
// inside the write transaction that is about to apply it. Loading through the
// transaction is what stops a status deleted a millisecond ago from being
// accepted.
type Queryer interface {
	QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error)
}

// StatusColumns is the column list, shared so the scan order cannot drift.
const StatusColumns = `key, label, color, sort, builtin, requires_location, counts_as_available, terminal, created_at, updated_at`

// ScanStatus reads one status row.
func ScanStatus(row interface{ Scan(...any) error }) (model.Status, error) {
	var s model.Status
	var builtin, reqLoc, counts, terminal int
	var created, updated string
	if err := row.Scan(&s.Key, &s.Label, &s.Color, &s.Sort,
		&builtin, &reqLoc, &counts, &terminal, &created, &updated); err != nil {
		return s, err
	}
	s.Builtin = builtin == 1
	s.RequiresLocation = reqLoc == 1
	s.CountsAsAvailable = counts == 1
	s.Terminal = terminal == 1
	var err error
	if s.CreatedAt, err = ParseTime(created); err != nil {
		return s, err
	}
	if s.UpdatedAt, err = ParseTime(updated); err != nil {
		return s, err
	}
	return s, nil
}

// LoadStatuses reads every status in display order.
func LoadStatuses(ctx context.Context, q Queryer) ([]model.Status, error) {
	rows, err := q.QueryContext(ctx,
		`SELECT `+StatusColumns+` FROM statuses ORDER BY sort, key`)
	if err != nil {
		return nil, fmt.Errorf("list statuses: %w", err)
	}
	defer rows.Close()
	out := []model.Status{}
	for rows.Next() {
		st, err := ScanStatus(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, st)
	}
	return out, rows.Err()
}

// LoadStatusSet reads the statuses ready for the rules that consult them.
func LoadStatusSet(ctx context.Context, q Queryer) (model.StatusSet, error) {
	list, err := LoadStatuses(ctx, q)
	if err != nil {
		return model.StatusSet{}, err
	}
	return model.NewStatusSet(list), nil
}
