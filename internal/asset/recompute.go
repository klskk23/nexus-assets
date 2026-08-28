package asset

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/klskk23/nexus-assets/internal/compute"
	"github.com/klskk23/nexus-assets/internal/schema"
	"github.com/klskk23/nexus-assets/internal/store"
)

// ErrRecomputeConflict reports that the new rule would give two devices the
// same number.
var ErrRecomputeConflict = errors.New("the new rule produces duplicate serial numbers")

// Conflict is one collision the new rule would cause.
type Conflict struct {
	SN     string   `json:"sn"`
	Assets []string `json:"assets"` // the old serial numbers involved
}

// RecomputeReport is what a run produced.
type RecomputeReport struct {
	// Affected counts assets whose number would change.
	Affected int `json:"affected"`
	// Total is how many assets the rule was applied to.
	Total     int        `json:"total"`
	Conflicts []Conflict `json:"conflicts"`
	// Applied is false for a dry run, and false for a real run that was
	// rolled back because of a conflict.
	Applied bool `json:"applied"`
	// Samples shows a few before/after pairs so the operator can sanity-check
	// the rule before committing to it.
	Samples []RecomputeSample `json:"samples"`
}

// RecomputeSample is one before/after pair.
type RecomputeSample struct {
	From string `json:"from"`
	To   string `json:"to"`
}

const maxSamples = 5

// RecomputeSN re-derives the serial number of every asset in a category
// subtree.
//
// Two phases on purpose. Changing a rule that governs thousands of devices is
// not something to discover the consequences of afterwards, so a dry run
// reports the blast radius and any collisions first. The real run is one
// transaction: if a single pair of devices would end up sharing a number the
// whole thing is abandoned, because a half-renumbered warehouse is worse than
// an un-renumbered one.
func (s *Service) RecomputeSN(ctx context.Context, categoryID string, dryRun bool) (RecomputeReport, error) {
	var report RecomputeReport

	root, err := s.schema.GetCategory(ctx, categoryID)
	if err != nil {
		return report, err
	}
	templates, err := s.schema.SNTemplates(ctx)
	if err != nil {
		return report, err
	}
	categories, err := s.schema.ListCategories(ctx)
	if err != nil {
		return report, err
	}
	catByID := make(map[string]struct{ code, name, path string }, len(categories))
	for _, c := range categories {
		catByID[c.ID] = struct{ code, name, path string }{c.Code, c.Name, c.Path}
	}

	rows, err := s.db.ReadDB().QueryContext(ctx,
		`SELECT a.id, a.sn, a.category_id, a.model_id, a.attrs
		 FROM assets a JOIN categories c ON c.id = a.category_id
		 WHERE c.path LIKE ? || '%'
		 ORDER BY a.created_at, a.id`, root.Path)
	if err != nil {
		return report, fmt.Errorf("load subtree assets: %w", err)
	}
	defer rows.Close()

	type change struct{ id, oldSN, newSN string }
	var changes []change
	// Numbers that will exist once the run completes, so a collision between
	// two recomputed assets is caught as well as one against an untouched row.
	claimed := map[string][]string{}

	for rows.Next() {
		var id, oldSN, catID, attrsJSON string
		var modelID sql.NullString
		if err := rows.Scan(&id, &oldSN, &catID, &modelID, &attrsJSON); err != nil {
			return report, err
		}
		report.Total++

		attrs, err := store.UnmarshalJSONMap(attrsJSON)
		if err != nil {
			return report, err
		}
		cat := catByID[catID]
		tmpl, _ := schema.ResolveSNTemplate(cat.path, templates)
		if tmpl == "" {
			return report, FieldErrors{"sn": fmt.Sprintf("类别「%s」及其上级都没有编号生成规则", cat.name)}
		}

		var modelName, modelVendor string
		if modelID.Valid && modelID.String != "" {
			pm, err := s.schema.GetModel(ctx, modelID.String)
			if err == nil {
				modelName, modelVendor = pm.Name, pm.Vendor
			}
		}

		newSN, err := compute.Eval("sn", tmpl, compute.NewContext(id, attrs, cat.code, cat.name, modelName, modelVendor))
		if err != nil {
			return report, FieldErrors{"sn": fmt.Sprintf("资产 %s 的编号无法生成：%v", oldSN, err)}
		}

		claimed[newSN] = append(claimed[newSN], oldSN)
		if newSN != oldSN {
			changes = append(changes, change{id: id, oldSN: oldSN, newSN: newSN})
			if len(report.Samples) < maxSamples {
				report.Samples = append(report.Samples, RecomputeSample{From: oldSN, To: newSN})
			}
		}
	}
	if err := rows.Err(); err != nil {
		return report, err
	}
	report.Affected = len(changes)

	for sn, owners := range claimed {
		if len(owners) > 1 {
			report.Conflicts = append(report.Conflicts, Conflict{SN: sn, Assets: owners})
		}
	}
	if err := s.collideWithUntouched(ctx, root.Path, claimed, &report); err != nil {
		return report, err
	}

	if dryRun || len(report.Conflicts) > 0 || report.Affected == 0 {
		return report, nil
	}

	now := time.Now().UTC()
	err = s.db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		for _, c := range changes {
			if _, err := tx.ExecContext(ctx,
				`INSERT INTO asset_sn_history (asset_id, sn, replaced_at) VALUES (?, ?, ?)`,
				c.id, c.oldSN, store.FormatTime(now)); err != nil {
				return err
			}
			// The unique index is the last line of defence; a violation here
			// aborts the whole transaction, which is the intended behaviour.
			if _, err := tx.ExecContext(ctx,
				`UPDATE assets SET sn = ?, updated_at = ? WHERE id = ?`,
				c.newSN, store.FormatTime(now), c.id); err != nil {
				return fmt.Errorf("%w: %v", ErrRecomputeConflict, err)
			}
		}
		return nil
	})
	if err != nil {
		return report, err
	}
	report.Applied = true
	return report, nil
}

// collideWithUntouched checks the proposed numbers against assets outside the
// subtree and against retired numbers, which stay reserved so an old label can
// never point at a different device.
func (s *Service) collideWithUntouched(ctx context.Context, rootPath string,
	claimed map[string][]string, report *RecomputeReport) error {

	for sn, owners := range claimed {
		var otherSN string
		err := s.db.ReadDB().QueryRowContext(ctx,
			`SELECT a.sn FROM assets a JOIN categories c ON c.id = a.category_id
			 WHERE a.sn = ? AND c.path NOT LIKE ? || '%' LIMIT 1`, sn, rootPath).Scan(&otherSN)
		if err == nil {
			report.Conflicts = append(report.Conflicts, Conflict{SN: sn, Assets: append(owners, otherSN)})
			continue
		}
		if !errors.Is(err, sql.ErrNoRows) {
			return err
		}

		var histFor string
		err = s.db.ReadDB().QueryRowContext(ctx,
			`SELECT h.sn FROM asset_sn_history h
			 JOIN assets a ON a.id = h.asset_id
			 WHERE h.sn = ? AND a.sn != ? LIMIT 1`, sn, sn).Scan(&histFor)
		if err == nil {
			report.Conflicts = append(report.Conflicts, Conflict{SN: sn, Assets: append(owners, "(已退役编号)")})
			continue
		}
		if !errors.Is(err, sql.ErrNoRows) {
			return err
		}
	}
	return nil
}
