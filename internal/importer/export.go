package importer

import (
	"bytes"
	"context"
	"encoding/csv"
	"errors"
	"fmt"

	"github.com/klskk23/nexus-assets/internal/asset"
	"github.com/klskk23/nexus-assets/internal/i18n"
	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/schema"
)

// exportLimit caps one export. Well above any realistic stocktake, and there so
// a mistaken filter cannot try to stream the entire database.
const exportLimit = 10000

// ErrExportNeedsCategory is returned when an export is asked for without one.
//
// A category is what decides the columns: field keys are that category's own
// vocabulary, so a mixed export can only ever be the fixed columns, and a
// spreadsheet of devices with none of what makes them different is not the
// file anybody meant to ask for.
var ErrExportNeedsCategory = errors.New("a category is required")

// Export renders the assets matching a filter as CSV.
//
// It takes the same filter the list page uses, so what is exported is exactly
// what the person is looking at -- an export that quietly ignored the filters
// would be worse than no export at all.
//
// keys chooses the custom columns: nil takes every field bound to the
// category, and a non-nil list narrows to those keys. Empty and nil are
// deliberately different -- "just the fixed columns" is a thing to be able to
// ask for, and it is not the same request as not having said anything.
func (s *Service) Export(ctx context.Context, lang i18n.Lang, f asset.ListFilter, keys []string) ([]byte, error) {
	if f.CategoryID == "" {
		return nil, i18n.Wrap(ErrExportNeedsCategory, i18n.KeyExportNeedCat)
	}
	f.Offset = 0
	f.Limit = exportLimit

	res, err := s.assets.List(ctx, f)
	if err != nil {
		return nil, err
	}

	snapshot, err := s.schema.Snapshot(ctx)
	if err != nil {
		return nil, err
	}
	fields, err := exportFields(snapshot, f.CategoryID, keys)
	if err != nil {
		return nil, err
	}

	names, err := s.labels(ctx)
	if err != nil {
		return nil, err
	}

	header := make([]string, 0, 9+len(fields))
	for _, k := range []string{
		i18n.KeyColSN, i18n.KeyColCategory, i18n.KeyColStatus,
		i18n.KeyColHolder, i18n.KeyColOwner,
		// The model and who makes it. The model was missing altogether, so the
		// import template could name a device's model and the export could
		// not give it back -- and "X100" without a vendor is not an answer
		// when two suppliers both sell one.
		i18n.KeyColModel, i18n.KeyColVendor,
		i18n.KeyColNote, i18n.KeyColCreatedAt,
	} {
		header = append(header, i18n.M(k).In(lang))
	}
	for _, fd := range fields {
		header = append(header, fd.Label)
	}

	var buf bytes.Buffer
	buf.WriteString(bom)
	w := csv.NewWriter(&buf)
	if err := w.Write(header); err != nil {
		return nil, fmt.Errorf("write header: %w", err)
	}

	for _, a := range res.Items {
		rec := []string{
			a.DisplayName,
			names.category[a.CategoryID],
			names.statuses.Label(a.Status),
			names.holder(a.Holder),
			names.user[a.OwnerID],
			names.modelName(a.ModelID),
			names.modelVendor(a.ModelID),
			a.Note,
			a.CreatedAt.Format("2006-01-02 15:04"),
		}
		values, err := exportValues(snapshot, fields, a)
		if err != nil {
			return nil, err
		}
		rec = append(rec, values...)
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

// exportValues preserves column identities even when disjoint model definitions
// share a key. A raw archived value is never enough to populate an output cell.
func exportValues(snapshot *schema.SchemaSnapshot, fields []model.BoundField, a model.Asset) ([]string, error) {
	values := make([]string, len(fields))
	for i, fd := range fields {
		applies, err := snapshot.FieldAppliesTo(fd.ID, a.CategoryID, assetModelID(a))
		if err != nil {
			return nil, err
		}
		if v := a.Attrs[fd.Key]; v != nil && applies {
			values[i] = fmt.Sprintf("%v", v)
		}
	}
	return values, nil
}

// exportFields is the category's fields, narrowed to the chosen keys.
//
// nil takes every field; a non-nil list selects. Filtered rather than
// reordered: the schema's order is the one the category page and the import
// template already use, and a CSV whose columns move about depending on the
// order boxes were ticked in is one nobody can write a formula against.
func exportFields(snapshot *schema.SchemaSnapshot, categoryID string, keys []string) ([]model.BoundField, error) {
	fields, err := snapshot.EveryPossibleField(categoryID)
	if err != nil {
		return nil, err
	}
	fields = schema.ActiveFields(fields)
	if keys == nil {
		return fields, nil
	}

	want := make(map[string]bool, len(keys))
	for _, k := range keys {
		want[k] = true
	}
	kept := fields[:0]
	for _, fd := range fields {
		if want[fd.Key] {
			kept = append(kept, fd)
		}
	}
	return kept, nil
}
