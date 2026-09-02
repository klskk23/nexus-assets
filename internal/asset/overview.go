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

	perCategory, err := s.availableByCategory(ctx, statuses)
	if err != nil {
		return out, err
	}

	// Roll each category up to the root of its chain, in memory.
	roots := map[string]*CategoryCount{}
	order := []string{}
	pathByID := make(map[string]string, len(categories))
	nameByID := make(map[string]string, len(categories))
	for _, c := range categories {
		pathByID[c.ID] = c.Path
		nameByID[c.ID] = c.Name
		if c.ParentID == nil {
			roots[c.ID] = &CategoryCount{CategoryID: c.ID, Name: c.Name}
			order = append(order, c.ID)
		}
	}
	for id, n := range perCategory {
		ids := schema.AncestorIDs(pathByID[id])
		if len(ids) == 0 {
			continue
		}
		if root, ok := roots[ids[0]]; ok {
			root.Count += n
		}
	}

	out.CategoryDistribution = make([]CategoryCount, 0, len(order))
	for _, id := range order {
		out.CategoryDistribution = append(out.CategoryDistribution, *roots[id])
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
