package asset

import (
	"github.com/klskk23/nexus-assets/internal/compute"
	"github.com/klskk23/nexus-assets/internal/i18n"
	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/schema"
)

// The cache belongs to one plan, never a service or a mutable schema lifetime.
type schemaComputeCache map[string]*schemaComputation

type schemaComputation struct {
	programs map[string]*compute.Program
	deps     map[string][]string
	fields   map[string]model.BoundField
	order    []string
}

func newSchemaComputeCache() schemaComputeCache { return make(schemaComputeCache) }

func (cache schemaComputeCache) get(after schema.AssetSchema) (*schemaComputation, error) {
	if plan := cache[after.Fingerprint]; plan != nil && after.Fingerprint != "" {
		return plan, nil
	}
	plan := &schemaComputation{programs: make(map[string]*compute.Program), deps: make(map[string][]string), fields: make(map[string]model.BoundField)}
	for _, field := range after.Fields {
		plan.fields[field.Key] = field
		if field.Type != model.FieldComputed {
			continue
		}
		program, err := compute.Parse(field.Key, field.Options.Template)
		if err != nil {
			return nil, FieldErrors{field.Key: asMessage(err)}
		}
		plan.programs[field.Key], plan.deps[field.Key] = program, program.AttrReferences()
	}
	var err error
	plan.order, err = compute.TopoSort(plan.deps)
	if err != nil {
		return nil, FieldErrors{"_computed": asMessage(err)}
	}
	if after.Fingerprint != "" {
		cache[after.Fingerprint] = plan
	}
	return plan, nil
}

// Evaluate the forward closure only. Archived values never enter the context,
// and needed results are removed before evaluation instead of seeding themselves.
func (plan *schemaComputation) evaluate(after schema.AssetSchema, id string, attrs map[string]any, changed map[string]bool) (map[string]any, error) {
	live, _ := SplitAttrs(after.Fields, attrs)
	modelName, vendorName := "", ""
	if after.Model != nil {
		modelName, vendorName = after.Model.Name, after.Model.VendorName
	}
	ctx := compute.NewContext(id, live, after.Category.Code, after.Category.Name, modelName, vendorName)
	values := make(map[string]any)
	for _, key := range plan.order {
		needed := changed == nil || changed[key]
		for _, dependency := range plan.deps[key] {
			needed = needed || changed[dependency]
		}
		if !needed {
			continue
		}
		delete(live, key)
		value, err := plan.programs[key].Run(ctx)
		if err != nil {
			return nil, FieldErrors{key: i18n.M(i18n.KeyFieldComputeFail, err)}
		}
		live[key], values[key] = value, value
		if changed != nil {
			changed[key] = true
		}
	}
	return values, nil
}

func (effect *schemaAssetEffect) computeNecessary(after schema.AssetSchema, changed map[string]bool, cache schemaComputeCache) error {
	plan, err := cache.get(after)
	if err == nil {
		var values map[string]any
		values, err = plan.evaluate(after, effect.asset.ID, effect.attrs, changed)
		if err == nil {
			for key, value := range values {
				effect.attrs[key] = value
			}
			return nil
		}
	}
	for key, message := range err.(FieldErrors) {
		field := model.BoundField{}
		for _, candidate := range after.Fields {
			if candidate.Key == key {
				field = candidate
				break
			}
		}
		effect.computationIssue(field, message)
	}
	return nil
}

func (effect *schemaAssetEffect) computationIssue(field model.BoundField, err error) {
	effect.issues = append(effect.issues, schema.ChangeIssue{
		Code: "computation_failed", Message: err,
		CategoryID: effect.asset.CategoryID, AssetID: effect.asset.ID,
		FieldID: field.ID, FieldKey: field.Key,
	})
}
