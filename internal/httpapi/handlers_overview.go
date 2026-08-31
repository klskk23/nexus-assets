package httpapi

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"github.com/klskk23/nexus-assets/internal/asset"
	"github.com/klskk23/nexus-assets/internal/model"
)

// The landing page's recent-transfer list. Ten by default, and the caller may
// ask for fewer or a few more -- each entry is a multi-line block, so ten of
// them is already a long card on a page meant to be taken in at a glance.
//
// Clamped rather than rejected, like every other paging parameter here: a
// stale client asking for a thousand gets fifty, not an error.
const (
	recentTransferLimit    = 10
	maxRecentTransferLimit = 50
)

// recentLimit reads the requested size, falling back to the default.
func recentLimit(c *gin.Context) int {
	n, err := strconv.Atoi(c.Query("recent"))
	if err != nil || n <= 0 {
		return recentTransferLimit
	}
	if n > maxRecentTransferLimit {
		return maxRecentTransferLimit
	}
	return n
}

type overviewResponse struct {
	asset.Overview
	RecentTransfers []model.Transfer `json:"recent_transfers"`
}

func (s *Server) overview(c *gin.Context) {
	ctx := c.Request.Context()

	summary, err := s.assets.Overview(ctx)
	if err != nil {
		FailErr(c, err)
		return
	}
	recent, err := s.transfers.Recent(ctx, recentLimit(c))
	if err != nil {
		FailErr(c, err)
		return
	}
	if err := s.decorateTransfers(c, recent); err != nil {
		FailErr(c, err)
		return
	}
	if recent == nil {
		recent = []model.Transfer{}
	}
	c.JSON(http.StatusOK, overviewResponse{Overview: summary, RecentTransfers: recent})
}
