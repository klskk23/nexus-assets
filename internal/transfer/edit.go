package transfer

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/store"
)

// EditRequest carries the corrections to one event.
type EditRequest struct {
	ToStatus  *model.AssetStatus
	ToHolder  *model.Holder
	ToOwnerID *string
	Note      *string
	EditorID  string
}

// Edit corrects a transfer that is still the newest event of its asset.
//
// The window closes as soon as the asset gets another event -- no timer to
// reason about, and the edited row is always the tail, so refreshing the
// asset's snapshot is just copying the new to_* values rather than replaying
// the history. The original is kept alongside edited_at and edited_by: without
// that trace the immutable-event-log decision would buy nothing.
//
// A batch event is edited as a whole. Correcting one member would leave the
// batch describing two different things at once.
func (s *Service) Edit(ctx context.Context, id string, req EditRequest) ([]model.Transfer, error) {
	var out []model.Transfer
	now := time.Now().UTC()

	err := s.db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		target, err := scan(tx.QueryRowContext(ctx, `SELECT `+cols+` FROM asset_transfers WHERE id = ?`, id))
		if errors.Is(err, sql.ErrNoRows) {
			return ErrNotFound
		}
		if err != nil {
			return err
		}

		ids := []string{target.ID}
		if target.BatchID != nil {
			ids, err = batchMembers(ctx, tx, *target.BatchID)
			if err != nil {
				return err
			}
		}

		statuses, err := store.LoadStatusSet(ctx, tx)
		if err != nil {
			return err
		}

		out = out[:0]
		for _, eventID := range ids {
			edited, err := editOne(ctx, tx, statuses, eventID, req, now)
			if err != nil {
				return err
			}
			out = append(out, edited)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return out, nil
}

func batchMembers(ctx context.Context, tx *sql.Tx, batchID string) ([]string, error) {
	rows, err := tx.QueryContext(ctx,
		`SELECT id FROM asset_transfers WHERE batch_id = ? ORDER BY rowid`, batchID)
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

func editOne(ctx context.Context, tx *sql.Tx, statuses model.StatusSet, id string,
	req EditRequest, now time.Time) (model.Transfer, error) {

	cur, err := scan(tx.QueryRowContext(ctx, `SELECT `+cols+` FROM asset_transfers WHERE id = ?`, id))
	if err != nil {
		return cur, err
	}

	var tailID string
	err = tx.QueryRowContext(ctx,
		`SELECT id FROM asset_transfers WHERE asset_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1`,
		cur.AssetID).Scan(&tailID)
	if err != nil {
		return cur, err
	}
	if tailID != id {
		return cur, fmt.Errorf("%w (asset %s)", ErrNotTailEvent, cur.AssetID)
	}

	// The trace is written from the values as they stand before the edit.
	original, err := json.Marshal(map[string]any{
		"to_status":      cur.ToStatus,
		"to_holder_type": cur.ToHolder.Type,
		"to_holder_id":   cur.ToHolder.ID,
		"to_owner_id":    cur.ToOwner,
		"note":           cur.Note,
	})
	if err != nil {
		return cur, err
	}

	if req.ToStatus != nil {
		cur.ToStatus = *req.ToStatus
	}
	if req.ToHolder != nil {
		cur.ToHolder = *req.ToHolder
	}
	if req.ToOwnerID != nil {
		cur.ToOwner = *req.ToOwnerID
	}
	if req.Note != nil {
		cur.Note = *req.Note
	}

	if cur.FromStatus != nil {
		if err := statuses.ValidateTransition(*cur.FromStatus, cur.ToStatus); err != nil {
			return cur, err
		}
	}
	if err := checkHolderForStatus(ctx, tx, statuses, model.AssetState{
		Status: cur.ToStatus, Holder: cur.ToHolder, OwnerID: cur.ToOwner,
	}); err != nil {
		return cur, err
	}

	// Only keep the first correction's original; a second edit must not erase
	// what the event said when it was first written.
	keepOriginal := `CASE WHEN original IS NULL THEN ? ELSE original END`
	if _, err := tx.ExecContext(ctx,
		`UPDATE asset_transfers
		 SET to_status = ?, to_holder_type = ?, to_holder_id = ?, to_owner_id = ?, note = ?,
		     edited_at = ?, edited_by = ?, original = `+keepOriginal+`
		 WHERE id = ?`,
		string(cur.ToStatus), string(cur.ToHolder.Type), cur.ToHolder.ID, cur.ToOwner, cur.Note,
		store.FormatTime(now), req.EditorID, string(original), id); err != nil {
		return cur, fmt.Errorf("update transfer: %w", err)
	}

	// The edited event is the tail, so the snapshot is simply its new to_*.
	if _, err := tx.ExecContext(ctx,
		`UPDATE assets SET status = ?, holder_type = ?, holder_id = ?, owner_id = ?,
		                   version = version + 1, updated_at = ?
		 WHERE id = ?`,
		string(cur.ToStatus), string(cur.ToHolder.Type), cur.ToHolder.ID, cur.ToOwner,
		store.FormatTime(now), cur.AssetID); err != nil {
		return cur, fmt.Errorf("refresh asset snapshot: %w", err)
	}

	cur.EditedAt = &now
	editor := req.EditorID
	cur.EditedBy = &editor
	return cur, nil
}
