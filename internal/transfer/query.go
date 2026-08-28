package transfer

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

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
