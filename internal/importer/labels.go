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
	// The whole model, because a device is identified by its vendor as well as
	// its name: two "X100"s from two suppliers are not the same thing, and a
	// sheet that says only "X100" cannot be acted on.
	model    map[string]model.ProductModel
	statuses model.StatusSet
}

// holder names whoever is holding the device, whichever kind of thing that is.
func (l labels) holder(h model.Holder) string {
	if h.Type == model.HolderTypeUser {
		return l.user[h.ID]
	}
	return l.entity[h.ID]
}

// modelName and modelVendor are empty for an asset with no model, which is
// allowed, and for one whose model has since been deleted.
func (l labels) modelName(id *string) string {
	if id == nil {
		return ""
	}
	return l.model[*id].Name
}

func (l labels) modelVendor(id *string) string {
	if id == nil {
		return ""
	}
	return l.model[*id].Vendor
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
	l.model = make(map[string]model.ProductModel, len(models))
	for _, m := range models {
		l.model[m.ID] = m
	}

	// From the rows the interface reads, not a second copy of the labels in the
	// web bundle -- that arrangement is exactly the one that drifts.
	l.statuses, err = s.schema.StatusSet(ctx)
	return l, err
}
