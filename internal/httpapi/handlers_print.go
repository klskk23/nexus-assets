package httpapi

import (
	"errors"
	"log"
	"net/http"
	"slices"
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
	// Presets are this category's labels, named the way the print service names
	// them. Empty when that service cannot be asked -- the batch still goes,
	// and the confirmation just says less.
	Presets []printing.Preset `json:"presets,omitempty"`
	// PresetID is the label this batch will use, or did.
	PresetID   string `json:"preset_id,omitempty"`
	PresetName string `json:"preset_name,omitempty"`
	// Numbers are the devices about to be printed, as they read on screen.
	// The confirmation is only worth pressing if it says which labels are
	// coming out, not just how many.
	Numbers []string `json:"numbers,omitempty"`
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

	var req printAssetsRequest
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
	numbers := map[string][]string{}
	for _, a := range assets.Items {
		if _, seen := byCategory[a.CategoryID]; !seen {
			order = append(order, a.CategoryID)
		}
		byCategory[a.CategoryID] = append(byCategory[a.CategoryID], a.ID)
		numbers[a.CategoryID] = append(numbers[a.CategoryID], a.DisplayName)
	}

	lang := string(LangOf(c))
	// One key per submission, so a double click reprints nothing: the service
	// answers the repeat with the job it already made.
	batchKey := c.GetHeader("Idempotency-Key")
	if batchKey == "" {
		batchKey = store.NewID()
	}

	// Named only for the confirmation, and only when the service answers:
	// a printer that is down must not stop someone from seeing what they
	// would have printed.
	known := map[string]printing.Preset{}
	if presets, err := s.printer.Presets(c.Request.Context(), lang); err == nil {
		for _, p := range presets {
			known[p.ID] = p
		}
	} else if !req.DryRun {
		// A real run only needs the names for the response; a printer that
		// cannot be listed may still print.
		log.Printf("print: cannot name presets: %v", err)
	}

	out := make([]printBatch, 0, len(order))
	for _, categoryID := range order {
		batch, err := s.printOne(c, categoryID, byCategory[categoryID],
			numbers[categoryID], req, known, batchKey, lang)
		if err != nil {
			// The ledger itself failed, which is not something one batch can
			// carry: nothing further would be trustworthy.
			FailErr(c, err)
			return
		}
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

// nameOr falls back to the id when the print service could not be asked, so a
// list with no names is still a list rather than a row of blanks.
func nameOr(known map[string]printing.Preset, id string) string {
	if p, ok := known[id]; ok && p.Name != "" {
		return p.Name
	}
	return id
}

// printPresets relays what the print service can print.
//
// Relayed for the same reason job status is: the service sends no CORS headers,
// so the page cannot ask it directly. It turns the category setting from a
// pasted identifier into a menu.
func (s *Server) printPresets(c *gin.Context) {
	if !s.printer.Configured() {
		FailMsg(c, http.StatusNotFound, CodeNotFound, i18n.KeyPrintNotConfigured)
		return
	}
	presets, err := s.printer.Presets(c.Request.Context(), string(LangOf(c)))
	if err != nil {
		var refused *printing.Rejection
		if errors.As(err, &refused) {
			Fail(c, http.StatusBadGateway, CodeInternal, refused.Error(), nil)
			return
		}
		log.Printf("print presets: %v", err)
		FailMsg(c, http.StatusBadGateway, CodeInternal, i18n.KeyPrintUnreachable)
		return
	}
	if presets == nil {
		presets = []printing.Preset{}
	}
	c.JSON(http.StatusOK, gin.H{"presets": presets})
}

// refreshPrintSource makes the print service re-read this category before
// somebody looks at a label built from it.
//
// The label designer over there works from the service's own copy of our rows.
// Opening a label from here used to land on a table that was as old as the
// last time anybody pressed refresh in that interface -- so the device you
// came to check would show yesterday's holder, and nothing on either screen
// would say why.
//
// Relayed rather than called from the page for the reason every other call to
// that service is: it sends no CORS headers.
//
// A category with no table connected is not a failure. Nobody has to connect
// one, and saying so plainly is more useful than an error that suggests
// something broke.
func (s *Server) refreshPrintSource(c *gin.Context) {
	if !s.printer.Configured() {
		FailMsg(c, http.StatusNotFound, CodeNotFound, i18n.KeyPrintNotConfigured)
		return
	}
	var req struct {
		CategoryID string `json:"category_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		FailMsg(c, http.StatusBadRequest, CodeValidationFailed, i18n.KeyBadRequest)
		return
	}

	lang := string(LangOf(c))
	sources, err := s.printer.DataSources(c.Request.Context(), lang)
	if err != nil {
		printServiceFailed(c, "print data sources", err)
		return
	}

	// Every table bound to this category, not the first: two labels wanting
	// different columns is a reason somebody makes a second one, and leaving
	// one of them stale would be the bug this endpoint exists to remove.
	refreshed := []gin.H{}
	for _, src := range sources {
		if src.SourceKind != "nexus" || src.Nexus == nil || src.Nexus.CategoryID != req.CategoryID {
			continue
		}
		out, err := s.printer.RefreshDataSource(c.Request.Context(), src.ID, lang)
		if err != nil {
			printServiceFailed(c, "refresh data source "+src.ID, err)
			return
		}
		refreshed = append(refreshed, gin.H{
			"id": src.ID, "name": src.Name, "outcome": out.Outcome,
			"rows": out.RowsAfter, "added": out.Added,
			"updated": out.Updated, "removed": out.Removed,
		})
	}
	c.JSON(http.StatusOK, gin.H{"sources": refreshed})
}

// printServiceFailed answers for a call the print service would not complete.
//
// Its refusals carry a sentence written for a reader, so that one is passed
// through; anything else is the service being unreachable, which is a
// different sentence and a different thing to do about it.
func printServiceFailed(c *gin.Context, what string, err error) {
	var refused *printing.Rejection
	if errors.As(err, &refused) {
		Fail(c, http.StatusBadGateway, CodeInternal, refused.Error(), nil)
		return
	}
	log.Printf("%s: %v", what, err)
	FailMsg(c, http.StatusBadGateway, CodeInternal, i18n.KeyPrintUnreachable)
}

// printingAvailable tells the interface whether to offer printing at all, and
// where the print service lives.
//
// The address is handed over so a page can link to it: when a batch looks
// wrong, or a label needs editing, somebody has to be able to get there. The
// browser must be able to reach that address for the link to be worth
// anything, so there is nothing to hide by withholding it.
func (s *Server) printingAvailable(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"printing":     s.printer.Configured(),
		"printing_url": s.cfg.PrinterURL,
	})
}

// printAssetsRequest is what the page asks for.
type printAssetsRequest struct {
	IDs []string `json:"ids" binding:"required"`
	// Copies applies to every label in the request; the service caps it.
	Copies int `json:"copies"`
	// Presets chooses which label each category prints, by category id. A
	// category with one label needs no entry; one with several does, because
	// nothing here can guess which of them was meant.
	Presets map[string]string `json:"presets"`
	// DryRun works out what would be printed without printing it. Paper comes
	// out of a real machine in another room, so the person pressing the button
	// is shown what they are about to spend first.
	DryRun bool `json:"dry_run"`
}

// printOne assembles one category's batch, and submits it unless this is a dry
// run.
//
// A returned error is fatal to the whole request. Anything the batch alone is
// refused for goes in batch.Error instead: the other categories still print,
// and the response says which ones did not.
func (s *Server) printOne(c *gin.Context, categoryID string, ids, numbers []string,
	req printAssetsRequest, known map[string]printing.Preset, batchKey, lang string) (printBatch, error) {

	batch := printBatch{CategoryID: categoryID, Count: len(ids), Numbers: numbers}

	cat, err := s.schema.GetCategory(c.Request.Context(), categoryID)
	if err != nil {
		return batch, err
	}
	batch.CategoryName = cat.Name

	for _, id := range cat.PrintPresetIDs {
		p, ok := known[id]
		if !ok {
			// Configured here but not there any more, or the service could not
			// be asked. Either way it is still what this category points at, so
			// it is listed under the only name available.
			p = printing.Preset{ID: id, Name: id}
		}
		batch.Presets = append(batch.Presets, p)
	}

	chosen, ok := choosePreset(cat.PrintPresetIDs, req, categoryID)
	switch {
	case len(cat.PrintPresetIDs) == 0:
		// Not a failure of the printer: nobody has said what this category's
		// label looks like, and only a person can answer that.
		batch.Error = i18n.M(i18n.KeyPrintNoPreset, cat.Name).In(LangOf(c))
		return batch, nil
	case !ok && req.DryRun:
		// The confirmation is where the choice gets made, so it says what there
		// is to choose from rather than refusing.
		batch.PresetID = cat.PrintPresetIDs[0]
		batch.PresetName = batch.Presets[0].Name
		return batch, nil
	case !ok:
		// Either nothing was chosen where a choice was needed, or something
		// outside this category's labels was. Both are the same refusal: this
		// category prints these, pick one of them.
		batch.Error = i18n.M(i18n.KeyPrintPresetNotChosen, cat.Name).In(LangOf(c))
		return batch, nil
	}

	batch.PresetID = chosen
	batch.PresetName = nameOr(known, chosen)
	if req.DryRun {
		// Everything above is what the confirmation needs: how many labels,
		// under which category, and whether anything stands in the way.
		return batch, nil
	}

	rows, err := s.importer.Rows(c.Request.Context(), LangOf(c), asset.ListFilter{
		CategoryID:         categoryID,
		IncludeDescendants: false,
		IDs:                ids,
		Limit:              len(ids),
	})
	if err != nil {
		return batch, err
	}

	body := map[string]any{"columns": rows.Columns, "rows": rows.Rows}
	if req.Copies > 0 {
		body["copies"] = req.Copies
	}
	job, err := s.printer.Print(c.Request.Context(), chosen, body, batchKey+":"+categoryID, lang)
	if err != nil {
		var refused *printing.Rejection
		if errors.As(err, &refused) {
			batch.Error = refused.Error()
			return batch, nil
		}
		// The service is unreachable, or answered with something that is not a
		// job. The reader gets one sentence; the cause goes to the log, where
		// the administrator is.
		log.Printf("print: %s: %v", cat.Name, err)
		batch.Error = i18n.M(i18n.KeyPrintUnreachable).In(LangOf(c))
		return batch, nil
	}
	batch.JobID, batch.Status, batch.Claims = job.ID, job.Status, job.Claims
	return batch, nil
}

// choosePreset decides which of a category's labels this batch prints.
//
// Not ok means the caller has to say: either nothing was chosen where a choice
// was needed, or something that is not one of this category's labels was.
func choosePreset(available []string, req printAssetsRequest, categoryID string) (string, bool) {
	chosen := req.Presets[categoryID]
	if chosen == "" && len(available) == 1 {
		// One label is not a choice.
		chosen = available[0]
	}
	return chosen, slices.Contains(available, chosen)
}
