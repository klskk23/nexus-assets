package importer

import (
	"archive/zip"
	"bytes"
	"context"
	"fmt"
	"strings"

	"github.com/klskk23/nexus-assets/internal/asset"
	"github.com/klskk23/nexus-assets/internal/i18n"
)

// ExportFile is one CSV, named for the category it holds.
type ExportFile struct {
	CategoryID   string
	CategoryName string
	Name         string
	Body         []byte
}

// ExportSelected renders the given devices, one CSV per category.
//
// Ticking rows in the list is not the same request as filtering: the selection
// can span categories, and one CSV cannot hold two of them -- past the fixed
// columns, a category's columns are its own fields, and two categories put
// different meanings under one header. So each gets a file of its own.
//
// The fields are every field of each category. Choosing columns stays a
// single-category affair: a picker over the union of two categories' fields
// offers combinations that describe neither.
func (s *Service) ExportSelected(ctx context.Context, lang i18n.Lang, ids []string) ([]ExportFile, error) {
	if len(ids) == 0 {
		return nil, i18n.Wrap(ErrExportNeedsCategory, i18n.KeyExportNeedCat)
	}

	res, err := s.assets.List(ctx, asset.ListFilter{IDs: ids, Limit: len(ids)})
	if err != nil {
		return nil, err
	}

	// Grouped in the order the categories first appear, so the files come out
	// in the order the list read.
	var order []string
	byCategory := map[string][]string{}
	for _, a := range res.Items {
		if _, seen := byCategory[a.CategoryID]; !seen {
			order = append(order, a.CategoryID)
		}
		byCategory[a.CategoryID] = append(byCategory[a.CategoryID], a.ID)
	}
	if len(order) == 0 {
		return nil, i18n.Wrap(ErrExportNeedsCategory, i18n.KeyExportNeedCat)
	}

	categories, err := s.schema.ListCategories(ctx)
	if err != nil {
		return nil, err
	}
	name := make(map[string]string, len(categories))
	for _, c := range categories {
		name[c.ID] = c.Name
	}

	out := make([]ExportFile, 0, len(order))
	used := map[string]int{}
	for _, categoryID := range order {
		body, err := s.Export(ctx, lang, asset.ListFilter{
			CategoryID: categoryID,
			// Only the ticked ones, and only this category's: descendants are
			// irrelevant when the rows were named one by one.
			IncludeDescendants: false,
			IDs:                byCategory[categoryID],
		}, nil)
		if err != nil {
			return nil, err
		}
		out = append(out, ExportFile{
			CategoryID:   categoryID,
			CategoryName: name[categoryID],
			Name:         fileName(name[categoryID], categoryID, used),
			Body:         body,
		})
	}
	return out, nil
}

// fileName is a category's name, made safe for an archive entry and made
// unique -- two categories may share a name under different parents, and a zip
// with two identical entries loses one of them silently.
func fileName(categoryName, categoryID string, used map[string]int) string {
	base := strings.TrimSpace(categoryName)
	base = strings.Map(func(r rune) rune {
		if strings.ContainsRune(`/\:*?"<>|`, r) || r < 0x20 {
			return '-'
		}
		return r
	}, base)
	if base == "" {
		base = categoryID
	}
	used[base]++
	if n := used[base]; n > 1 {
		return fmt.Sprintf("%s (%d).csv", base, n)
	}
	return base + ".csv"
}

// Zip packs several CSVs into one download.
func Zip(files []ExportFile) ([]byte, error) {
	var buf bytes.Buffer
	w := zip.NewWriter(&buf)
	for _, f := range files {
		e, err := w.Create(f.Name)
		if err != nil {
			return nil, err
		}
		if _, err := e.Write(f.Body); err != nil {
			return nil, err
		}
	}
	if err := w.Close(); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}
