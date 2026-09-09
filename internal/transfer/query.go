package transfer

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"

	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/store"
)

const cols = `id, asset_id, batch_id, kind,
	from_status, from_holder_type, from_holder_id, from_owner_id,
	to_status, to_holder_type, to_holder_id, to_owner_id,
	note, due_at, actor_id, created_at, edited_at, edited_by`

func scan(row interface{ Scan(...any) error }) (model.Transfer, error) {
	var t model.Transfer
	var batchID, fromStatus, fromHolderType, fromHolderID, fromOwner sql.NullString
	var note, dueAt, editedAt, editedBy sql.NullString
	var created string

	if err := row.Scan(&t.ID, &t.AssetID, &batchID, &t.Kind,
		&fromStatus, &fromHolderType, &fromHolderID, &fromOwner,
		&t.ToStatus, &t.ToHolder.Type, &t.ToHolder.ID, &t.ToOwner,
		&note, &dueAt, &t.ActorID, &created, &editedAt, &editedBy); err != nil {
		return t, err
	}

	t.BatchID = store.StrPtr(batchID)
	if fromStatus.Valid && fromStatus.String != "" {
		s := model.AssetStatus(fromStatus.String)
		t.FromStatus = &s
		t.FromHolder = &model.Holder{
			Type: model.HolderType(fromHolderType.String),
			ID:   fromHolderID.String,
		}
		t.FromOwner = store.StrPtr(fromOwner)
	}
	t.Note = note.String
	t.EditedBy = store.StrPtr(editedBy)

	var err error
	if t.DueAt, err = store.ScanTime(dueAt); err != nil {
		return t, err
	}
	if t.EditedAt, err = store.ScanTime(editedAt); err != nil {
		return t, err
	}
	if t.CreatedAt, err = store.ParseTime(created); err != nil {
		return t, err
	}
	return t, nil
}

// ByAsset returns the complete timeline of one asset, oldest first.
//
// The ordering tie-breaks on rowid because created_at alone is not a total
// order: two events written in the same instant would otherwise appear in an
// arbitrary sequence, and the timeline is the whole point of the feature.
func (s *Service) ByAsset(ctx context.Context, assetID string) ([]model.Transfer, error) {
	rows, err := s.db.ReadDB().QueryContext(ctx,
		`SELECT `+cols+` FROM asset_transfers WHERE asset_id = ? ORDER BY created_at, rowid`, assetID)
	if err != nil {
		return nil, fmt.Errorf("load timeline: %w", err)
	}
	defer rows.Close()

	var out []model.Transfer
	for rows.Next() {
		t, err := scan(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

// Get loads one event.
func (s *Service) Get(ctx context.Context, id string) (model.Transfer, error) {
	t, err := scan(s.db.ReadDB().QueryRowContext(ctx, `SELECT `+cols+` FROM asset_transfers WHERE id = ?`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return t, ErrNotFound
	}
	return t, err
}

// Recent returns the newest events across all assets, batches folded into one
// entry each.
func (s *Service) Recent(ctx context.Context, limit int) ([]model.Transfer, error) {
	rows, err := s.db.ReadDB().QueryContext(ctx,
		`SELECT `+cols+` FROM asset_transfers ORDER BY created_at DESC, rowid DESC LIMIT ?`, limit*4)
	if err != nil {
		return nil, fmt.Errorf("load recent transfers: %w", err)
	}
	defer rows.Close()

	seenBatch := map[string]bool{}
	var out []model.Transfer
	for rows.Next() && len(out) < limit {
		t, err := scan(rows)
		if err != nil {
			return nil, err
		}
		if t.BatchID != nil {
			if seenBatch[*t.BatchID] {
				continue
			}
			seenBatch[*t.BatchID] = true
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

// ListFilter narrows the whole-system movement list.
//
// Every field is optional and they combine with AND: somebody asking "what did
// Zhou move last week" is asking two questions at once, and answering only one
// of them would be worse than answering neither.
type ListFilter struct {
	ActorID string
	// AssetNumber matches the asset's human-readable number, partially and
	// without regard to case -- people read a number off a label and type the
	// middle of it.
	AssetNumber string
	Kind        string
	From        string // inclusive, RFC3339 or a date
	To          string // exclusive
	Offset      int
	Limit       int
}

// ListResult is the envelope shape this product uses wherever a list paginates.
type ListResult struct {
	Items  []model.Transfer `json:"items"`
	Total  int              `json:"total"`
	Offset int              `json:"offset"`
	Limit  int              `json:"limit"`
}

// List returns movements across every asset, newest first.
//
// The number filter runs in SQL rather than in Go, and that is the whole design
// of this function. The number is not a column -- it is an attribute nominated
// by the asset's category -- so the obvious implementation is to load, resolve
// and then filter. That cannot paginate: LIMIT would apply before the filter,
// the page would come back short, and the total would be a lie.
//
// What makes it possible is asset_unique_values, which already holds the value
// of every unique field, and the number is one. The asset list's own search
// matches against that table for the same reason; this is the same clause.
// Ids fall through to a prefix match for categories that nominate no display
// key, where the number IS the short id.
func (s *Service) List(ctx context.Context, f ListFilter) (ListResult, error) {
	res := ListResult{Items: []model.Transfer{}, Offset: f.Offset, Limit: f.Limit}

	where := []string{"1 = 1"}
	var args []any
	if f.ActorID != "" {
		where = append(where, "actor_id = ?")
		args = append(args, f.ActorID)
	}
	if f.Kind != "" {
		where = append(where, "kind = ?")
		args = append(args, f.Kind)
	}
	if f.From != "" {
		where = append(where, "created_at >= ?")
		args = append(args, f.From)
	}
	if f.To != "" {
		where = append(where, "created_at < ?")
		args = append(args, f.To)
	}
	if f.AssetNumber != "" {
		like := "%" + f.AssetNumber + "%"
		where = append(where,
			`(asset_id IN (SELECT asset_id FROM asset_unique_values WHERE value LIKE ?)
			  OR asset_id LIKE ?)`)
		args = append(args, like, like)
	}
	clause := strings.Join(where, " AND ")

	if err := s.db.ReadDB().QueryRowContext(ctx,
		`SELECT count(*) FROM asset_transfers WHERE `+clause, args...).Scan(&res.Total); err != nil {
		return res, fmt.Errorf("count transfers: %w", err)
	}

	limit := f.Limit
	if limit <= 0 {
		limit = 20
	}
	// rowid breaks ties: several movements recorded in one batch share a
	// timestamp, and without it the order between them is whatever the engine
	// felt like, which makes paging skip and repeat rows.
	rows, err := s.db.ReadDB().QueryContext(ctx,
		`SELECT `+cols+` FROM asset_transfers WHERE `+clause+`
		 ORDER BY created_at DESC, rowid DESC LIMIT ? OFFSET ?`,
		append(append([]any{}, args...), limit, f.Offset)...)
	if err != nil {
		return res, fmt.Errorf("list transfers: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		t, err := scan(rows)
		if err != nil {
			return res, err
		}
		res.Items = append(res.Items, t)
	}
	return res, rows.Err()
}
