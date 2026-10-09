package schema

import (
	"context"
	"fmt"
	"sync"

	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/store"
)

// SchemaSnapshot owns one transaction's schema data. It never queries the
// database after loading; returned fields are copies, not writable cache views.
type SchemaSnapshot struct {
	categories     map[string]model.Category
	fields         map[string]model.FieldDefinition
	models         map[string]model.ProductModel
	vendors        map[string]model.Vendor
	bindings       map[string][]Binding
	selections     map[string]map[string]bool
	device         []model.BoundField
	deviceByModel  map[string][]model.BoundField
	modelBindings  map[string][]ModelBinding
	vendorBindings map[string][]ModelBinding

	mu             sync.Mutex
	categoryFields map[string][]model.BoundField
}

// Snapshot loads through one consistent read transaction. A caller already in
// a write transaction must instead pass that transaction to LoadSchemaSnapshot.
func (s *Store) Snapshot(ctx context.Context) (*SchemaSnapshot, error) {
	var snapshot *SchemaSnapshot
	err := s.db.ReadTx(ctx, func(ctx context.Context, q store.Querier) error {
		var err error
		snapshot, err = LoadSchemaSnapshot(ctx, q)
		return err
	})
	return snapshot, err
}

// LoadSchemaSnapshot uses only q. The caller owns its transaction and therefore
// decides whether uncommitted metadata or a consistent read snapshot is visible.
func LoadSchemaSnapshot(ctx context.Context, q store.Querier) (*SchemaSnapshot, error) {
	s := &SchemaSnapshot{
		categories:     make(map[string]model.Category),
		fields:         make(map[string]model.FieldDefinition),
		models:         make(map[string]model.ProductModel),
		vendors:        make(map[string]model.Vendor),
		bindings:       make(map[string][]Binding),
		selections:     make(map[string]map[string]bool),
		deviceByModel:  make(map[string][]model.BoundField),
		categoryFields: make(map[string][]model.BoundField),
	}
	if err := s.loadDefinitions(ctx, q); err != nil {
		return nil, fmt.Errorf("load schema snapshot: %w", err)
	}
	if err := s.loadBindings(ctx, q); err != nil {
		return nil, fmt.Errorf("load schema snapshot: %w", err)
	}
	return s, nil
}

// EffectiveFields resolves only category fields, applying each child's explicit
// choices to its immediate parent's effective fields before appending its own.
func (s *SchemaSnapshot) EffectiveFields(categoryID string) ([]model.BoundField, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	fields, err := s.resolveCategory(categoryID, make(map[string]bool))
	if err != nil {
		return nil, err
	}
	return cloneBoundFields(fields), nil
}

func (s *SchemaSnapshot) resolveCategory(id string, visiting map[string]bool) ([]model.BoundField, error) {
	if fields, ok := s.categoryFields[id]; ok {
		return fields, nil
	}
	cat, ok := s.categories[id]
	if !ok {
		return nil, ErrNotFound
	}
	if visiting[id] {
		return nil, fmt.Errorf("category %s has a parent cycle", id)
	}
	visiting[id] = true
	defer delete(visiting, id)
	var parentFields []model.BoundField
	parentID := ""
	if cat.ParentID != nil {
		parentID = *cat.ParentID
		var err error
		parentFields, err = s.resolveCategory(parentID, visiting)
		if err != nil {
			return nil, err
		}
	}
	if err := s.checkAncestorKeys(id, parentID); err != nil {
		return nil, err
	}
	fields, err := resolveSelectedFields(id, parentID, parentFields, s.selections[id], s.bindings[id])
	if err != nil {
		return nil, err
	}
	s.categoryFields[id] = fields
	return fields, nil
}

// checkAncestorKeys deliberately ignores selections. A raw attribute key must
// not acquire a different definition on the same chain when inheritance changes.
func (s *SchemaSnapshot) checkAncestorKeys(id, parentID string) error {
	keys := make(map[string]bool, len(s.bindings[id]))
	for _, binding := range s.bindings[id] {
		keys[binding.Field.Key] = true
	}
	for parentID != "" {
		for _, binding := range s.bindings[parentID] {
			if keys[binding.Field.Key] {
				return fmt.Errorf("category %s repeats ancestor %s field key %q: %w", id, parentID, binding.Field.Key, ErrKeyConflict)
			}
		}
		parent := s.categories[parentID]
		parentID = ""
		if parent.ParentID != nil {
			parentID = *parent.ParentID
		}
	}
	return nil
}

// FieldsOfPath requires the path from this snapshot, rather than interpreting a
// stale path as a new source of ancestry.
func (s *SchemaSnapshot) FieldsOfPath(path string) ([]model.BoundField, error) {
	ids := AncestorIDs(path)
	if len(ids) == 0 {
		return nil, ErrNotFound
	}
	cat, ok := s.categories[ids[len(ids)-1]]
	if !ok || cat.Path != path {
		return nil, ErrNotFound
	}
	return s.EffectiveFields(cat.ID)
}

// FieldsForAsset adds the actual model's device fields without narrowing the
// reach metadata each field carries for column selection.
func (s *SchemaSnapshot) FieldsForAsset(path, modelID string) ([]model.BoundField, error) {
	fields, err := s.FieldsOfPath(path)
	if err != nil {
		return nil, err
	}
	return append(fields, cloneBoundFields(s.deviceByModel[modelID])...), nil
}

// EveryPossibleField retains all device-side identities for mixed-model files,
// including distinct fields with the same key on disjoint models.
func (s *SchemaSnapshot) EveryPossibleField(categoryID string) ([]model.BoundField, error) {
	fields, err := s.EffectiveFields(categoryID)
	if err != nil {
		return nil, err
	}
	return append(fields, cloneBoundFields(s.device)...), nil
}

func cloneBoundFields(fields []model.BoundField) []model.BoundField {
	out := make([]model.BoundField, len(fields))
	for i, f := range fields {
		f.Options.Min = clonePointer(f.Options.Min)
		f.Options.Max = clonePointer(f.Options.Max)
		f.Options.Precision = clonePointer(f.Options.Precision)
		f.ModelIDs = append([]string(nil), f.ModelIDs...)
		f.VendorIDs = append([]string(nil), f.VendorIDs...)
		out[i] = f
	}
	return out
}

func clonePointer[T any](value *T) *T {
	if value == nil {
		return nil
	}
	copy := *value
	return &copy
}
