package httpapi

import (
	"net/http"
	"net/url"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/klskk23/nexus-assets/internal/i18n"

	"github.com/klskk23/nexus-assets/internal/asset"
	"github.com/klskk23/nexus-assets/internal/auth"
	"github.com/klskk23/nexus-assets/internal/importer"
)

// maxUploadBytes caps an uploaded file. A stocktake spreadsheet is measured in
// kilobytes; anything far larger is a mistake, and reading it into memory first
// is what makes the all-or-nothing transaction possible.
const maxUploadBytes = 8 << 20 // 8 MiB

func (s *Server) importTemplate(c *gin.Context) {
	body, err := s.importer.Template(c.Request.Context(), LangOf(c), c.Param("id"))
	if err != nil {
		FailErr(c, err)
		return
	}
	attachCSV(c, "import-template.csv", body)
}

func (s *Server) importPreview(c *gin.Context) {
	categoryID, file, ok := s.readUpload(c)
	if !ok {
		return
	}
	actor, _ := auth.CurrentUser(c)

	report, err := s.importer.Preview(c.Request.Context(), LangOf(c), categoryID, actor.ID, file)
	if err != nil {
		Fail(c, http.StatusUnprocessableEntity, CodeValidationFailed, userText(c, err), nil)
		return
	}
	c.JSON(http.StatusOK, report)
}

func (s *Server) importCommit(c *gin.Context) {
	categoryID, file, ok := s.readUpload(c)
	if !ok {
		return
	}
	actor, _ := auth.CurrentUser(c)

	res, err := s.importer.Commit(c.Request.Context(), LangOf(c), categoryID, actor.ID, file)
	if err != nil {
		// The report travels with the refusal so the page can keep showing
		// which rows are in the way instead of just saying it failed.
		c.AbortWithStatusJSON(http.StatusUnprocessableEntity, gin.H{
			"error": gin.H{
				"code":    CodeValidationFailed,
				"message": userText(c, err),
			},
			"report": res.Report,
		})
		return
	}
	c.JSON(http.StatusCreated, res)
}

// readUpload pulls the category and the file off a multipart request.
func (s *Server) readUpload(c *gin.Context) (string, *strings.Reader, bool) {
	categoryID := c.PostForm("category_id")
	if categoryID == "" {
		FailField(c, http.StatusBadRequest, "category_id", i18n.KeyImportNeedCat)
		return "", nil, false
	}

	header, err := c.FormFile("file")
	if err != nil {
		FailField(c, http.StatusBadRequest, "file", i18n.KeyImportNeedFile)
		return "", nil, false
	}
	if header.Size > maxUploadBytes {
		FailMsg(c, http.StatusRequestEntityTooLarge, CodeValidationFailed, i18n.KeyUploadTooLarge)
		return "", nil, false
	}

	f, err := header.Open()
	if err != nil {
		FailErr(c, err)
		return "", nil, false
	}
	defer f.Close()

	buf := make([]byte, header.Size)
	if _, err := f.Read(buf); err != nil && header.Size > 0 {
		FailErr(c, err)
		return "", nil, false
	}
	return categoryID, strings.NewReader(string(buf)), true
}

func (s *Server) exportCSV(c *gin.Context) {
	// The same filter the list page uses, so the export matches what the person
	// is looking at.
	f := asset.ListFilter{
		Q:                  c.Query("q"),
		CategoryID:         c.Query("category_id"),
		IncludeDescendants: c.DefaultQuery("include_descendants", "true") != "false",
		Status:             c.Query("status"),
		OwnerID:            c.Query("owner_id"),
		HolderType:         c.Query("holder_type"),
		HolderID:           c.Query("holder_id"),
		AttrFilters:        map[string]string{},
	}
	for k, v := range c.Request.URL.Query() {
		if key, ok := strings.CutPrefix(k, "attr."); ok && key != "" && len(v) > 0 {
			f.AttrFilters[key] = v[0]
		}
	}

	body, err := s.importer.Export(c.Request.Context(), LangOf(c), f)
	if err != nil {
		FailErr(c, err)
		return
	}
	attachCSV(c, "assets.csv", body)
}

func attachCSV(c *gin.Context, name string, body []byte) {
	c.Header("Content-Disposition", "attachment; filename*=UTF-8''"+url.PathEscape(name))
	c.Data(http.StatusOK, "text/csv; charset=utf-8", body)
}

var _ = importer.Report{}
