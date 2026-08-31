package httpapi

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/klskk23/nexus-assets/internal/i18n"

	"github.com/klskk23/nexus-assets/internal/audit"
	"github.com/klskk23/nexus-assets/internal/auth"
)

func (s *Server) listAudit(c *gin.Context) {
	offset, limit := Paging(c)

	f := audit.Filter{
		TargetType: c.Query("target_type"),
		TargetID:   c.Query("target_id"),
		Offset:     offset,
		Limit:      limit,
	}
	for _, spec := range []struct {
		param string
		dest  **time.Time
	}{{"from", &f.From}, {"to", &f.To}} {
		raw := c.Query(spec.param)
		if raw == "" {
			continue
		}
		t, err := time.Parse(time.RFC3339, raw)
		if err != nil {
			FailField(c, http.StatusUnprocessableEntity, spec.param, i18n.KeyTimeShapeRFC3339)
			return
		}
		*spec.dest = &t
	}

	page, err := s.audit.List(c.Request.Context(), f)
	if err != nil {
		FailErr(c, err)
		return
	}
	c.JSON(http.StatusOK, page)
}

// record writes an audit entry for a metadata change.
//
// Failing the request when the trail cannot be written is deliberate: an audit
// log with silent gaps invites trust it has not earned.
func (s *Server) record(c *gin.Context, action audit.Action, targetType audit.TargetType,
	targetID string, before, after any) bool {

	actor, _ := auth.CurrentUser(c)
	if err := s.audit.Record(c.Request.Context(), actor.ID, action, targetType, targetID, before, after); err != nil {
		FailErr(c, err)
		return false
	}
	return true
}
