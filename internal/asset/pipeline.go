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
//	1  resolve the effective field set from the category chain
//	2  merge model defaults into missing keys
//	3  normalise format-typed values      <- must precede step 6
//	4  validate types, required and regex
//	5  evaluate computed fields in topological order
//	6  evaluate the serial number
//	7  check uniqueness inside the transaction
//	8  archive the previous serial number when it changed
//	9  write with an optimistic-lock guard
//	10 emit a transfer event when the state triple moved
//
// Everything happens inside one BEGIN IMMEDIATE transaction, which is what
// makes the select-then-insert uniqueness check in step 7 safe.
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
	SN     string
}

// Prepare runs stages 1 through 6: resolve the field set, merge model defaults,
// normalise, validate, evaluate computed fields and derive the serial number.
//
// Nothing here touches the write pool, so a caller can prepare many rows before
// opening a single transaction to write them.
func (s *Service) Prepare(ctx context.Context, in SaveInput) (Prepared, error) {
	var prep Prepared
	prep.Input = in

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

	// 5. computed fields, in dependency order
	ctxData := compute.NewContext(in.ID, clean, cat.Code, cat.Name, modelName, modelVendor)
	computedValues, err := evalComputed(fields, ctxData)
	if err != nil {
		return prep, err
	}
	for k, v := range computedValues {
		clean[k] = v
	}

	// 6. serial number, from the nearest ancestor that defines a template
	templates, err := s.schema.SNTemplates(ctx)
	if err != nil {
		return prep, err
	}
	tmpl, _ := schema.ResolveSNTemplate(cat.Path, templates)
	if tmpl == "" {
		return prep, FieldErrors{"sn": "该类别及其上级都没有配置编号生成规则"}
	}
	ctxData = compute.NewContext(in.ID, clean, cat.Code, cat.Name, modelName, modelVendor)
	sn, err := compute.Eval("sn", tmpl, ctxData)
	if err != nil {
		return prep, FieldErrors{"sn": fmt.Sprintf("编号生成失败：%v", err)}
	}

	prep.Fields, prep.Attrs, prep.SN = fields, clean, sn
	return prep, nil
}

// Persist runs stages 7 through 10 inside a caller-supplied transaction:
// uniqueness, serial-number archiving, the optimistic-lock write and the
// transfer event.
//
// Taking the transaction as a parameter is what lets the importer write a whole
// file as one unit -- and, because the uniqueness check runs against the same
// transaction, a MAC repeated twice inside one file is caught just like a
// collision with an existing row.
func (s *Service) Persist(ctx context.Context, tx *sql.Tx, prep Prepared) (model.Asset, error) {
	in, fields, clean, sn := prep.Input, prep.Fields, prep.Attrs, prep.SN
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

		// 7. uniqueness, inside the write transaction
		if err := checkUnique(ctx, tx, fields, clean, sn, in.ID); err != nil {
			return out, err
		}

		id := in.ID
		if id == "" {
			id = store.NewID()
		}

		attrsJSON, err := store.MarshalJSONMap(clean)
		if err != nil {
			return out, err
		}

		if prev == nil {
			_, err = tx.ExecContext(ctx,
				`INSERT INTO assets (id, sn, category_id, model_id, status, owner_id, holder_type, holder_id,
				                     attrs, version, created_at, updated_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
				id, sn, in.CategoryID, store.NullString(in.ModelID), string(in.Status), in.OwnerID,
				string(in.Holder.Type), in.Holder.ID, attrsJSON,
				store.FormatTime(now), store.FormatTime(now))
			if err != nil {
				return out, err
			}
			out = model.Asset{
				ID: id, SN: sn, CategoryID: in.CategoryID, ModelID: in.ModelID,
				Status: in.Status, OwnerID: in.OwnerID, Holder: in.Holder,
				Attrs: clean, Version: 1, CreatedAt: now, UpdatedAt: now,
			}
		} else {
			// 8. keep the old serial number searchable
			if prev.SN != sn {
				if _, err := tx.ExecContext(ctx,
					`INSERT INTO asset_sn_history (asset_id, sn, replaced_at) VALUES (?, ?, ?)`,
					id, prev.SN, store.FormatTime(now)); err != nil {
					return out, err
				}
			}
			// 9. optimistic lock
			res, err := tx.ExecContext(ctx,
				`UPDATE assets SET sn = ?, category_id = ?, model_id = ?, status = ?, owner_id = ?,
				                   holder_type = ?, holder_id = ?, attrs = ?, version = version + 1, updated_at = ?
				 WHERE id = ? AND version = ?`,
				sn, in.CategoryID, store.NullString(in.ModelID), string(in.Status), in.OwnerID,
				string(in.Holder.Type), in.Holder.ID, attrsJSON, store.FormatTime(now), id, in.Version)
			if err != nil {
				return out, err
			}
			if n, _ := res.RowsAffected(); n == 0 {
				return out, ErrVersionConflict
			}
			out = model.Asset{
				ID: id, SN: sn, CategoryID: in.CategoryID, ModelID: in.ModelID,
				Status: in.Status, OwnerID: in.OwnerID, Holder: in.Holder,
				Attrs: clean, Version: in.Version + 1, CreatedAt: prev.CreatedAt, UpdatedAt: now,
			}
		}

		// 10. transfer event, only when the state triple actually moved
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
