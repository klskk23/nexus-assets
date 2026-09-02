package httpapi

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// health says whether this process can still serve.
//
// Unauthenticated on purpose: it is read by a container runtime and a reverse
// proxy, neither of which holds a credential, and it says nothing a stranger
// could not learn by watching the port answer at all.
//
// It touches the database, because a process that is running and cannot read
// its own database is not healthy in any sense that matters -- and that is the
// failure a check on the socket alone would happily call fine.
func (s *Server) health(c *gin.Context) {
	var one int
	err := s.db.ReadDB().QueryRowContext(c.Request.Context(), "SELECT 1").Scan(&one)
	if err != nil {
		c.JSON(http.StatusServiceUnavailable,
			gin.H{"status": "unavailable", "version": s.cfg.Version})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ok", "version": s.cfg.Version})
}
