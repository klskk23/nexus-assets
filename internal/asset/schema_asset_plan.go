package asset

import (
	"fmt"
	"maps"
	"reflect"

	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/schema"
)

func planSchemaAssetCached(change schema.SchemaChange, a model.Asset, cache schemaComputeCache) (schemaAssetEffect, error) {
	effect := schemaAssetEffect{asset: a, attrs: maps.Clone(a.Attrs)}
	before, err := change.Before.AssetSchema(a.CategoryID, a.ModelID)
	if err != nil {
		return effect, err
	}
	after, err := change.After.AssetSchema(a.CategoryID, a.ModelID)
	if err != nil {
		return effect, err
	}
	effect.fields = after.Fields
	oldFields := make(map[string]model.BoundField, len(before.Fields))
	for _, field := range before.Fields {
		oldFields[field.ID] = field
	}
	changedKeys := make(map[string]bool)
	for _, field := range after.Fields {
		old, existed := oldFields[field.ID]
		if existed {
			old.InheritedFrom = field.InheritedFrom
			old.Sort = field.Sort
			if !reflect.DeepEqual(old, field) {
				return effect, schema.ErrSchemaEffectsUnavailable
			}
		}
		if !existed {
			changedKeys[field.Key] = true
			if field.Type != model.FieldComputed {
				effect.restoreStatic(field)
			}
		}
		delete(oldFields, field.ID)
	}
	effect.claims = schemaClaimChange{assetID: a.ID}
	for _, field := range before.Fields {
		if _, removed := oldFields[field.ID]; removed {
			changedKeys[field.Key] = true
			effect.claims.withdrawn = append(effect.claims.withdrawn, field.Key)
		}
	}
	if len(effect.issues) == 0 {
		if err := effect.computeNecessary(after, changedKeys, cache); err != nil {
			return effect, err
		}
	}
	effect.claims.want = uniqueValues(after.Fields, effect.attrs, a.CategoryID)
	effect.search = searchValues(after.Fields, effect.attrs)
	return effect, nil
}

func (effect *schemaAssetEffect) restoreStatic(field model.BoundField) {
	raw, present := effect.attrs[field.Key]
	if !present || raw == nil || fmt.Sprint(raw) == "" {
		return
	}
	normalized, err := validateOne(field, raw)
	if err != nil {
		effect.issues = append(effect.issues, schema.ChangeIssue{
			Code: "invalid_restored_value", Message: err,
			CategoryID: effect.asset.CategoryID, AssetID: effect.asset.ID,
			FieldID: field.ID, FieldKey: field.Key,
		})
		return
	}
	effect.attrs[field.Key] = normalized
}
