// Package transfer records every change of possession, ownership or status.
//
// A transfer is an action, not an edit of the asset row: it is the thing the
// ledger exists to remember. The asset's status/holder/owner triple is a
// materialised snapshot of the newest event, written in the same transaction so
// the two cannot drift apart.
package transfer

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/klskk23/nexus-assets/internal/holder"
	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/store"
)

// Sentinel errors the HTTP layer maps onto error codes.
var (
	ErrNotFound         = errors.New("transfer not found")
	ErrAssetNotFound    = errors.New("asset not found")
	ErrNotTailEvent     = errors.New("only the newest event of an asset can be edited")
	ErrNoDefaultStock   = errors.New("no default stock point is set; choose a location to return to")
	ErrHolderRequired   = errors.New("a transfer needs a destination")
	ErrBatchPartialEdit = errors.New("a batch event can only be edited as a whole")
)

// Service performs transfers.
type Service struct {
	db      *store.Store
	holders *holder.Store
}

// New builds the transfer service.
func New(db *store.Store, holders *holder.Store) *Service {
	return &Service{db: db, holders: holders}
}

// Request describes one transfer, applied to one or many assets.
//
// Every destination field is optional: an unset field keeps whatever the asset
// already has. That is what lets one form express "hand these to Zhang",
// "put these back in the warehouse" and "change who is responsible" without
// three different endpoints.
type Request struct {
	AssetIDs  []string
	ToStatus  *model.AssetStatus
	ToHolder  *model.Holder
	ToOwnerID *string
	Note      string
	DueAt     *time.Time
	ActorID   string
	// CheckIn asks for the default stock point when no holder is given.
	CheckIn bool
}

// Result is what one call produced.
type Result struct {
	BatchID   *string          `json:"batch_id"`
	Transfers []model.Transfer `json:"transfers"`
}

// Apply performs the transfer for every asset in one transaction.
//
// All of them move together or none does: a partially applied batch would leave
// the operator unable to tell which twenty devices actually shipped.
func (s *Service) Apply(ctx context.Context, req Request) (Result, error) {
	var res Result
	if len(req.AssetIDs) == 0 {
		return res, fmt.Errorf("no assets given")
	}

	// Resolving the default stock point needs a read, so do it before the
	// write transaction takes the exclusive lock.
	if req.CheckIn && req.ToHolder == nil {
		def, ok, err := s.holders.DefaultStock(ctx)
		if err != nil {
			return res, err
		}
		if !ok {
			return res, ErrNoDefaultStock
		}
		req.ToHolder = &model.Holder{Type: model.HolderTypeEntity, ID: def.ID}
	}

	// A batch id only makes sense when there is a batch to identify.
	var batchID *string
	if len(req.AssetIDs) > 1 {
		id := store.NewID()
		batchID = &id
	}

	now := time.Now().UTC()
	err := s.db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		res.Transfers = res.Transfers[:0]
		for _, assetID := range req.AssetIDs {
			t, err := applyOne(ctx, tx, assetID, req, batchID, now)
			if err != nil {
				return err
			}
			if t != nil {
				res.Transfers = append(res.Transfers, *t)
			}
		}
		return nil
	})
	if err != nil {
		return Result{}, err
	}
	res.BatchID = batchID
	return res, nil
}

func applyOne(ctx context.Context, tx *sql.Tx, assetID string, req Request,
	batchID *string, now time.Time) (*model.Transfer, error) {

	var from model.AssetState
	var version int
	err := tx.QueryRowContext(ctx,
		`SELECT status, holder_type, holder_id, owner_id, version FROM assets WHERE id = ?`, assetID).
		Scan(&from.Status, &from.Holder.Type, &from.Holder.ID, &from.OwnerID, &version)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, fmt.Errorf("%w: %s", ErrAssetNotFound, assetID)
	}
	if err != nil {
		return nil, err
	}

	to := from
	if req.ToStatus != nil {
		to.Status = *req.ToStatus
	}
	if req.ToHolder != nil {
		to.Holder = *req.ToHolder
	}
	if req.ToOwnerID != nil {
		to.OwnerID = *req.ToOwnerID
	}

	if err := model.ValidateTransition(from.Status, to.Status); err != nil {
		return nil, err
	}

	kind, emit := model.DeriveTransferKind(&from, to)
	if !emit {
		// Nothing in the triple moved. Recording it would put a line in the
		// timeline that says nothing happened.
		return nil, nil
	}

	if err := checkHolderForStatus(ctx, tx, to); err != nil {
		return nil, err
	}

	id := store.NewID()
	_, err = tx.ExecContext(ctx,
		`INSERT INTO asset_transfers
		   (id, asset_id, batch_id, kind,
		    from_status, from_holder_type, from_holder_id, from_owner_id,
		    to_status, to_holder_type, to_holder_id, to_owner_id,
		    note, due_at, actor_id, created_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		id, assetID, store.NullString(batchID), string(kind),
		string(from.Status), string(from.Holder.Type), from.Holder.ID, from.OwnerID,
		string(to.Status), string(to.Holder.Type), to.Holder.ID, to.OwnerID,
		req.Note, store.NullTime(req.DueAt), req.ActorID, store.FormatTime(now))
	if err != nil {
		return nil, fmt.Errorf("insert transfer: %w", err)
	}

	if _, err := tx.ExecContext(ctx,
		`UPDATE assets SET status = ?, holder_type = ?, holder_id = ?, owner_id = ?,
		                   version = version + 1, updated_at = ?
		 WHERE id = ?`,
		string(to.Status), string(to.Holder.Type), to.Holder.ID, to.OwnerID,
		store.FormatTime(now), assetID); err != nil {
		return nil, fmt.Errorf("update asset snapshot: %w", err)
	}

	fromStatus := from.Status
	fromHolder := from.Holder
	fromOwner := from.OwnerID
	return &model.Transfer{
		ID: id, AssetID: assetID, BatchID: batchID, Kind: kind,
		FromStatus: &fromStatus, FromHolder: &fromHolder, FromOwner: &fromOwner,
		ToStatus: to.Status, ToHolder: to.Holder, ToOwner: to.OwnerID,
		Note: req.Note, DueAt: req.DueAt, ActorID: req.ActorID, CreatedAt: now,
	}, nil
}

// checkHolderForStatus enforces the in_stock coupling inside the transaction,
// where the holder's type can be read consistently.
func checkHolderForStatus(ctx context.Context, tx *sql.Tx, to model.AssetState) error {
	if !model.RequiresLocationHolder(to.Status) {
		return nil
	}
	if to.Holder.Type != model.HolderTypeEntity {
		return fmt.Errorf("在库状态的持有方必须是一个位置")
	}
	var typ string
	if err := tx.QueryRowContext(ctx,
		`SELECT type FROM holder_entities WHERE id = ?`, to.Holder.ID).Scan(&typ); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return fmt.Errorf("%w: %s", holder.ErrNotFound, to.Holder.ID)
		}
		return err
	}
	if model.EntityType(typ) != model.EntityLocation {
		return fmt.Errorf("在库状态的持有方必须是一个位置")
	}
	return nil
}
