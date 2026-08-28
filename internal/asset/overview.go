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
	// category and leaves retired devices out: "how many SDWAN routers do we
	// have" is a question about usable stock, and counting written-off units
	// gives a misleadingly large answer.
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

	rows, err := s.db.ReadDB().QueryContext(ctx,
		`SELECT status, count(*) FROM assets GROUP BY status`)
	if err != nil {
		return out, fmt.Errorf("count by status: %w", err)
	}
	byStatus := map[model.AssetStatus]int{}
	for rows.Next() {
		var st model.AssetStatus
		var n int
		if err := rows.Scan(&st, &n); err != nil {
			rows.Close()
			return out, err
		}
		byStatus[st] = n
		out.Total += n
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return out, err
	}

	out.StatusCounts = make([]StatusCount, 0, len(model.AllStatuses))
	for _, st := range model.AllStatuses {
		out.StatusCounts = append(out.StatusCounts, StatusCount{Status: st, Count: byStatus[st]})
	}

	categories, err := s.schema.ListCategories(ctx)
	if err != nil {
		return out, err
	}

	rows, err = s.db.ReadDB().QueryContext(ctx,
		`SELECT category_id, count(*) FROM assets WHERE status != ? GROUP BY category_id`,
		string(model.StatusRetired))
	if err != nil {
		return out, fmt.Errorf("count by category: %w", err)
	}
	perCategory := map[string]int{}
	for rows.Next() {
		var id string
		var n int
		if err := rows.Scan(&id, &n); err != nil {
			rows.Close()
			return out, err
		}
		perCategory[id] = n
	}
	rows.Close()
	if err := rows.Err(); err != nil {
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
