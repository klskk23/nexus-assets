package schema

import (
	"errors"
	"slices"
	"strings"

	"github.com/klskk23/nexus-assets/internal/i18n"
	"github.com/klskk23/nexus-assets/internal/model"
)

// CategoryDraft preserves omitted values. A non-nil pointer to a nil selection
// slice represents explicit null, which is invalid rather than an empty choice.
type CategoryDraft struct {
	Code              string
	Name              *string
	ParentID          **string
	DisplayKey        *string
	PrintPresetIDs    *[]string
	InheritedFieldIDs *[]string
	ConfirmationToken string
}

var ErrInheritanceSelection = errors.New("invalid inherited field selection")

// ErrConfirmationRequired prevents withdrawals before their impact is confirmed.
var ErrConfirmationRequired = errors.New("schema change requires confirmation")

// FieldDelta identifies a change by field identity, never by its display label.
type FieldDelta struct {
	CategoryID             string `json:"category_id"`
	FieldID                string `json:"field_id"`
	Key                    string `json:"key"`
	Change                 string `json:"change"`
	BeforeSourceCategoryID string `json:"before_source_category_id,omitempty"`
	AfterSourceCategoryID  string `json:"after_source_category_id,omitempty"`
}

type InheritanceCandidate struct {
	Field            model.FieldDefinition `json:"field"`
	SourceCategoryID string                `json:"source_category_id"`
	Selected         bool                  `json:"selected"`
}

// CategoryPreview is an unpaged domain projection. HTTP pagination must never
// truncate the data used to validate a change or sign a confirmation.
type CategoryPreview struct {
	Category             model.Category
	SelectedFieldIDs     []string
	Candidates           []InheritanceCandidate
	Fields               []model.BoundField
	Changes              []FieldDelta
	AssetCount           int
	Issues               []ChangeIssue
	RequiresConfirmation bool
	ConfirmationToken    string
}

// ChangeIssue keeps localization until the HTTP boundary and identifies the
// object that needs correction independently of its human-readable name.
type ChangeIssue struct {
	Code            string
	Message         error
	CategoryID      string
	FieldID         string
	FieldKey        string
	AssetID         string
	ConflictAssetID string
}

func (s *SchemaSnapshot) draftCategory(id string, draft CategoryDraft) (model.Category, error) {
	cat, exists := s.categories[id]
	if !exists && id != "" {
		return model.Category{}, ErrNotFound
	}
	if !exists {
		// This identifier exists only in the overlay, never in persistent data.
		cat = model.Category{ID: "draft", Code: draft.Code, PrintPresetIDs: []string{}}
		for {
			if _, occupied := s.categories[cat.ID]; !occupied {
				break
			}
			cat.ID += "_"
		}
	}
	cat.ParentID = clonePointer(cat.ParentID)
	cat.PrintPresetIDs = append([]string{}, cat.PrintPresetIDs...)
	if draft.Name != nil {
		cat.Name = *draft.Name
	}
	if draft.ParentID != nil {
		cat.ParentID = clonePointer(*draft.ParentID)
	}
	if draft.DisplayKey != nil {
		cat.DisplayKey = *draft.DisplayKey
	}
	if draft.PrintPresetIDs != nil {
		cat.PrintPresetIDs = append([]string{}, (*draft.PrintPresetIDs)...)
	}
	parentPath := ""
	if cat.ParentID != nil {
		parent, ok := s.categories[*cat.ParentID]
		if !ok {
			return cat, ErrNotFound
		}
		if parent.ID == cat.ID || (exists && strings.HasPrefix(parent.Path, s.categories[id].Path)) {
			return cat, i18n.Wrap(ErrInheritanceSelection, i18n.KeyCategoryParentCycle)
		}
		parentPath = parent.Path
	}
	cat.Path = BuildPath(parentPath, cat.ID)
	return cat, nil
}

func (s *SchemaSnapshot) selectDraftFields(cat model.Category, draft CategoryDraft) error {
	available := make(map[string]bool)
	if cat.ParentID != nil {
		fields, err := s.EffectiveFields(*cat.ParentID)
		if err != nil {
			return err
		}
		for _, f := range fields {
			available[f.ID] = true
		}
	}
	selected := make(map[string]bool)
	if draft.InheritedFieldIDs != nil {
		if *draft.InheritedFieldIDs == nil {
			return i18n.Wrap(ErrInheritanceSelection, i18n.KeyInheritanceSelectionShape)
		}
		for _, id := range *draft.InheritedFieldIDs {
			if !available[id] {
				return i18n.Wrap(ErrInheritanceSelection, i18n.KeyInheritanceCandidateInvalid, id)
			}
			selected[id] = true
		}
	} else {
		for id := range s.selections[cat.ID] {
			if available[id] {
				selected[id] = true
			}
		}
	}
	s.selections[cat.ID] = selected
	return nil
}

// pruneDescendants follows parent relationships rather than assuming a path
// prefix means a field is still effective. New candidates are never selected.
func (s *SchemaSnapshot) pruneDescendants(parentID string) error {
	parentFields, err := s.EffectiveFields(parentID)
	if err != nil {
		return err
	}
	available := make(map[string]bool, len(parentFields))
	for _, f := range parentFields {
		available[f.ID] = true
	}
	for _, id := range s.categoryIDs() {
		child := s.categories[id]
		if child.ParentID == nil || *child.ParentID != parentID {
			continue
		}
		for fieldID := range s.selections[id] {
			if !available[fieldID] {
				delete(s.selections[id], fieldID)
			}
		}
		if err := s.pruneDescendants(id); err != nil {
			return err
		}
	}
	return nil
}

func (s *SchemaSnapshot) categoryIDs() []string {
	ids := make([]string, 0, len(s.categories))
	for id := range s.categories {
		ids = append(ids, id)
	}
	slices.Sort(ids)
	return ids
}

func fieldSource(categoryID string, field model.BoundField) string {
	if field.InheritedFrom != "" {
		return field.InheritedFrom
	}
	return categoryID
}
