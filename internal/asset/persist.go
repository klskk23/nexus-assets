package asset

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/store"
	"time"
)

const assetCols = `id, sn, category_id, model_id, status, owner_id, holder_type, holder_id, attrs, version, created_at, updated_at`

func scanAsset(row interface{ Scan(...any) error }) (model.Asset, error) {
	var a model.Asset
	var modelID sql.NullString
	var attrs, created, updated string
	var holderType, holderID string
	if err := row.Scan(&a.ID, &a.SN, &a.CategoryID, &modelID, &a.Status, &a.OwnerID,
		&holderType, &holderID, &attrs, &a.Version, &created, &updated); err != nil {
		return a, err
	}
	a.ModelID = store.StrPtr(modelID)
	a.Holder = model.Holder{Type: model.HolderType(holderType), ID: holderID}
	var err error
	if a.Attrs, err = store.UnmarshalJSONMap(attrs); err != nil {
		return a, err
	}
	if a.CreatedAt, err = store.ParseTime(created); err != nil {
		return a, err
	}
	if a.UpdatedAt, err = store.ParseTime(updated); err != nil {
		return a, err
	}
	return a, nil
}

func loadForUpdate(ctx context.Context, tx *sql.Tx, id string) (model.Asset, error) {
	a, err := scanAsset(tx.QueryRowContext(ctx, `SELECT `+assetCols+` FROM assets WHERE id = ?`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return a, ErrNotFound
	}
	return a, err
}

// checkUnique enforces the uniqueness of every field marked unique, plus the
// serial number.
//
// A plain select-then-insert is safe here only because the surrounding
// transaction is BEGIN IMMEDIATE on a single-connection write pool: SQLite
// serialises writers, so no other transaction can slip a conflicting row in
// between the check and the insert. On a database without that guarantee this
// would have to become a database-level constraint.
func checkUnique(ctx context.Context, tx *sql.Tx, fields []model.BoundField, attrs map[string]any, sn, selfID string) error {
	var conflict string
	err := tx.QueryRowContext(ctx,
		`SELECT sn FROM assets WHERE sn = ? AND id != ? LIMIT 1`, sn, selfID).Scan(&conflict)
	if err == nil {
		return FieldErrors{"sn": fmt.Sprintf("编号 %s 已被占用", conflict)}
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return err
	}
	var histAsset string
	err = tx.QueryRowContext(ctx,
		`SELECT asset_id FROM asset_sn_history WHERE sn = ? AND asset_id != ? LIMIT 1`, sn, selfID).Scan(&histAsset)
	if err == nil {
		return FieldErrors{"sn": "该编号曾属于另一台设备，不能重复使用"}
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return err
	}

	for _, f := range fields {
		if !f.IsUnique {
			continue
		}
		v, ok := attrs[f.Key]
		if !ok || v == nil || v == "" {
			continue
		}
		var otherSN string
		q := `SELECT sn FROM assets WHERE json_extract(attrs, '$.' || ?) = ? AND id != ? LIMIT 1`
		err := tx.QueryRowContext(ctx, q, f.Key, fmt.Sprintf("%v", v), selfID).Scan(&otherSN)
		if err == nil {
			return FieldErrors{f.Key: fmt.Sprintf("该值已被资产 %s 占用", otherSN)}
		}
		if !errors.Is(err, sql.ErrNoRows) {
			return err
		}
	}
	return nil
}

// insertTransfer appends one immutable event.
func insertTransfer(ctx context.Context, tx *sql.Tx, assetID string, batchID *string,
	kind model.TransferKind, from *model.AssetState, to model.AssetState,
	note, actorID string, now time.Time) error {

	var fromStatus, fromHolderType, fromHolderID, fromOwner any
	if from != nil {
		fromStatus = string(from.Status)
		fromHolderType = string(from.Holder.Type)
		fromHolderID = from.Holder.ID
		fromOwner = from.OwnerID
	}
	_, err := tx.ExecContext(ctx,
		`INSERT INTO asset_transfers
		   (id, asset_id, batch_id, kind,
		    from_status, from_holder_type, from_holder_id, from_owner_id,
		    to_status, to_holder_type, to_holder_id, to_owner_id,
		    note, actor_id, created_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		store.NewID(), assetID, store.NullString(batchID), string(kind),
		fromStatus, fromHolderType, fromHolderID, fromOwner,
		string(to.Status), string(to.Holder.Type), to.Holder.ID, to.OwnerID,
		note, actorID, store.FormatTime(now))
	if err != nil {
		return fmt.Errorf("insert transfer: %w", err)
	}
	return nil
}
