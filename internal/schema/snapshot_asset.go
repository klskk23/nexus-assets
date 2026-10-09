package schema

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"sort"

	"github.com/klskk23/nexus-assets/internal/model"
)

// AssetSchema contains all schema inputs for one asset from one loaded snapshot.
type AssetSchema struct {
	Category    model.Category
	Model       *model.ProductModel
	Fields      []model.BoundField
	Fingerprint string
}

// AssetSchema resolves only this asset's inputs. Global device reach and entity
// timestamps are deliberately absent from the fingerprint: another model's
// bindings must not invalidate already prepared assets of this model.
func (s *SchemaSnapshot) AssetSchema(categoryID string, modelID *string) (AssetSchema, error) {
	category, err := s.Category(categoryID)
	if err != nil {
		return AssetSchema{}, err
	}
	fields, err := s.EffectiveFields(categoryID)
	if err != nil {
		return AssetSchema{}, err
	}
	result := AssetSchema{Category: category, Fields: fields}
	if modelID != nil {
		m, ok := s.models[*modelID]
		if !ok {
			return AssetSchema{}, ErrNotFound
		}
		m = cloneProductModel(m)
		result.Model = &m
		result.Fields = append(result.Fields, s.assetDeviceFields(m)...)
	}
	result.Fingerprint, err = s.assetFingerprint(result)
	if err != nil {
		return AssetSchema{}, err
	}
	return result, nil
}

func (s *SchemaSnapshot) assetDeviceFields(m model.ProductModel) []model.BoundField {
	own := map[string][]ModelBinding{m.ID: s.modelBindings[m.ID]}
	vendors := map[string][]ModelBinding{m.VendorID: s.vendorBindings[m.VendorID]}
	inherited, sources := resolveVendorFields(vendors, map[string][]string{m.VendorID: {m.ID}})
	bindings := mergeDeviceBindings(own, inherited)
	return cloneBoundFields(resolveModelFields(map[string]bool{m.ID: true}, bindings, sources))
}

type assetCategoryProjection struct {
	ID, Code, Name, Path, DisplayKey string
	ParentID                         *string
}

type assetModelProjection struct {
	ID, Name, VendorID, VendorName string
	Defaults                       map[string]any
}

type assetFieldProjection struct {
	ID, Key                      string
	Type                         model.FieldType
	Required, Unique, Searchable bool
	Options                      model.FieldOptions
	SourceCategoryID             string
	Sort                         int
	DirectModel, InheritedVendor bool
}

func (s *SchemaSnapshot) assetFingerprint(asset AssetSchema) (string, error) {
	cat := asset.Category
	projection := struct {
		Category assetCategoryProjection
		Model    *assetModelProjection
		Fields   []assetFieldProjection
	}{
		Category: assetCategoryProjection{ID: cat.ID, Code: cat.Code, Name: cat.Name, Path: cat.Path, ParentID: cat.ParentID, DisplayKey: cat.DisplayKey},
		Fields:   make([]assetFieldProjection, 0, len(asset.Fields)),
	}
	var direct, vendor map[string]bool
	if m := asset.Model; m != nil {
		projection.Model = &assetModelProjection{ID: m.ID, Name: m.Name, VendorID: m.VendorID, VendorName: m.VendorName, Defaults: m.AttrDefaults}
		direct = bindingIdentities(s.modelBindings[m.ID])
		vendor = bindingIdentities(s.vendorBindings[m.VendorID])
	}
	for _, f := range asset.Fields {
		source := f.InheritedFrom
		if len(f.ModelIDs) == 0 && source == "" {
			source = cat.ID
		}
		projection.Fields = append(projection.Fields, assetFieldProjection{
			ID: f.ID, Key: f.Key, Type: f.Type, Required: f.Required, Unique: f.IsUnique, Searchable: f.Searchable,
			Options: f.Options, SourceCategoryID: source, Sort: f.Sort,
			DirectModel: direct[f.ID], InheritedVendor: vendor[f.ID],
		})
	}
	data, err := json.Marshal(projection)
	if err != nil {
		return "", fmt.Errorf("encode asset schema fingerprint: %w", err)
	}
	digest := sha256.Sum256(data)
	return hex.EncodeToString(digest[:]), nil
}

func bindingIdentities(bindings []ModelBinding) map[string]bool {
	ids := make(map[string]bool, len(bindings))
	for _, b := range bindings {
		ids[b.Field.ID] = true
	}
	return ids
}

// Category returns an isolated copy, including its parent and preset list.
func (s *SchemaSnapshot) Category(id string) (model.Category, error) {
	c, ok := s.categories[id]
	if !ok {
		return model.Category{}, ErrNotFound
	}
	return cloneCategory(c), nil
}

// Categories returns isolated categories ordered by path, then identity.
func (s *SchemaSnapshot) Categories() []model.Category {
	out := make([]model.Category, 0, len(s.categories))
	for _, c := range s.categories {
		out = append(out, cloneCategory(c))
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Path == out[j].Path {
			return out[i].ID < out[j].ID
		}
		return out[i].Path < out[j].Path
	})
	return out
}

// Models includes archived models; callers decide whether those are eligible.
// Identity ordering is stable even when names or vendors change.
func (s *SchemaSnapshot) Models() []model.ProductModel {
	out := make([]model.ProductModel, 0, len(s.models))
	for _, m := range s.models {
		out = append(out, cloneProductModel(m))
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out
}

// Vendors returns independent values in stable identity order.
func (s *SchemaSnapshot) Vendors() []model.Vendor {
	out := make([]model.Vendor, 0, len(s.vendors))
	for _, v := range s.vendors {
		out = append(out, v)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out
}

func cloneCategory(c model.Category) model.Category {
	c.ParentID = clonePointer(c.ParentID)
	c.ArchivedAt = clonePointer(c.ArchivedAt)
	c.PrintPresetIDs = append([]string(nil), c.PrintPresetIDs...)
	return c
}

func cloneProductModel(m model.ProductModel) model.ProductModel {
	m.ArchivedAt = clonePointer(m.ArchivedAt)
	if m.AttrDefaults != nil {
		m.AttrDefaults = cloneSnapshotJSON(m.AttrDefaults).(map[string]any)
	}
	return m
}

// Defaults originate in JSON, so maps and arrays are the only mutable nodes.
func cloneSnapshotJSON(value any) any {
	switch v := value.(type) {
	case map[string]any:
		out := make(map[string]any, len(v))
		for key, item := range v {
			out[key] = cloneSnapshotJSON(item)
		}
		return out
	case []any:
		out := make([]any, len(v))
		for i, item := range v {
			out[i] = cloneSnapshotJSON(item)
		}
		return out
	default:
		return value
	}
}
