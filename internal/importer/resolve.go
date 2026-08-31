package importer

import (
	"context"
	"strings"

	"github.com/klskk23/nexus-assets/internal/i18n"
	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/schema"
)

// lookups caches the name-to-id maps one file needs, so a 500-row import does
// not issue 500 lookups.
type lookups struct {
	modelsByName map[string]string
	// ambiguousModels holds names carried by more than one vendor. Names are
	// unique per vendor, not globally, so a file naming just the model can be
	// genuinely undecidable -- and picking one would attach the wrong hardware
	// to a device without ever saying so.
	ambiguousModels map[string]bool
	holdersByName   map[string]model.HolderEntity
	fieldByKey      map[string]model.BoundField
	// displayKey is the category's nominated identifier, so a preview row can
	// show the same label the asset will carry once it exists.
	displayKey string
}

func (s *Service) buildLookups(ctx context.Context, categoryID string) (*lookups, error) {
	l := &lookups{
		modelsByName:    map[string]string{},
		ambiguousModels: map[string]bool{},
		holdersByName:   map[string]model.HolderEntity{},
		fieldByKey:      map[string]model.BoundField{},
	}

	cat, err := s.schema.GetCategory(ctx, categoryID)
	if err != nil {
		return nil, err
	}
	l.displayKey = cat.DisplayKey

	// Only the models this category can actually offer. That also cuts down on
	// ambiguity: two vendors sharing a product name matter only if both models
	// are reachable from here.
	models, err := s.schema.CandidateModels(ctx, cat.Path)
	if err != nil {
		return nil, err
	}
	for _, m := range models {
		name := strings.TrimSpace(m.Name)
		if _, dup := l.modelsByName[name]; dup {
			l.ambiguousModels[name] = true
			continue
		}
		l.modelsByName[name] = m.ID
	}

	entities, err := s.holders.List(ctx)
	if err != nil {
		return nil, err
	}
	// Every entity on file is a candidate: archiving is gone, so an entity
	// that exists is one that can hold something.
	for _, e := range entities {
		l.holdersByName[strings.TrimSpace(e.Name)] = e
	}

	fields, err := s.schema.EffectiveFields(ctx, categoryID)
	if err != nil {
		return nil, err
	}
	for _, f := range schema.ActiveFields(fields) {
		l.fieldByKey[f.Key] = f
	}
	return l, nil
}

// resolveModel maps a model name to its id.
//
// A miss is an error, never a silently created model: an import that invents
// records turns one typo into a permanent piece of bad reference data.
func (l *lookups) resolveModel(name string) (string, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return "", nil
	}
	if l.ambiguousModels[name] {
		return "", i18n.M(i18n.KeyImportModelAmbig, name)
	}
	id, ok := l.modelsByName[name]
	if !ok {
		return "", i18n.M(i18n.KeyImportModelMissing, name)
	}
	return id, nil
}

// resolveHolder maps a location name to its entity.
func (l *lookups) resolveHolder(name string) (model.HolderEntity, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return model.HolderEntity{}, i18n.M(i18n.KeyImportHolderEmpty)
	}
	e, ok := l.holdersByName[name]
	if !ok {
		return model.HolderEntity{}, i18n.M(i18n.KeyImportHolderMiss, name)
	}
	return e, nil
}
