package importer

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/csv"
	"errors"
	"io"
	"strings"

	"github.com/klskk23/nexus-assets/internal/asset"
	"github.com/klskk23/nexus-assets/internal/i18n"
	"github.com/klskk23/nexus-assets/internal/model"
)

// bom is the UTF-8 byte order mark Excel expects on a CSV.
const bom = "\ufeff"

// ErrPreviewRollback is the sentinel used to abandon the dry-run transaction.
// It never reaches the caller.
var errPreviewRollback = errors.New("import preview: rolling back")

// RowResult is one line's verdict.
type RowResult struct {
	// Line is the spreadsheet row number the person sees, counting the two
	// header rows.
	Line   int    `json:"line"`
	Status string `json:"status"` // ok | error
	// Display is how the created asset will be referred to: the category's
	// display key, or the short UUID when the category has not nominated one.
	Display string            `json:"display,omitempty"`
	Fields  map[string]string `json:"fields,omitempty"`
}

// Report is the outcome of checking a whole file.
type Report struct {
	Total int         `json:"total"`
	OK    int         `json:"ok"`
	Rows  []RowResult `json:"rows"`
}

// Failed reports whether any row would be rejected.
func (r Report) Failed() bool { return r.OK != r.Total }

type parsedRow struct {
	line  int
	byKey map[string]string
}

// parse reads the two-row header and the data below it.
func parse(r io.Reader) ([]parsedRow, error) {
	cr := csv.NewReader(bytes.NewReader(stripBOM(r)))
	cr.FieldsPerRecord = -1

	records, err := cr.ReadAll()
	if err != nil {
		return nil, i18n.M(i18n.KeyImportParseFailed, err)
	}
	if len(records) < 2 {
		return nil, i18n.M(i18n.KeyImportNeedsHeaders)
	}

	// The second row carries the keys; the first is for the human filling it in.
	keys := make([]string, len(records[1]))
	for i, k := range records[1] {
		keys[i] = strings.TrimSpace(strings.TrimPrefix(k, bom))
	}

	var out []parsedRow
	for i, rec := range records[2:] {
		if isBlank(rec) {
			continue
		}
		byKey := make(map[string]string, len(keys))
		for j, k := range keys {
			if k == "" || j >= len(rec) {
				continue
			}
			byKey[k] = strings.TrimSpace(rec[j])
		}
		out = append(out, parsedRow{line: i + 3, byKey: byKey})
	}
	return out, nil
}

func isBlank(rec []string) bool {
	for _, v := range rec {
		if strings.TrimSpace(v) != "" {
			return false
		}
	}
	return true
}

func stripBOM(r io.Reader) []byte {
	b, err := io.ReadAll(r)
	if err != nil {
		return nil
	}
	return bytes.TrimPrefix(b, []byte(bom))
}

// Preview checks every row and writes nothing.
//
// The whole file runs through the real save pipeline inside one transaction
// that is always rolled back. That is what makes the check honest: a row is
// judged by exactly the rules that will apply on commit, and because earlier
// rows are inserted in the same transaction, a MAC repeated twice inside the
// file is caught just like a collision with an existing asset. Checking rows in
// isolation would let that pair through and fail at commit instead.
func (s *Service) Preview(ctx context.Context, lang i18n.Lang, categoryID, actorID string, file io.Reader) (Report, error) {
	rows, err := parse(file)
	if err != nil {
		return Report{}, err
	}
	return s.check(ctx, lang, categoryID, actorID, rows, nil)
}

// check runs the rows through the pipeline. With batchID nil it rolls back;
// with a batch id it commits.
func (s *Service) check(ctx context.Context, lang i18n.Lang, categoryID, actorID string,
	rows []parsedRow, batchID *string) (Report, error) {

	report := Report{Total: len(rows), Rows: make([]RowResult, 0, len(rows))}
	if len(rows) == 0 {
		return report, i18n.M(i18n.KeyImportNoRows)
	}

	look, err := s.buildLookups(ctx, categoryID)
	if err != nil {
		return report, err
	}

	commit := batchID != nil
	err = s.db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		report.Rows = report.Rows[:0]
		report.OK = 0

		for _, row := range rows {
			res := s.checkRow(ctx, tx, lang, categoryID, actorID, look, row, batchID)
			if res.Status == "ok" {
				report.OK++
			}
			report.Rows = append(report.Rows, res)
		}

		if !commit || report.Failed() {
			// Either a dry run, or a real run with a bad row: nothing is kept.
			return errPreviewRollback
		}
		return nil
	})
	if err != nil && !errors.Is(err, errPreviewRollback) {
		return report, err
	}
	return report, nil
}

func (s *Service) checkRow(ctx context.Context, tx *sql.Tx, lang i18n.Lang, categoryID, actorID string,
	look *lookups, row parsedRow, batchID *string) RowResult {

	res := RowResult{Line: row.line, Status: "error", Fields: map[string]string{}}

	in := asset.SaveInput{
		CategoryID: categoryID,
		Status:     model.StatusInStock,
		OwnerID:    actorID,
		ActorID:    actorID,
		Note:       row.byKey[ColNote],
		BatchID:    batchID,
		Attrs:      map[string]any{},
	}

	if name := row.byKey[ColModel]; name != "" {
		id, err := look.resolveModel(name)
		if err != nil {
			res.Fields[ColModel] = err.Error()
		} else if id != "" {
			in.ModelID = &id
		}
	}

	entity, err := look.resolveHolder(row.byKey[ColHolder])
	if err != nil {
		res.Fields[ColHolder] = i18n.Text(err, lang)
	} else {
		if entity.Type != model.EntityLocation {
			res.Fields[ColHolder] = i18n.M(i18n.KeyImportNotLocation, entity.Name).In(lang)
		}
		in.Holder = model.Holder{Type: model.HolderTypeEntity, ID: entity.ID}
	}

	for key, raw := range row.byKey {
		if key == ColModel || key == ColHolder || key == ColNote || raw == "" {
			continue
		}
		f, known := look.fieldByKey[key]
		if !known {
			// An unknown column is ignored rather than fatal: a template kept
			// from before a field was unbound should still import.
			continue
		}
		if f.Type == model.FieldReference {
			id, err := look.resolveReference(f, raw)
			if err != nil {
				res.Fields[key] = err.Error()
				continue
			}
			in.Attrs[key] = id
			continue
		}
		in.Attrs[key] = raw
	}

	if len(res.Fields) > 0 {
		return res
	}

	prep, err := s.assets.Prepare(ctx, in)
	if err != nil {
		collect(&res, err, lang)
		return res
	}
	created, err := s.assets.Persist(ctx, tx, prep)
	if err != nil {
		collect(&res, err, lang)
		return res
	}

	res.Status = "ok"
	res.Display = model.AssetDisplayName(created.ID, created.Attrs, look.displayKey)
	res.Fields = nil
	return res
}

// collect turns a pipeline error into per-field messages, keeping the row's
// verdict actionable rather than a bare failure.
//
// Rendered here rather than at the edge: a preview report is built for one
// request and shown to one reader, so the language is known and the result is
// a plain string the table can print.
func collect(res *RowResult, err error, lang i18n.Lang) {
	var fe asset.FieldErrors
	if errors.As(err, &fe) {
		for k, v := range fe.In(lang) {
			res.Fields[k] = v
		}
		return
	}
	res.Fields["_row"] = i18n.Text(err, lang)
}
