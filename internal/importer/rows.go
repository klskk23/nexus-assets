package importer

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/klskk23/nexus-assets/internal/asset"
	"github.com/klskk23/nexus-assets/internal/i18n"
	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/schema"
)

// ErrRowsNeedCategory is returned when a tabular view is asked for without one.
var ErrRowsNeedCategory = errors.New("a category is required")

// SysPrefix marks the columns that belong to the system rather than to the
// category.
//
// The prefix is on the built-ins rather than on the fields because a field key
// is the category's own vocabulary: a label template reads better as ${mac}
// than as ${attr_mac}. Something has to give way when the two collide -- and a
// field keyed "sn" already exists -- so the system's columns are the ones that
// step aside.
const SysPrefix = "sys_"

// RowPage is the tabular view of assets that anything outside this system can
// consume: a spreadsheet, a report, a label printer.
//
// Column names are field keys rather than labels, so a consumer binds to
// something that does not change when someone renames a field for readability.
type RowPage struct {
	// Columns is the authoritative order; every row carries exactly these keys.
	Columns []string `json:"columns"`
	// Rows are all-string: what reads this renders it, and a label that says
	// "true" helps nobody.
	Rows        []map[string]string `json:"rows"`
	Total       int                 `json:"total"`
	Offset      int                 `json:"offset"`
	Limit       int                 `json:"limit"`
	GeneratedAt time.Time           `json:"generated_at"`
}

// rowLimit caps one page. Higher than the list page because a consumer
// refreshing a table wants it in as few round trips as possible.
const rowLimit = 1000

// Rows renders the assets matching a filter as columns and rows.
//
// The filter must name a category. Field keys are only unique within one
// category's chain, so across categories two columns called "rack" would be two
// unrelated fields sharing a name -- and a consumer has no way to tell. Refusing
// is the only honest answer; the caller splits its selection by category.
func (s *Service) Rows(ctx context.Context, lang i18n.Lang, f asset.ListFilter) (RowPage, error) {
	page := RowPage{Rows: []map[string]string{}, GeneratedAt: time.Now().UTC()}

	if f.CategoryID == "" {
		return page, i18n.Wrap(ErrRowsNeedCategory, i18n.KeyRowsNeedCategory)
	}
	if f.Limit <= 0 || f.Limit > rowLimit {
		f.Limit = rowLimit
	}

	bound, err := s.schema.EffectiveFields(ctx, f.CategoryID)
	if err != nil {
		return page, err
	}
	fields := schema.ActiveFields(bound)

	res, err := s.assets.List(ctx, f)
	if err != nil {
		return page, err
	}

	names, err := s.labels(ctx)
	if err != nil {
		return page, err
	}

	page.Columns = append(page.Columns,
		SysPrefix+"id", SysPrefix+"sn", SysPrefix+"category", SysPrefix+"status",
		SysPrefix+"holder", SysPrefix+"owner", SysPrefix+"model", SysPrefix+"vendor",
		SysPrefix+"note", SysPrefix+"created_at")
	for _, fd := range fields {
		page.Columns = append(page.Columns, fd.Key)
	}

	for _, a := range res.Items {
		row := map[string]string{
			SysPrefix + "id":         a.ID,
			SysPrefix + "sn":         a.DisplayName,
			SysPrefix + "category":   names.category[a.CategoryID],
			SysPrefix + "status":     names.statuses.Label(a.Status),
			SysPrefix + "holder":     names.holder(a.Holder),
			SysPrefix + "owner":      names.user[a.OwnerID],
			SysPrefix + "model":      names.modelName(a.ModelID),
			SysPrefix + "vendor":     names.modelVendor(a.ModelID),
			SysPrefix + "note":       a.Note,
			SysPrefix + "created_at": a.CreatedAt.Format("2006-01-02"),
		}
		for _, fd := range fields {
			row[fd.Key] = renderValue(a.Attrs[fd.Key], fd.Type, lang)
		}
		page.Rows = append(page.Rows, row)
	}

	page.Total = res.Total
	page.Offset = f.Offset
	page.Limit = f.Limit
	return page, nil
}

// renderValue turns a stored value into the string a person would read.
//
// Booleans especially: a label that says "true" tells a warehouse nothing, and
// the yes/no of the moment belongs to the reader's language.
func renderValue(v any, t model.FieldType, lang i18n.Lang) string {
	if v == nil {
		return ""
	}
	switch t {
	case model.FieldBoolean:
		b, ok := v.(bool)
		if !ok {
			b, _ = strconv.ParseBool(fmt.Sprintf("%v", v))
		}
		if b {
			return i18n.M(i18n.KeyYes).In(lang)
		}
		return i18n.M(i18n.KeyNo).In(lang)
	case model.FieldNumber:
		if f, ok := v.(float64); ok {
			return strings.TrimRight(strings.TrimRight(strconv.FormatFloat(f, 'f', -1, 64), "0"), ".")
		}
	}
	return fmt.Sprintf("%v", v)
}
