package httpapi

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/klskk23/nexus-assets/internal/asset"
	"github.com/klskk23/nexus-assets/internal/model"
)

// recentTransferLimit is what the landing page shows.
const recentTransferLimit = 10

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
	recent, err := s.transfers.Recent(ctx, recentTransferLimit)
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
