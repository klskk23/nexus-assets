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
	modelsByName  map[string]string
	holdersByName map[string]model.HolderEntity
	usersByName   map[string]string
	fieldByKey    map[string]model.BoundField
}

func (s *Service) buildLookups(ctx context.Context, categoryID string) (*lookups, error) {
	l := &lookups{
		modelsByName:  map[string]string{},
		holdersByName: map[string]model.HolderEntity{},
		usersByName:   map[string]string{},
		fieldByKey:    map[string]model.BoundField{},
	}

	models, err := s.schema.ListModels(ctx)
	if err != nil {
		return nil, err
	}
	for _, m := range models {
		if m.ArchivedAt == nil {
			l.modelsByName[strings.TrimSpace(m.Name)] = m.ID
		}
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
