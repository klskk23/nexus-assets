package httpapi

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

// respondList answers a metadata list either as a page or as the whole thing.
//
// These lists are read two ways, and the difference is not cosmetic:
//
//   - as a table, which wants one page and a search box;
//   - as a lookup -- the category dropdown on the entry form, the holder
//     dropdown on a transfer, the role dropdown on an account -- which wants
//     every row, because a paged dropdown silently hides the option somebody
//     is looking for.
//
// So the envelope is opt-in: ask with q/offset/limit and get {items,total,...},
// ask with nothing and get the plain array these endpoints have always
// returned. That also keeps a promise this system has already made -- the
// label printer reads /api/categories as an array, and changing the shape
// would break its data sources the moment nexus was upgraded ahead of it.
//
// match decides whether a row satisfies the search. Filtering here rather than
// in SQL is deliberate at these sizes: every one of these tables is read whole
// by the same request anyway, and a WHERE clause per resource would be six
// more places for the search to mean something slightly different.
func respondList[T any](c *gin.Context, items []T, match func(T, string) bool) {
	if items == nil {
		items = []T{}
	}

	q := strings.TrimSpace(c.Query("q"))
	_, paged := c.GetQuery("limit")
	if _, ok := c.GetQuery("offset"); ok {
		paged = true
	}
	if q != "" {
		paged = true
	}
	if !paged {
		c.JSON(http.StatusOK, items)
		return
	}

	if q != "" && match != nil {
		kept := make([]T, 0, len(items))
		for _, it := range items {
			if match(it, q) {
				kept = append(kept, it)
			}
		}
		items = kept
	}

	offset, limit := Paging(c)
	total := len(items)
	if offset > total {
		offset = total
	}
	end := offset + limit
	if end > total {
		end = total
	}
	c.JSON(http.StatusOK, NewPage(items[offset:end], total, offset, limit))
}

// matches is the search every metadata list uses: case-insensitive, anywhere
// in any of the given fields. One rule, so "what does the search box do" has
// one answer on every page.
func matches(needle string, fields ...string) bool {
	needle = strings.ToLower(needle)
	for _, f := range fields {
		if strings.Contains(strings.ToLower(f), needle) {
			return true
		}
	}
	return false
}

// keep is the filter half, for the dropdowns beside the search box. Separate
// from the search because they answer different questions: search is "find me
// this", a filter is "only these".
func keep[T any](items []T, ok func(T) bool) []T {
	out := make([]T, 0, len(items))
	for _, it := range items {
		if ok(it) {
			out = append(out, it)
		}
	}
	return out
}
