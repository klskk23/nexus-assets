package httpapi

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// fieldAssetCount answers actual effective reach, deduplicated by asset identity.
func (s *Server) fieldAssetCount(c *gin.Context) {
	count, err := s.schema.FieldAssetCount(c.Request.Context(), c.Param("id"))
	if err != nil {
		FailErr(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"count": count})
}
