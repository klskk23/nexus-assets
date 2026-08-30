package importer

import (
	"context"
	"errors"
	"fmt"
	"strings"

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
	usersByName     map[string]string
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
		usersByName:     map[string]string{},
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
	for _, e := range entities {
		if e.ArchivedAt == nil {
			l.holdersByName[strings.TrimSpace(e.Name)] = e
		}
	}

	users, err := s.users.List(ctx)
	if err != nil {
		return nil, err
	}
	for _, u := range users {
		if u.Status == model.UserActive {
			l.usersByName[strings.TrimSpace(u.Name)] = u.ID
			l.usersByName[strings.TrimSpace(u.Email)] = u.ID
		}
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
		return "", fmt.Errorf("型号「%s」有多个厂商的同名产品，请写成「厂商 型号」", name)
	}
	id, ok := l.modelsByName[name]
	if !ok {
		return "", fmt.Errorf("找不到型号「%s」，请先在型号页建立", name)
	}
	return id, nil
}

// resolveHolder maps a location name to its entity.
func (l *lookups) resolveHolder(name string) (model.HolderEntity, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return model.HolderEntity{}, errors.New("持有方不能为空")
	}
	e, ok := l.holdersByName[name]
	if !ok {
		return model.HolderEntity{}, fmt.Errorf("找不到持有方「%s」，请先在持有方页建立", name)
	}
	return e, nil
}

// resolveReference maps the display name in a reference column to an id.
func (l *lookups) resolveReference(f model.BoundField, name string) (string, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return "", nil
	}
	switch f.Options.Target {
	case "user":
		if id, ok := l.usersByName[name]; ok {
			return id, nil
		}
		return "", fmt.Errorf("找不到账号「%s」", name)
	default:
		e, ok := l.holdersByName[name]
		if !ok {
			return "", fmt.Errorf("找不到「%s」", name)
		}
		return e.ID, nil
	}
}
