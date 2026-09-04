package asset

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/klskk23/nexus-assets/internal/i18n"
	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/store"
)

const assetCols = `id, category_id, model_id, status, owner_id, holder_type, holder_id,
	home_holder_type, home_holder_id, home_owner_id, attrs, note, version, created_at, updated_at`

func scanAsset(row interface{ Scan(...any) error }) (model.Asset, error) {
	var a model.Asset
	var modelID, homeType, homeID, homeOwner sql.NullString
	var attrs, created, updated string
	var holderType, holderID string
	if err := row.Scan(&a.ID, &a.CategoryID, &modelID, &a.Status, &a.OwnerID,
		&holderType, &holderID, &homeType, &homeID, &homeOwner,
		&attrs, &a.Note, &a.Version, &created, &updated); err != nil {
		return a, err
	}
	a.ModelID = store.StrPtr(modelID)
	a.Holder = model.Holder{Type: model.HolderType(holderType), ID: holderID}
	// Both halves or neither: a home holder with no id would be a shape the
	// rest of the code has to keep checking for.
	if homeType.Valid && homeID.Valid {
		a.HomeHolder = &model.Holder{Type: model.HolderType(homeType.String), ID: homeID.String}
	}
	a.HomeOwnerID = store.StrPtr(homeOwner)
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

// UniqueValue is one value that must not collide, and where it must not.
//
// Scope is where the field reaches, which is exactly where its uniqueness
// reaches. For a category-bound field that is the category the binding was made
// on: the field exists across that category's subtree and nowhere else, so two
// categories may each have a "rack" that counts from one.
//
// For a model-bound field it is "f:" plus the field's own id (015, decision
// 99). The reach there is every model the field is bound to, and a field has
// exactly one set of those -- so the field itself names the scope. Scoping per
// model instead would let two Dell models each hold a device with service tag
// ABC1234, and those tags are unique across Dell's whole catalogue.
type UniqueValue struct {
	Value string
	Scope string
}

// ModelScopePrefix marks a scope that belongs to a field's model bindings
// rather than to a category. Both are ids; without the prefix, anyone reading
// asset_unique_values has to guess which kind they are looking at.
const ModelScopePrefix = "f:"

// uniqueValues extracts the values that must not collide, keyed by field.
//
// An empty value never occupies a slot: half the devices in a batch may not
// have their optional asset tag filled in yet, and they must not all collide
// with each other on the empty string.
func uniqueValues(fields []model.BoundField, attrs map[string]any, categoryID string) map[string]UniqueValue {
	out := map[string]UniqueValue{}
	for _, f := range fields {
		if !f.IsUnique {
			continue
		}
		v, ok := attrs[f.Key]
		if !ok || v == nil {
			continue
		}
		s := strings.TrimSpace(fmt.Sprintf("%v", v))
		if s == "" {
			continue
		}
		out[f.Key] = UniqueValue{Value: s, Scope: uniqueScope(f, categoryID)}
	}
	return out
}

// uniqueScope is where one field's uniqueness reaches.
//
// A model-bound field is scoped by itself, because its reach is its own set of
// models. A category-bound one is scoped by the category that bound it --
// InheritedFrom when it came from an ancestor, otherwise the category being
// saved into.
func uniqueScope(f model.BoundField, categoryID string) string {
	if len(f.ModelIDs) > 0 {
		return ModelScopePrefix + f.ID
	}
	if f.InheritedFrom != "" {
		return f.InheritedFrom
	}
	return categoryID
}

// probeUnique looks for a colliding live value so the error can name the device
// holding it, and the field worth correcting.
//
// The partial unique index on asset_unique_values is what actually guarantees
// uniqueness; this pass exists purely to turn a constraint violation into a
// message someone can act on. Because the guarantee no longer depends on the
// select-then-insert window, the single-connection write pool is now a
// performance choice rather than a correctness requirement.
func probeUnique(ctx context.Context, tx *sql.Tx, fields []model.BoundField,
	want map[string]UniqueValue, selfID string) error {

	// Static keys are probed before expression keys. When a duplicate MAC also
	// collides on the number derived from it, both are real conflicts, but only
	// the MAC is a field the person can go and correct -- reporting the derived
	// key instead sends them looking for something they cannot edit.
	var keys []string
	for _, pass := range []bool{false, true} {
		for _, f := range fields {
			if _, ok := want[f.Key]; !ok {
				continue
			}
			if (f.Type == model.FieldComputed) == pass {
				keys = append(keys, f.Key)
			}
		}
	}
	for _, k := range keys {
		var otherID string
		err := tx.QueryRowContext(ctx,
			`SELECT asset_id FROM asset_unique_values
			 WHERE scope_id = ? AND field_key = ? AND value = ? AND archived_at IS NULL
			   AND asset_id != ? LIMIT 1`,
			want[k].Scope, k, want[k].Value, selfID).Scan(&otherID)
		if err == nil {
			return FieldErrors{k: i18n.M(i18n.KeyFieldValueTaken, describeAsset(ctx, tx, otherID))}
		}
		if !errors.Is(err, sql.ErrNoRows) {
			return err
		}
	}
	return nil
}

// syncUniqueValues brings the reverse-lookup table in line with what was just
// written, archiving the values that changed.
//
// Archived rows drop out of the partial index, so a replaced value stops
// occupying its slot while staying searchable. That is deliberate: a device
// that had its mainboard swapped legitimately hands its old MAC to whoever
// receives the old board, and the scanner should still find the history.
func syncUniqueValues(ctx context.Context, tx *sql.Tx, assetID string,
	want map[string]UniqueValue, now time.Time) error {

	rows, err := tx.QueryContext(ctx,
		`SELECT field_key, value, scope_id FROM asset_unique_values
		 WHERE asset_id = ? AND archived_at IS NULL`, assetID)
	if err != nil {
		return fmt.Errorf("load unique values: %w", err)
	}
	live := map[string]UniqueValue{}
	for rows.Next() {
		var k string
		var uv UniqueValue
		if err := rows.Scan(&k, &uv.Value, &uv.Scope); err != nil {
			rows.Close()
			return err
		}
		live[k] = uv
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}

	for k, uv := range live {
		if want[k] == uv {
			continue
		}
		if _, err := tx.ExecContext(ctx,
			`UPDATE asset_unique_values SET archived_at = ?
			 WHERE asset_id = ? AND field_key = ? AND value = ? AND archived_at IS NULL`,
			store.FormatTime(now), assetID, k, uv.Value); err != nil {
			return fmt.Errorf("archive unique value: %w", err)
		}
	}

	keys := make([]string, 0, len(want))
	for k := range want {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, k := range keys {
		if live[k] == want[k] {
			continue
		}
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO asset_unique_values (asset_id, field_key, value, scope_id, created_at)
			 VALUES (?, ?, ?, ?, ?)`,
			assetID, k, want[k].Value, want[k].Scope, store.FormatTime(now)); err != nil {
			// The probe should have caught this; reaching here means a
			// collision the probe could not see, so report it as one.
			return FieldErrors{k: i18n.M(i18n.KeyFieldValuesTaken, err)}
		}
	}
	return nil
}

// describeAsset renders another asset the way a person would refer to it.
func describeAsset(ctx context.Context, tx *sql.Tx, id string) string {
	var attrs, displayKey string
	err := tx.QueryRowContext(ctx,
		`SELECT a.attrs, coalesce(c.display_key, '')
		 FROM assets a JOIN categories c ON c.id = a.category_id WHERE a.id = ?`, id).Scan(&attrs, &displayKey)
	if err != nil {
		return model.ShortID(id)
	}
	m, err := store.UnmarshalJSONMap(attrs)
	if err != nil {
		return model.ShortID(id)
	}
	return model.AssetDisplayName(id, m, displayKey)
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
