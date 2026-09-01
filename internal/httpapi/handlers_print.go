package httpapi

import (
	"errors"
	"log"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/klskk23/nexus-assets/internal/asset"
	"github.com/klskk23/nexus-assets/internal/i18n"
	"github.com/klskk23/nexus-assets/internal/printing"
	"github.com/klskk23/nexus-assets/internal/store"
)

// printBatch is one category's worth of a print request: the rows that share a
// category, and what the service said about them.
type printBatch struct {
	CategoryID   string `json:"category_id"`
	CategoryName string `json:"category_name"`
	Count        int    `json:"count"`
	// JobID is empty when the batch was refused before it reached a printer.
	JobID  string `json:"job_id,omitempty"`
	Status string `json:"status,omitempty"`
	// Error is the service's own sentence, or ours when the batch never left.
	Error  string                   `json:"error,omitempty"`
	Claims []printing.SequenceClaim `json:"claims,omitempty"`
}

// printAssets sends the ticked devices to the label service.
//
// One job per category, because a template belongs to a category and a field
// key only means something inside one: a single job spanning two categories
// would carry two different fields under one column name. The split is visible
// in the response so the page can say "8 devices, 2 categories, 2 jobs" rather
// than quietly doing something other than what was asked.
func (s *Server) printAssets(c *gin.Context) {
	if !s.printer.Configured() {
		FailMsg(c, http.StatusNotFound, CodeNotFound, i18n.KeyPrintNotConfigured)
		return
	}

	var req struct {
		IDs []string `json:"ids" binding:"required"`
		// Copies applies to every label in the request; the service caps it.
		Copies int `json:"copies"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || len(req.IDs) == 0 {
		FailMsg(c, http.StatusBadRequest, CodeValidationFailed, i18n.KeyNoAssetsSelected)
		return
	}

	assets, err := s.assets.List(c.Request.Context(), asset.ListFilter{IDs: req.IDs, Limit: len(req.IDs)})
	if err != nil {
		FailErr(c, err)
		return
	}
	if len(assets.Items) == 0 {
		FailMsg(c, http.StatusBadRequest, CodeValidationFailed, i18n.KeyNoAssetsSelected)
		return
	}

	// Grouped in the order the categories first appear, so the response reads
	// the way the list did.
	var order []string
	byCategory := map[string][]string{}
	for _, a := range assets.Items {
		if _, seen := byCategory[a.CategoryID]; !seen {
			order = append(order, a.CategoryID)
		}
		byCategory[a.CategoryID] = append(byCategory[a.CategoryID], a.ID)
	}

	lang := string(LangOf(c))
	// One key per submission, so a double click reprints nothing: the service
	// answers the repeat with the job it already made.
	batchKey := c.GetHeader("Idempotency-Key")
	if batchKey == "" {
		batchKey = store.NewID()
	}

	out := make([]printBatch, 0, len(order))
	for _, categoryID := range order {
		batch := printBatch{CategoryID: categoryID, Count: len(byCategory[categoryID])}

		cat, err := s.schema.GetCategory(c.Request.Context(), categoryID)
		if err != nil {
			FailErr(c, err)
			return
		}
		batch.CategoryName = cat.Name

		if cat.PrintPresetID == "" {
			// Not a failure of the printer: nobody has said what this category's
			// label looks like, and only a person can answer that.
			batch.Error = i18n.M(i18n.KeyPrintNoPreset, cat.Name).In(LangOf(c))
			out = append(out, batch)
			continue
		}

		rows, err := s.importer.Rows(c.Request.Context(), LangOf(c), asset.ListFilter{
			CategoryID:         categoryID,
			IncludeDescendants: false,
			IDs:                byCategory[categoryID],
			Limit:              len(byCategory[categoryID]),
		})
		if err != nil {
			FailErr(c, err)
			return
		}

		body := map[string]any{"columns": rows.Columns, "rows": rows.Rows}
		if req.Copies > 0 {
			body["copies"] = req.Copies
		}
		job, err := s.printer.Print(c.Request.Context(), cat.PrintPresetID, body,
			batchKey+":"+categoryID, lang)
		if err != nil {
			var refused *printing.Rejection
			if errors.As(err, &refused) {
				batch.Error = refused.Error()
			} else {
				// The service is unreachable, or answered with something that
				// is not a job. The reader gets one sentence; the cause goes to
				// the log, where the administrator is.
				log.Printf("print: %s: %v", cat.Name, err)
				batch.Error = i18n.M(i18n.KeyPrintUnreachable).In(LangOf(c))
			}
			out = append(out, batch)
			continue
		}
		batch.JobID, batch.Status, batch.Claims = job.ID, job.Status, job.Claims
		out = append(out, batch)
	}

	c.JSON(http.StatusOK, gin.H{"batches": out})
}

// printJobStatus relays what the service says about one job.
//
// A relay rather than a link the page follows itself: the print service sends
// no CORS headers, so a browser on this origin cannot read it directly. That is
// its choice and a reasonable one; carrying the answer across is ours.
func (s *Server) printJobStatus(c *gin.Context) {
	if !s.printer.Configured() {
		FailMsg(c, http.StatusNotFound, CodeNotFound, i18n.KeyPrintNotConfigured)
		return
	}
	id := strings.TrimSpace(c.Param("id"))
	if id == "" {
		FailMsg(c, http.StatusBadRequest, CodeValidationFailed, i18n.KeyBadRequest)
		return
	}

	job, err := s.printer.Status(c.Request.Context(), id, string(LangOf(c)))
	if err != nil {
		var refused *printing.Rejection
		if errors.As(err, &refused) {
			Fail(c, refused.Status, CodeReferenceBlocked, refused.Error(), nil)
			return
		}
		log.Printf("print status %s: %v", id, err)
		FailMsg(c, http.StatusBadGateway, CodeInternal, i18n.KeyPrintUnreachable)
		return
	}
	c.JSON(http.StatusOK, job)
}

// printingAvailable tells the interface whether to offer printing at all.
func (s *Server) printingAvailable(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"printing": s.printer.Configured()})
}
