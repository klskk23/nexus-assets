package importer

import (
	"bytes"
	"context"
	"encoding/csv"
	"fmt"

	"github.com/klskk23/nexus-assets/internal/asset"
	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/schema"
)

// exportLimit caps one export. Well above any realistic stocktake, and there so
// a mistaken filter cannot try to stream the entire database.
const exportLimit = 10000

// Export renders the assets matching a filter as CSV.
//
// It takes the same filter the list page uses, so what is exported is exactly
// what the person is looking at -- an export that quietly ignored the filters
// would be worse than no export at all.
func (s *Service) Export(ctx context.Context, f asset.ListFilter) ([]byte, error) {
	f.Offset = 0
	f.Limit = exportLimit

	res, err := s.assets.List(ctx, f)
	if err != nil {
		return nil, err
	}

	// Custom columns come from the filtered category when there is one;
	// otherwise only the fixed columns are meaningful across mixed categories.
	var fields []model.BoundField
	if f.CategoryID != "" {
		fields, err = s.schema.EffectiveFields(ctx, f.CategoryID)
		if err != nil {
			return nil, err
		}
		fields = schema.ActiveFields(fields)
	}

	users, err := s.users.List(ctx)
	if err != nil {
		return nil, err
	}
	userName := map[string]string{}
	for _, u := range users {
		userName[u.ID] = u.Name
	}
	entities, err := s.holders.List(ctx)
	if err != nil {
		return nil, err
	}
	entityName := map[string]string{}
	for _, e := range entities {
		entityName[e.ID] = e.Name
	}
	categories, err := s.schema.ListCategories(ctx)
	if err != nil {
		return nil, err
	}
	catName := map[string]string{}
	for _, c := range categories {
		catName[c.ID] = c.Name
	}

	header := []string{"资产编号", "类别", "状态", "持有方", "负责人", "创建时间"}
	for _, fd := range fields {
		header = append(header, fd.Label)
	}

	var buf bytes.Buffer
	buf.WriteString(bom)
	w := csv.NewWriter(&buf)
	if err := w.Write(header); err != nil {
		return nil, fmt.Errorf("write header: %w", err)
	}

	// The labels used to be a second copy of the ones in the web bundle, which
	// is exactly the arrangement that drifts. They come from the same rows the
	// UI reads now.
	statuses, err := s.schema.StatusSet(ctx)
	if err != nil {
		return nil, err
	}

	for _, a := range res.Items {
		holderLabel := entityName[a.Holder.ID]
		if a.Holder.Type == model.HolderTypeUser {
			holderLabel = userName[a.Holder.ID]
		}
		rec := []string{
			a.DisplayName,
			catName[a.CategoryID],
			statuses.Label(a.Status),
			holderLabel,
			userName[a.OwnerID],
			a.CreatedAt.Format("2006-01-02 15:04"),
		}
		for _, fd := range fields {
			v, ok := a.Attrs[fd.Key]
			if !ok || v == nil {
				rec = append(rec, "")
				continue
			}
			rec = append(rec, fmt.Sprintf("%v", v))
		}
		if err := w.Write(rec); err != nil {
			return nil, err
		}
	}
	w.Flush()
	if err := w.Error(); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}
