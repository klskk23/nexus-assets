package importer

import (
	"context"

	"github.com/klskk23/nexus-assets/internal/model"
)

// labels are the names the tabular views put in front of a person.
//
// Assets store ids -- an owner, a holder, a category, a model -- and an id on a
// page or in a spreadsheet is worth nothing to whoever opens it. Both the CSV
// export and the row view need the same four tables and the same status
// labels, which is why they are loaded in one place rather than assembled twice
// with two chances to drift.
type labels struct {
	user     map[string]string
	entity   map[string]string
	category map[string]string
	model    map[string]string
	statuses model.StatusSet
}

// holder names whoever is holding the device, whichever kind of thing that is.
func (l labels) holder(h model.Holder) string {
	if h.Type == model.HolderTypeUser {
		return l.user[h.ID]
	}
	return l.entity[h.ID]
}

// modelName is empty for an asset with no model, which is allowed.
func (l labels) modelName(id *string) string {
	if id == nil {
		return ""
	}
	return l.model[*id]
}

func (s *Service) labels(ctx context.Context) (labels, error) {
	var l labels

	users, err := s.users.List(ctx)
	if err != nil {
		return l, err
	}
	l.user = make(map[string]string, len(users))
	for _, u := range users {
		l.user[u.ID] = u.Name
	}

	entities, err := s.holders.List(ctx)
	if err != nil {
		return l, err
	}
	l.entity = make(map[string]string, len(entities))
	for _, e := range entities {
		l.entity[e.ID] = e.Name
	}

	categories, err := s.schema.ListCategories(ctx)
	if err != nil {
		return l, err
	}
	l.category = make(map[string]string, len(categories))
	for _, c := range categories {
		l.category[c.ID] = c.Name
	}

	models, err := s.schema.ListModels(ctx)
	if err != nil {
		return l, err
	}
	l.model = make(map[string]string, len(models))
	for _, m := range models {
		l.model[m.ID] = m.Name
	}

	// From the rows the interface reads, not a second copy of the labels in the
	// web bundle -- that arrangement is exactly the one that drifts.
	l.statuses, err = s.schema.StatusSet(ctx)
	return l, err
}
