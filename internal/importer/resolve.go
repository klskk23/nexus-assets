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
	// modelsByPair is keyed by name and vendor together, which is what makes a
	// model unique. The sheet has a vendor column for exactly the case the
	// name alone cannot answer.
	modelsByPair map[[2]string]string
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
		modelsByPair:    map[[2]string]string{},
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
		l.modelsByPair[[2]string{name, strings.TrimSpace(m.Vendor)}] = m.ID
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

// resolveModel maps a model, and the vendor beside it when the sheet gives
// one, to its id.
//
// A miss is an error, never a silently created model: an import that invents
// records turns one typo into a permanent piece of bad reference data.
//
// The vendor column is optional because most sheets do not need it -- a name
// that only one vendor carries resolves on its own. It is what settles the
// case that used to be a dead end: two suppliers with a product called X100,
// and no way to say which one this row means.
func (l *lookups) resolveModel(name, vendor string) (string, error) {
	name, vendor = strings.TrimSpace(name), strings.TrimSpace(vendor)
	if name == "" {
		return "", nil
	}
	if vendor != "" {
		id, ok := l.modelsByPair[[2]string{name, vendor}]
		if !ok {
			return "", i18n.M(i18n.KeyImportModelVendorMiss, vendor, name)
		}
		return id, nil
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
