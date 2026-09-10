package httpapi

import (
	"context"
	"net/http"
	"sort"
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
	if err := s.nameOwners(ctx, summary.OwnerDistribution); err != nil {
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

// categoryCounts is how many devices sit in each category, subtree included.
//
// Beside the overview's handler rather than with the category CRUD, because it
// is the same number the overview shows and it comes from the same map. Put it
// next to the categories and the next person adds a second way to count.
//
// No permission: reading is open by default, as GET /categories is. No paging
// and no filter either -- it answers "how many in each", and categories are
// configuration, not data.
func (s *Server) categoryCounts(c *gin.Context) {
	counts, err := s.assets.SubtreeCountsByCategory(c.Request.Context())
	if err != nil {
		FailErr(c, err)
		return
	}
	c.JSON(http.StatusOK, counts)
}

// nameOwners fills in the people behind the owner distribution and orders it
// by size.
//
// Here rather than in the asset service, which can see the ledger and not the
// accounts. One lookup for the whole list, the way every other place in this
// file names its people.
//
// Sorted largest first because the question this answers is "who is carrying
// the most", and ties broken by name so the order does not shuffle between two
// reads of an unchanged ledger. An owner whose account has somehow gone keeps
// its id as the label: a row with a blank name reads as a bug, and the number
// beside it is real either way.
func (s *Server) nameOwners(ctx context.Context, rows []asset.OwnerCount) error {
	if len(rows) == 0 {
		return nil
	}
	users, err := s.users.List(ctx)
	if err != nil {
		return err
	}
	byID := make(map[string]model.User, len(users))
	for _, u := range users {
		byID[u.ID] = u
	}
	for i := range rows {
		if u, ok := byID[rows[i].OwnerID]; ok {
			rows[i].Name = u.Name
		} else {
			rows[i].Name = rows[i].OwnerID
		}
	}
	sort.SliceStable(rows, func(i, j int) bool {
		if rows[i].Count != rows[j].Count {
			return rows[i].Count > rows[j].Count
		}
		return rows[i].Name < rows[j].Name
	})
	return nil
}

// holderCounts is how many devices are standing at each holder, descendants
// included, for the holder page's rail and its "see the N devices here" link.
//
// Deliberately a different reading from categoryCounts above -- that one drops
// the written-off, this one keeps them, because a warehouse is asked what is
// standing in it. The reason lives in SubtreeCountsByHolder and in
// docs/rules/domain.md; it is repeated nowhere else, so that changing the mind
// means changing one place.
func (s *Server) holderCounts(c *gin.Context) {
	counts, err := s.assets.SubtreeCountsByHolder(c.Request.Context())
	if err != nil {
		FailErr(c, err)
		return
	}
	c.JSON(http.StatusOK, counts)
}

// modelCounts is how many devices carry each model, for the model page's rail.
func (s *Server) modelCounts(c *gin.Context) {
	counts, err := s.assets.CountsByModel(c.Request.Context())
	if err != nil {
		FailErr(c, err)
		return
	}
	c.JSON(http.StatusOK, counts)
}
