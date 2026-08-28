package asset

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/klskk23/nexus-assets/internal/compute"
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
	Attrs      map[string]any
	Version    int // required for an update
	ActorID    string
	Note       string
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
	// expression key may read {{ .id }} -- which is the natural way to build a
	// short label out of the UUID now that there is no separate serial column.
	ID string
	// Unique holds the values that must not collide, keyed by field.
	Unique map[string]string
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
	bindings, err := s.schema.BindingsByCategory(ctx)
	if err != nil {
		return prep, err
	}
	// 1. effective field set
	fields, err := schema.Resolve(cat.Path, bindings)
	if err != nil {
		return prep, err
	}
	fields = schema.ActiveFields(fields)

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
	prep.Unique = uniqueValues(fields, clean)
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

		// 6. uniqueness: probe first so a collision can name the other device
		if err := probeUnique(ctx, tx, prep.Fields, prep.Unique, prep.ID); err != nil {
			return out, err
		}

		id := prep.ID

		attrsJSON, err := store.MarshalJSONMap(clean)
		if err != nil {
			return out, err
		}

		// 7. write, under an optimistic-lock guard on update
		if prev == nil {
			_, err = tx.ExecContext(ctx,
				`INSERT INTO assets (id, category_id, model_id, status, owner_id, holder_type, holder_id,
				                     attrs, version, created_at, updated_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
				id, in.CategoryID, store.NullString(in.ModelID), string(in.Status), in.OwnerID,
				string(in.Holder.Type), in.Holder.ID, attrsJSON,
				store.FormatTime(now), store.FormatTime(now))
			if err != nil {
				return out, err
			}
			out = model.Asset{
				ID: id, CategoryID: in.CategoryID, ModelID: in.ModelID,
				Status: in.Status, OwnerID: in.OwnerID, Holder: in.Holder,
				Attrs: clean, Version: 1, CreatedAt: now, UpdatedAt: now,
			}
		} else {
			res, err := tx.ExecContext(ctx,
				`UPDATE assets SET category_id = ?, model_id = ?, status = ?, owner_id = ?,
				                   holder_type = ?, holder_id = ?, attrs = ?, version = version + 1, updated_at = ?
				 WHERE id = ? AND version = ?`,
				in.CategoryID, store.NullString(in.ModelID), string(in.Status), in.OwnerID,
				string(in.Holder.Type), in.Holder.ID, attrsJSON, store.FormatTime(now), id, in.Version)
			if err != nil {
				return out, err
			}
			if n, _ := res.RowsAffected(); n == 0 {
				return out, ErrVersionConflict
			}
			out = model.Asset{
				ID: id, CategoryID: in.CategoryID, ModelID: in.ModelID,
				Status: in.Status, OwnerID: in.OwnerID, Holder: in.Holder,
				Attrs: clean, Version: in.Version + 1, CreatedAt: prev.CreatedAt, UpdatedAt: now,
			}
		}

		// 8. the reverse-lookup table, after the row exists so its foreign key
		// holds. The partial unique index is the real guarantee.
		if err := syncUniqueValues(ctx, tx, id, prep.Unique, now); err != nil {
			return out, err
		}

		out.DisplayName = model.AssetDisplayName(id, clean, prep.DisplayKey)

		// 9. transfer event, only when the state triple actually moved
		var from *model.AssetState
		if prev != nil {
			from = &model.AssetState{Status: prev.Status, Holder: prev.Holder, OwnerID: prev.OwnerID}
		}
		to := model.AssetState{Status: in.Status, Holder: in.Holder, OwnerID: in.OwnerID}
		if from != nil {
			if err := model.ValidateTransition(from.Status, to.Status); err != nil {
				return out, err
			}
		}
		kind, emit := model.DeriveTransferKind(from, to)
		if emit {
			if err := insertTransfer(ctx, tx, id, prep.Input.BatchID, kind, from, to, in.Note, in.ActorID, now); err != nil {
				return out, err
			}
		}
	}
	return out, nil
}

// evalComputed renders every computed field in dependency order.
func evalComputed(fields []model.BoundField, ctx compute.Context) (map[string]any, error) {
	deps := map[string][]string{}
	tmplByKey := map[string]string{}
	for _, f := range fields {
		if f.Type != model.FieldComputed {
			continue
		}
		t, err := compute.Parse(f.Key, f.Options.Template)
		if err != nil {
			return nil, FieldErrors{f.Key: err.Error()}
		}
		tmplByKey[f.Key] = f.Options.Template
		deps[f.Key] = compute.AttrReferences(t.Tree.Root)
	}
	if len(deps) == 0 {
		return nil, nil
	}
	order, err := compute.TopoSort(deps)
	if err != nil {
		return nil, FieldErrors{"_computed": err.Error()}
	}

	attrs, _ := ctx["attrs"].(map[string]any)
	out := map[string]any{}
	for _, key := range order {
		v, err := compute.Eval(key, tmplByKey[key], ctx)
		if err != nil {
			return nil, FieldErrors{key: fmt.Sprintf("计算失败：%v", err)}
		}
		out[key] = v
		attrs[key] = v // later fields may read this one
	}
	return out, nil
}
