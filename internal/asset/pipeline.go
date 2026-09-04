package asset

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/klskk23/nexus-assets/internal/compute"
	"github.com/klskk23/nexus-assets/internal/i18n"
	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/schema"
	"github.com/klskk23/nexus-assets/internal/store"
)

// Sentinel errors the HTTP layer maps onto error codes.
var (
	ErrNotFound        = errors.New("asset not found")
	ErrVersionConflict = errors.New("asset was modified by someone else")
	ErrUniqueConflict  = errors.New("value already in use")
)

// SaveInput is what a caller supplies for a create or an update.
type SaveInput struct {
	ID         string // empty for a create
	CategoryID string
	ModelID    *string
	Status     model.AssetStatus
	OwnerID    string
	Holder     model.Holder
	// Home is where the device belongs when it is not out. Unset on a create
	// means "wherever it is being recorded" -- the place it just arrived at is
	// the obvious answer, and asking again on the form would be noise.
	// Unset on an update means "leave it alone".
	HomeHolder  *model.Holder
	HomeOwnerID *string
	// ClearHome unsets the home, restoring "use the global default stock
	// point". Distinct from HomeHolder being nil, which means "no change".
	ClearHome bool
	Attrs     map[string]any
	Version   int // required for an update
	ActorID   string
	// Note explains the movement this save records, and goes on the transfer
	// row. It is not the device's own note -- that is AssetNote, which
	// describes the thing rather than the event.
	Note string
	// AssetNote is the device's own note. Absent means "leave it alone", which
	// is what lets a transfer or an attribute edit go through without carrying
	// a copy of it.
	AssetNote *string
	// BatchID groups the create events of one import so the file can be
	// identified afterwards.
	BatchID *string
}

// Service runs the save pipeline.
type Service struct {
	db     *store.Store
	schema *schema.Store
}

// NewService builds the pipeline service.
func NewService(db *store.Store, sch *schema.Store) *Service {
	return &Service{db: db, schema: sch}
}

// Save runs every stage in the fixed order and writes the result.
//
// The order is not negotiable and is spelled out in data-model.md:
//
//	1 resolve the effective field set from the category chain
//	2 merge model defaults into missing keys
//	3 normalise format-typed values      <- must precede step 6
//	4 validate types, required and regex
//	5 evaluate expression keys in topological order
//	6 probe uniqueness so a collision can name the other device
//	7 write with an optimistic-lock guard
//	8 sync the unique-value table, archiving values that changed
//	9 emit a transfer event when the state triple moved
//
// Normalisation still has to precede the uniqueness stages: without it
// "AA:BB:CC" and "aa-bb-cc" are two different strings and the same MAC gets in
// twice.
func (s *Service) Save(ctx context.Context, in SaveInput) (model.Asset, error) {
	prep, err := s.Prepare(ctx, in)
	if err != nil {
		return model.Asset{}, err
	}
	var out model.Asset
	err = s.db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		out, err = s.Persist(ctx, tx, prep)
		return err
	})
	if err != nil {
		return model.Asset{}, err
	}
	return out, nil
}

// Prepared is everything the read-only stages produced, ready to be written.
type Prepared struct {
	Input  SaveInput
	Fields []model.BoundField
	Attrs  map[string]any
	// ID is the asset id, allocated here rather than at write time so an
	// expression key may read id -- which is the natural way to build a
	// short label out of the UUID now that there is no separate serial column.
	ID string
	// Unique holds the values that must not collide, keyed by field, each with
	// the category subtree it must not collide inside.
	Unique map[string]UniqueValue
	// DisplayKey is the category's nominated identifier, carried through so
	// the created asset can be handed back already named.
	DisplayKey string
}

// Prepare runs stages 1 through 5: resolve the field set, merge model defaults,
// normalise, validate and evaluate the expression keys.
//
// Nothing here touches the write pool, so a caller can prepare many rows before
// opening a single transaction to write them.
func (s *Service) Prepare(ctx context.Context, in SaveInput) (Prepared, error) {
	var prep Prepared
	prep.Input = in
	prep.ID = in.ID
	if prep.ID == "" {
		prep.ID = store.NewID()
	}

	cat, err := s.schema.GetCategory(ctx, in.CategoryID)
	if err != nil {
		return prep, err
	}
	// 1. effective field set, narrowed to this device's model.
	//
	// The category's set is its whole vocabulary; a model-bound field belongs
	// to this asset only when its model is one the field was bound to (015).
	// Narrowing here is what keeps validation, computed keys and uniqueness
	// all talking about the same fields.
	all, err := s.schema.FieldsOfPath(ctx, cat.Path)
	if err != nil {
		return prep, err
	}
	fields := schema.ActiveFields(schema.ForModel(all, in.ModelID))

	// 2. model defaults fill only the keys the caller left out
	attrs := map[string]any{}
	for k, v := range in.Attrs {
		attrs[k] = v
	}
	var modelName, modelVendor string
	if in.ModelID != nil {
		pm, err := s.schema.GetModel(ctx, *in.ModelID)
		if err != nil {
			return prep, err
		}
		modelName, modelVendor = pm.Name, pm.Vendor
		for k, v := range pm.AttrDefaults {
			if _, present := attrs[k]; !present {
				attrs[k] = v
			}
		}
	}

	// 3 + 4. normalise then validate
	clean, ferrs := ValidateAttrs(fields, attrs)
	if ferrs.Any() {
		return prep, ferrs
	}

	// 5. expression keys, in dependency order
	ctxData := compute.NewContext(prep.ID, clean, cat.Code, cat.Name, modelName, modelVendor)
	computedValues, err := evalComputed(fields, ctxData)
	if err != nil {
		return prep, err
	}
	for k, v := range computedValues {
		clean[k] = v
	}

	prep.Fields, prep.Attrs = fields, clean
	prep.Unique = uniqueValues(fields, clean, in.CategoryID)
	prep.DisplayKey = cat.DisplayKey
	return prep, nil
}

// Persist runs stages 6 through 9 inside a caller-supplied transaction: the
// uniqueness probe, the optimistic-lock write, the unique-value sync and the
// transfer event.
//
// Taking the transaction as a parameter is what lets the importer write a whole
// file as one unit -- and, because the uniqueness check runs against the same
// transaction, a MAC repeated twice inside one file is caught just like a
// collision with an existing row.
func (s *Service) Persist(ctx context.Context, tx *sql.Tx, prep Prepared) (model.Asset, error) {
	in, clean := prep.Input, prep.Attrs
	var out model.Asset
	now := time.Now().UTC()

	{
		var prev *model.Asset
		if in.ID != "" {
			p, err := loadForUpdate(ctx, tx, in.ID)
			if err != nil {
				return out, err
			}
			prev = &p
		}

		// Values whose field has since left the category are carried over
		// untouched. ValidateAttrs rebuilds attrs from the effective field set,
		// so without this an ordinary edit would silently drop them -- and
		// unbinding is the only way to retire a field that assets already hold
		// values for, which makes "the data is kept" the whole point of it.
		if prev != nil {
			clean = carryOrphans(prep.Fields, prev.Attrs, clean)
		}

		// 6. uniqueness: probe first so a collision can name the other device
		if err := probeUnique(ctx, tx, prep.Fields, prep.Unique, prep.ID); err != nil {
			return out, err
		}

		id := prep.ID

		attrsJSON, err := store.MarshalJSONMap(clean)
		if err != nil {
			return out, err
		}

		// Absent means "leave it alone", so an edit that never mentions the
		// note -- a transfer, an attribute change -- cannot blank it.
		note := ""
		if prev != nil {
			note = prev.Note
		}
		if in.AssetNote != nil {
			note = *in.AssetNote
		}

		h := resolveHome(prev, in)
		home, homeOwner := h.created, h.createdOwner
		homeHolder, homeOwnerPtr := h.holder, h.ownerID
		homeType, homeID := h.holderType, h.holderID

		// 7. write, under an optimistic-lock guard on update
		if prev == nil {
			_, err = tx.ExecContext(ctx,
				`INSERT INTO assets (id, category_id, model_id, status, owner_id, holder_type, holder_id,
				                     home_holder_type, home_holder_id, home_owner_id,
				                     attrs, note, version, created_at, updated_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
				id, in.CategoryID, store.NullString(in.ModelID), string(in.Status), in.OwnerID,
				string(in.Holder.Type), in.Holder.ID,
				string(home.Type), home.ID, homeOwner, attrsJSON, note,
				store.FormatTime(now), store.FormatTime(now))
			if err != nil {
				return out, err
			}
			out = model.Asset{
				ID: id, CategoryID: in.CategoryID, ModelID: in.ModelID,
				Status: in.Status, OwnerID: in.OwnerID, Holder: in.Holder,
				HomeHolder: &home, HomeOwnerID: &homeOwner,
				Attrs: clean, Note: note, Version: 1, CreatedAt: now, UpdatedAt: now,
			}
		} else {
			res, err := tx.ExecContext(ctx,
				`UPDATE assets SET category_id = ?, model_id = ?, status = ?, owner_id = ?,
				                   holder_type = ?, holder_id = ?,
				                   home_holder_type = ?, home_holder_id = ?, home_owner_id = ?,
				                   attrs = ?, note = ?, version = version + 1, updated_at = ?
				 WHERE id = ? AND version = ?`,
				in.CategoryID, store.NullString(in.ModelID), string(in.Status), in.OwnerID,
				string(in.Holder.Type), in.Holder.ID,
				store.NullString(homeType), store.NullString(homeID), store.NullString(homeOwnerPtr),
				attrsJSON, note, store.FormatTime(now), id, in.Version)
			if err != nil {
				return out, err
			}
			if n, _ := res.RowsAffected(); n == 0 {
				return out, ErrVersionConflict
			}
			out = model.Asset{
				ID: id, CategoryID: in.CategoryID, ModelID: in.ModelID,
				Status: in.Status, OwnerID: in.OwnerID, Holder: in.Holder,
				HomeHolder: homeHolder, HomeOwnerID: homeOwnerPtr,
				Attrs: clean, Note: note, Version: in.Version + 1,
				CreatedAt: prev.CreatedAt, UpdatedAt: now,
			}
		}

		// 8. the reverse-lookup table, after the row exists so its foreign key
		// holds. The partial unique index is the real guarantee.
		if err := syncUniqueValues(ctx, tx, id, prep.Unique, now); err != nil {
			return out, err
		}

		out.DisplayName = model.AssetDisplayName(id, clean, prep.DisplayKey)

		// 9. transfer event, only when the state triple actually moved
		if err := recordMove(ctx, tx, id, prep, prev, now); err != nil {
			return out, err
		}
	}
	return out, nil
}

// evalComputed renders every computed field in dependency order.
func evalComputed(fields []model.BoundField, ctx compute.Context) (map[string]any, error) {
	deps := map[string][]string{}
	// Compiled once and kept: recompute runs these across a whole subtree, and
	// parsing per asset would be the same work thousands of times.
	progByKey := map[string]*compute.Program{}
	for _, f := range fields {
		if f.Type != model.FieldComputed {
			continue
		}
		p, err := compute.Parse(f.Key, f.Options.Template)
		if err != nil {
			return nil, FieldErrors{f.Key: asMessage(err)}
		}
		progByKey[f.Key] = p
		deps[f.Key] = p.AttrReferences()
	}
	if len(deps) == 0 {
		return nil, nil
	}
	order, err := compute.TopoSort(deps)
	if err != nil {
		return nil, FieldErrors{"_computed": asMessage(err)}
	}

	attrs, _ := ctx["attrs"].(map[string]any)
	out := map[string]any{}
	for _, key := range order {
		v, err := progByKey[key].Run(ctx)
		if err != nil {
			return nil, FieldErrors{key: i18n.M(i18n.KeyFieldComputeFail, err)}
		}
		out[key] = v
		attrs[key] = v // later fields may read this one
	}
	return out, nil
}

// carryOrphans copies across the stored keys that no longer belong to the
// category's field set.
//
// They are kept exactly as they were: never validated, never normalised, never
// part of a uniqueness check. The category stopped asking for them, but what
// somebody recorded is still what happened.
func carryOrphans(fields []model.BoundField, prev, next map[string]any) map[string]any {
	live := make(map[string]bool, len(fields))
	for _, f := range fields {
		live[f.Key] = true
	}
	for k, v := range prev {
		if !live[k] {
			if _, taken := next[k]; !taken {
				next[k] = v
			}
		}
	}
	return next
}

// homeColumns is where a device belongs when it is not out, in the three
// shapes the write needs: the values a create stores, and the nullable columns
// an update stores.
type homeColumns struct {
	created      model.Holder
	createdOwner string

	holder               *model.Holder
	ownerID              *string
	holderType, holderID *string
}

// resolveHome works out those three columns for this save.
//
// On a create: whatever was named, else where the device is being recorded. It
// has just arrived somewhere, and that somewhere is the obvious answer --
// asking again on the form would be one more question with a foregone
// conclusion.
//
// On an update they are tri-state: named, cleared, or left alone. Absent means
// "do not touch", which is why an unmentioned home survives an ordinary edit.
func resolveHome(prev *model.Asset, in SaveInput) homeColumns {
	var h homeColumns

	h.created = in.Holder
	if in.HomeHolder != nil {
		h.created = *in.HomeHolder
	}
	h.createdOwner = in.OwnerID
	if in.HomeOwnerID != nil {
		h.createdOwner = *in.HomeOwnerID
	}

	if prev == nil || in.ClearHome {
		return h
	}
	h.holder, h.ownerID = prev.HomeHolder, prev.HomeOwnerID
	if in.HomeHolder != nil {
		h.holder = in.HomeHolder
	}
	if in.HomeOwnerID != nil {
		h.ownerID = in.HomeOwnerID
	}
	if h.holder != nil {
		t, i := string(h.holder.Type), h.holder.ID
		h.holderType, h.holderID = &t, &i
	}
	return h
}

// recordMove writes a transfer row when the state triple actually moved.
//
// The transition is checked against the statuses as this transaction sees them,
// not as the pool saw them a moment ago: a status deleted between the two reads
// would otherwise let a move through that the rules forbid.
func recordMove(ctx context.Context, tx *sql.Tx, id string, prep Prepared,
	prev *model.Asset, now time.Time) error {
	in := prep.Input

	var from *model.AssetState
	if prev != nil {
		from = &model.AssetState{Status: prev.Status, Holder: prev.Holder, OwnerID: prev.OwnerID}
	}
	to := model.AssetState{Status: in.Status, Holder: in.Holder, OwnerID: in.OwnerID}

	if from != nil {
		statuses, err := store.LoadStatusSet(ctx, tx)
		if err != nil {
			return err
		}
		if err := statuses.ValidateTransition(from.Status, to.Status); err != nil {
			return err
		}
	}
	kind, emit := model.DeriveTransferKind(from, to)
	if !emit {
		return nil
	}
	return insertTransfer(ctx, tx, id, in.BatchID, kind, from, to, in.Note, in.ActorID, now)
}
