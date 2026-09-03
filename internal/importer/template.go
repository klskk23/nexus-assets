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
	"github.com/klskk23/nexus-assets/internal/i18n"
	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/schema"
	"github.com/klskk23/nexus-assets/internal/store"
)

// Fixed columns every template carries, ahead of the category's own fields.
const (
	ColModel = "model"
	// ColVendor is optional, and blank in most sheets: a model name that only
	// one supplier carries resolves without it. It exists for the case that
	// was previously a dead end -- two vendors with a product called X100 and
	// no way for a row to say which one it means.
	ColVendor = "vendor"
	ColHolder = "holder"
	ColNote   = "note"
)

// The label is a catalogue key, not a string: the sheet a person downloads is
// headed in their own language, while the second header row -- the machine
// keys -- is what the importer reads back either way.
var fixedColumns = []struct{ key, labelKey string }{
	{ColModel, i18n.KeyColModel},
	{ColVendor, i18n.KeyColVendor},
	{ColHolder, i18n.KeyColHolderLoc},
	{ColNote, i18n.KeyColNote},
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
func (s *Service) Columns(ctx context.Context, lang i18n.Lang, categoryID string) ([]string, []string, error) {
	fields, err := s.schema.EffectiveFields(ctx, categoryID)
	if err != nil {
		return nil, nil, err
	}
	fields = schema.ActiveFields(fields)

	keys := make([]string, 0, len(fields)+len(fixedColumns))
	labels := make([]string, 0, cap(keys))
	for _, c := range fixedColumns {
		keys = append(keys, c.key)
		labels = append(labels, i18n.M(c.labelKey).In(lang))
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
			label += i18n.M(i18n.KeyColRequired).In(lang)
		}
		labels = append(labels, label)
	}
	return keys, labels, nil
}

// Template renders the import template for one category.
//
// Two header rows: the first is prose for whoever fills the sheet in, the
// second is the machine key. Only the key row is read back, so renaming a field
// never invalidates a template someone already downloaded.
func (s *Service) Template(ctx context.Context, lang i18n.Lang, categoryID string) ([]byte, error) {
	keys, labels, err := s.Columns(ctx, lang, categoryID)
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
