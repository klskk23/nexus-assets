// Package importer moves existing devices in and out as CSV.
package importer

import (
	"bytes"
	"context"
	"encoding/csv"
	"fmt"

	"github.com/klskk23/nexus-assets/internal/asset"
	"github.com/klskk23/nexus-assets/internal/auth"
	"github.com/klskk23/nexus-assets/internal/holder"
	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/schema"
	"github.com/klskk23/nexus-assets/internal/store"
)

// Fixed columns every template carries, ahead of the category's own fields.
const (
	ColModel  = "model"
	ColHolder = "holder"
	ColNote   = "note"
)

var fixedColumns = []struct{ key, label string }{
	{ColModel, "型号"},
	{ColHolder, "持有方（位置名称）"},
	{ColNote, "备注"},
}

// Service builds templates, previews files and commits them.
type Service struct {
	db      *store.Store
	schema  *schema.Store
	holders *holder.Store
	users   *auth.Store
	assets  *asset.Service
}

// New builds the import service.
func New(db *store.Store, sch *schema.Store, holders *holder.Store,
	users *auth.Store, assets *asset.Service) *Service {
	return &Service{db: db, schema: sch, holders: holders, users: users, assets: assets}
}

// Columns returns the template's columns for one category: the fixed ones
// followed by every field the category asks for, computed fields excluded.
func (s *Service) Columns(ctx context.Context, categoryID string) ([]string, []string, error) {
	fields, err := s.schema.EffectiveFields(ctx, categoryID)
	if err != nil {
		return nil, nil, err
	}
	fields = schema.ActiveFields(fields)

	keys := make([]string, 0, len(fields)+len(fixedColumns))
	labels := make([]string, 0, cap(keys))
	for _, c := range fixedColumns {
		keys = append(keys, c.key)
		labels = append(labels, c.label)
	}
	for _, f := range fields {
		// A computed value is derived, never supplied, so offering a column for
		// it would invite someone to fill it in and have it silently ignored.
		if f.Type == model.FieldComputed {
			continue
		}
		keys = append(keys, f.Key)
		label := f.Label
		if f.Required {
			label += "（必填）"
		}
		labels = append(labels, label)
	}
	return keys, labels, nil
}

// Template renders the import template for one category.
//
// Two header rows: the first is Chinese for whoever fills the sheet in, the
// second is the machine key. Only the key row is read back, so renaming a field
// never invalidates a template someone already downloaded.
func (s *Service) Template(ctx context.Context, categoryID string) ([]byte, error) {
	keys, labels, err := s.Columns(ctx, categoryID)
	if err != nil {
		return nil, err
	}

	var buf bytes.Buffer
	// A BOM so Excel opens the file as UTF-8 rather than mangling the Chinese.
	buf.WriteString(bom)
	w := csv.NewWriter(&buf)
	if err := w.Write(labels); err != nil {
		return nil, fmt.Errorf("write label row: %w", err)
	}
	if err := w.Write(keys); err != nil {
		return nil, fmt.Errorf("write key row: %w", err)
	}
	w.Flush()
	if err := w.Error(); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}
