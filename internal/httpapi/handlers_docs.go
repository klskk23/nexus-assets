package httpapi

import (
	"embed"
	"net/http"
	"path"
	"strings"

	"github.com/gin-gonic/gin"
)

// docsFS carries Swagger UI and the contract it renders.
//
// Embedded rather than fetched from a CDN: this system runs on an internal
// network, and a documentation page that only works with internet access is a
// page that does not work when someone actually reaches for it.
//
//go:embed docs
var docsFS embed.FS

// openAPISpec serves the contract itself, for Swagger UI and for anything else
// that wants to generate a client.
func (s *Server) openAPISpec(c *gin.Context) {
	body, err := docsFS.ReadFile("docs/openapi.yaml")
	if err != nil {
		FailErr(c, err)
		return
	}
	c.Data(http.StatusOK, "application/yaml; charset=utf-8", body)
}

func (s *Server) docsIndex(c *gin.Context) {
	body, err := docsFS.ReadFile("docs/index.html")
	if err != nil {
		FailErr(c, err)
		return
	}
	c.Data(http.StatusOK, "text/html; charset=utf-8", body)
}

// docsAsset serves the Swagger UI bundle.
//
// The file name is taken apart rather than joined blindly: a path from the URL
// reaching ReadFile is how a directory traversal starts, even against an
// embedded filesystem.
func (s *Server) docsAsset(c *gin.Context) {
	name := path.Base(strings.TrimPrefix(c.Param("file"), "/"))
	if name == "" || name == "." || name == "/" {
		s.docsIndex(c)
		return
	}
	body, err := docsFS.ReadFile("docs/" + name)
	if err != nil {
		c.Status(http.StatusNotFound)
		return
	}
	c.Data(http.StatusOK, contentTypeOf(name), body)
}

func contentTypeOf(name string) string {
	switch path.Ext(name) {
	case ".css":
		return "text/css; charset=utf-8"
	case ".js":
		return "application/javascript; charset=utf-8"
	case ".png":
		return "image/png"
	case ".yaml", ".yml":
		return "application/yaml; charset=utf-8"
	default:
		return "application/octet-stream"
	}
}
