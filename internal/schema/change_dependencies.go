package schema

import (
	"slices"
	"strings"

	"github.com/klskk23/nexus-assets/internal/i18n"
	"github.com/klskk23/nexus-assets/internal/model"
)

func computedIssues(after *SchemaSnapshot, rootID string) ([]ChangeIssue, error) {
	issues := []ChangeIssue{}
	modelIDs := make([]string, 0, len(after.models))
	for id := range after.models {
		modelIDs = append(modelIDs, id)
	}
	slices.Sort(modelIDs)
	for _, id := range after.categoryIDs() {
		if !strings.HasPrefix(after.categories[id].Path, after.categories[rootID].Path) {
			continue
		}
		fields, err := after.EffectiveFields(id)
		if err != nil {
			return nil, err
		}
		issues = append(issues, contextComputedIssues(id, fields)...)
		for _, modelID := range modelIDs {
			deviceFields, err := after.FieldsForAsset(after.categories[id].Path, modelID)
			if err != nil {
				return nil, err
			}
			for _, issue := range contextComputedIssues(id, deviceFields) {
				if !slices.ContainsFunc(issues, func(existing ChangeIssue) bool {
					return existing.CategoryID == issue.CategoryID && existing.FieldID == issue.FieldID
				}) {
					issues = append(issues, issue)
				}
			}
		}
	}
	return issues, nil
}

// Resolve dependencies within this effective vocabulary, never a global key
// map: disjoint branches and models may legally use the same key for different
// field identities. Missing inputs remain missing rather than being selected.
func contextComputedIssues(categoryID string, fields []model.BoundField) []ChangeIssue {
	byKey := make(map[string]model.FieldDefinition, len(fields))
	for _, f := range fields {
		def := f.FieldDefinition
		def.Required = f.Required
		byKey[f.Key] = def
	}
	var issues []ChangeIssue
	for _, f := range fields {
		if f.Type != model.FieldComputed {
			continue
		}
		if err := finalDependencyError(f.Key, byKey); err != nil {
			issues = append(issues, ChangeIssue{
				Code: "dependencies_unmet", Message: err,
				CategoryID: categoryID, FieldID: f.ID, FieldKey: f.Key,
			})
		}
	}
	return issues
}

func finalDependencyError(key string, byKey map[string]model.FieldDefinition) error {
	deps, err := DependencyClosure(key, byKey)
	if err != nil {
		return i18n.Wrap(ErrDependenciesUnmet, i18n.KeyDepUnmet, key, err)
	}
	var missing, optional []any
	for _, dep := range deps {
		def, present := byKey[dep]
		if !present {
			missing = append(missing, dep)
		} else if def.Type != model.FieldComputed && !def.Required {
			optional = append(optional, i18n.M(i18n.KeyLabelWithKey, def.Label, dep))
		}
	}
	var problems []any
	if len(missing) > 0 {
		problems = append(problems, i18n.M(i18n.KeyDepUnbound, i18n.Join(i18n.KeyListSeparator, missing...)))
	}
	if len(optional) > 0 {
		problems = append(problems, i18n.M(i18n.KeyDepNotRequired, i18n.Join(i18n.KeyListSeparator, optional...)))
	}
	if len(problems) == 0 {
		return nil
	}
	return i18n.Wrap(ErrDependenciesUnmet, i18n.KeyDepUnmet, key, i18n.Join(i18n.KeyProblemSeparator, problems...))
}
