package httpapi

import (
	"strconv"

	"github.com/gin-gonic/gin"
)

// Page wraps a list response. Total is always present because the list page
// shows "1,847 items", which rules out keyset pagination.
type Page[T any] struct {
	Items  []T `json:"items"`
	Total  int `json:"total"`
	Offset int `json:"offset"`
	Limit  int `json:"limit"`
}

const (
	DefaultLimit = 50
	MaxLimit     = 200
)

// Paging reads offset and limit, clamping rather than rejecting so a stale
// bookmark never fails the whole page.
func Paging(c *gin.Context) (offset, limit int) {
	offset, _ = strconv.Atoi(c.Query("offset"))
	if offset < 0 {
		offset = 0
	}
	limit, _ = strconv.Atoi(c.Query("limit"))
	if limit <= 0 {
		limit = DefaultLimit
	}
	if limit > MaxLimit {
		limit = MaxLimit
	}
	return offset, limit
}

// NewPage builds a page response, never emitting a null items array.
func NewPage[T any](items []T, total, offset, limit int) Page[T] {
	if items == nil {
		items = []T{}
	}
	return Page[T]{Items: items, Total: total, Offset: offset, Limit: limit}
}
