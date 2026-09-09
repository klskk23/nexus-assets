package asset

import (
	"context"
	"fmt"

	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/schema"
)

// StatusCount is one status and how many devices are in it.
type StatusCount struct {
	Status model.AssetStatus `json:"status"`
	Count  int               `json:"count"`
}

// CategoryCount is one top-level category and its total.
type CategoryCount struct {
	CategoryID string `json:"category_id"`
	Name       string `json:"name"`
	Count      int    `json:"count"`
}

// Overview is the landing page's summary.
type Overview struct {
	// StatusCounts covers every status, including the ones at zero, so the
	// cards do not appear and vanish as stock moves.
	StatusCounts []StatusCount `json:"status_counts"`
	// CategoryDistribution rolls every descendant up into its top-level
	// category and leaves out the statuses marked as not counting towards
	// stock: "how many SDWAN routers do we have" is a question about usable
	// stock, and counting written-off units gives a misleadingly large answer.
	CategoryDistribution []CategoryCount `json:"category_distribution"`
	// Total counts every asset, retired included.
	Total int `json:"total"`
}

// Overview builds the summary.
//
// Two queries plus the category list, regardless of how many categories exist.
// Counting each category with its own query would look harmless at four
// categories and turn the landing page into the slowest screen at forty.
func (s *Service) Overview(ctx context.Context) (Overview, error) {
	var out Overview

	byStatus, total, err := s.countByStatus(ctx)
	if err != nil {
		return out, err
	}
	out.Total = total

	statuses, err := s.schema.StatusSet(ctx)
	if err != nil {
		return out, err
	}
	all := statuses.All()
	out.StatusCounts = make([]StatusCount, 0, len(all))
	for _, st := range all {
		out.StatusCounts = append(out.StatusCounts, StatusCount{Status: st.Key, Count: byStatus[st.Key]})
		delete(byStatus, st.Key)
	}
	// A status that was deleted while devices still carried it would otherwise
	// vanish from the cards while still counting towards the total -- the one
	// arrangement that makes the numbers not add up.
	for st, n := range byStatus {
		out.StatusCounts = append(out.StatusCounts, StatusCount{Status: st, Count: n})
	}

	categories, err := s.schema.ListCategories(ctx)
	if err != nil {
		return out, err
	}

	// The roots' numbers are read out of the same map the categories page
	// shows beside every node -- not computed a second time here. Two callers
	// of one helper can still drift, because each does its own rolling up; one
	// map read twice cannot. That is what FR-007 asks for, and the reason the
	// rollup that used to live here is gone.
	subtree, err := s.subtreeCounts(ctx, statuses, categories)
	if err != nil {
		return out, err
	}

	out.CategoryDistribution = make([]CategoryCount, 0, len(categories))
	for _, c := range categories {
		if c.ParentID == nil {
			out.CategoryDistribution = append(out.CategoryDistribution,
				CategoryCount{CategoryID: c.ID, Name: c.Name, Count: subtree[c.ID]})
		}
	}
	return out, nil
}

// SubtreeCountsByCategory answers "how many devices are in this category",
// for every category, once.
//
// Every category is present, including the ones holding nothing: a missing key
// and a zero read differently on screen, and a tree row with a blank where a
// number belongs says "not loaded", not "none".
func (s *Service) SubtreeCountsByCategory(ctx context.Context) (map[string]int, error) {
	statuses, err := s.schema.StatusSet(ctx)
	if err != nil {
		return nil, err
	}
	categories, err := s.schema.ListCategories(ctx)
	if err != nil {
		return nil, err
	}
	return s.subtreeCounts(ctx, statuses, categories)
}

// subtreeCounts adds each category's own devices to itself and to every
// ancestor above it.
//
// AncestorIDs returns the whole chain *including the category itself*, so this
// loop already credits both. Appending the id again is the bug this is written
// to avoid: it doubles every leaf while leaving roots looking roughly right,
// which is the version nobody catches by reading the numbers.
func (s *Service) subtreeCounts(
	ctx context.Context, statuses model.StatusSet, categories []model.Category,
) (map[string]int, error) {
	direct, err := s.availableByCategory(ctx, statuses)
	if err != nil {
		return nil, err
	}

	pathByID := make(map[string]string, len(categories))
	out := make(map[string]int, len(categories))
	for _, c := range categories {
		pathByID[c.ID] = c.Path
		out[c.ID] = 0
	}
	for id, n := range direct {
		for _, anc := range schema.AncestorIDs(pathByID[id]) {
			// A category deleted between the two reads leaves counts with no
			// row to sit on; dropping them beats inventing a key for a
			// category the caller has never heard of.
			if _, known := out[anc]; known {
				out[anc] += n
			}
		}
	}
	return out, nil
}

// countByStatus is how many devices carry each status, and how many there are.
func (s *Service) countByStatus(ctx context.Context) (map[model.AssetStatus]int, int, error) {
	rows, err := s.db.ReadDB().QueryContext(ctx,
		`SELECT status, count(*) FROM assets GROUP BY status`)
	if err != nil {
		return nil, 0, fmt.Errorf("count by status: %w", err)
	}
	defer rows.Close()

	byStatus, total := map[model.AssetStatus]int{}, 0
	for rows.Next() {
		var st model.AssetStatus
		var n int
		if err := rows.Scan(&st, &n); err != nil {
			return nil, 0, err
		}
		byStatus[st] = n
		total += n
	}
	return byStatus, total, rows.Err()
}

// availableByCategory counts only what is on the shelf, per category.
//
// Which statuses count towards usable stock is a column now, so the filter is
// applied here rather than as a hardcoded `status != 'retired'`.
func (s *Service) availableByCategory(ctx context.Context, statuses model.StatusSet) (map[string]int, error) {
	rows, err := s.db.ReadDB().QueryContext(ctx,
		`SELECT category_id, status, count(*) FROM assets GROUP BY category_id, status`)
	if err != nil {
		return nil, fmt.Errorf("count by category: %w", err)
	}
	defer rows.Close()

	perCategory := map[string]int{}
	for rows.Next() {
		var id string
		var st model.AssetStatus
		var n int
		if err := rows.Scan(&id, &st, &n); err != nil {
			return nil, err
		}
		if statuses.CountsAsAvailable(st) {
			perCategory[id] += n
		}
	}
	return perCategory, rows.Err()
}

// CountsByModel is how many devices carry each model.
//
// One query for every model rather than one per model: the model page's rail
// shows this beside every row, and a vendor with sixty models would otherwise
// issue sixty requests. The same reasoning is already written above Overview.
//
// The filter is the one categories use -- statuses marked as not counting
// towards stock are left out. Not for symmetry: 024 settled that a system may
// only have one answer to "how many of these do we have", and both numbers
// appear on screens a person moves between. A model reading 42 where the
// category it sits in has already excluded a written-off unit is the kind of
// difference nobody can explain and everybody reports.
//
// Models with nothing on them are present at 0, for the reason every count in
// this codebase is: a blank where a digit belongs reads as "not loaded".
func (s *Service) CountsByModel(ctx context.Context) (map[string]int, error) {
	statuses, err := s.schema.StatusSet(ctx)
	if err != nil {
		return nil, err
	}
	models, err := s.schema.ListModels(ctx)
	if err != nil {
		return nil, err
	}
	out := make(map[string]int, len(models))
	for _, m := range models {
		out[m.ID] = 0
	}

	rows, err := s.db.ReadDB().QueryContext(ctx,
		`SELECT model_id, status, count(*) FROM assets WHERE model_id IS NOT NULL
		 GROUP BY model_id, status`)
	if err != nil {
		return nil, fmt.Errorf("count by model: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var id string
		var st model.AssetStatus
		var n int
		if err := rows.Scan(&id, &st, &n); err != nil {
			return nil, err
		}
		if _, known := out[id]; known && statuses.CountsAsAvailable(st) {
			out[id] += n
		}
	}
	return out, rows.Err()
}
