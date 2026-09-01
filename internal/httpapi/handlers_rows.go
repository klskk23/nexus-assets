package httpapi

import (
	"errors"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/klskk23/nexus-assets/internal/asset"
	"github.com/klskk23/nexus-assets/internal/i18n"
	"github.com/klskk23/nexus-assets/internal/importer"
)

// listRows is the tabular view of assets for anything outside this system.
//
// The JSON sibling of export.csv, with two differences that matter to a machine
// rather than to a person: the columns are field keys instead of labels, so a
// consumer binds to something that survives a rename, and the values come back
// as a page rather than a file.
//
// It authenticates like everything else, which means an API key works -- that
// is the point of it. A script, a spreadsheet or a label printer holds a key
// and reads the same rows the list page shows.
func (s *Server) listRows(c *gin.Context) {
	offset, limit := Paging(c)

	f := asset.ListFilter{
		Q:                  c.Query("q"),
		CategoryID:         c.Query("category_id"),
		IncludeDescendants: c.DefaultQuery("include_descendants", "true") != "false",
		Status:             c.Query("status"),
		OwnerID:            c.Query("owner_id"),
		HolderType:         c.Query("holder_type"),
		HolderID:           c.Query("holder_id"),
		AttrFilters:        map[string]string{},
		Offset:             offset,
		Limit:              limit,
	}
	// The selection travels as a list: "print the ones I ticked" is the whole
	// reason this endpoint takes ids at all.
	for _, id := range strings.Split(c.Query("ids"), ",") {
		if id = strings.TrimSpace(id); id != "" {
			f.IDs = append(f.IDs, id)
		}
	}
	for k, v := range c.Request.URL.Query() {
		if key, ok := strings.CutPrefix(k, "attr."); ok && key != "" && len(v) > 0 {
			f.AttrFilters[key] = v[0]
		}
	}

	page, err := s.importer.Rows(c.Request.Context(), LangOf(c), f)
	if err != nil {
		if errors.Is(err, importer.ErrRowsNeedCategory) {
			FailField(c, http.StatusUnprocessableEntity, "category_id", i18n.KeyRowsNeedCategory)
			return
		}
		FailErr(c, err)
		return
	}
	c.JSON(http.StatusOK, page)
}
