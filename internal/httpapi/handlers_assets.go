package httpapi

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/klskk23/nexus-assets/internal/i18n"

	"github.com/klskk23/nexus-assets/internal/asset"
	"github.com/klskk23/nexus-assets/internal/auth"
	"github.com/klskk23/nexus-assets/internal/model"
)

// assetListResponse adds the exact-match hint to a normal page.
type assetListResponse struct {
	Page[model.Asset]
	// ExactMatchID is set when q matched exactly one asset by serial number,
	// retired serial number or MAC. The client jumps straight to it, which is
	// what makes a barcode scanner a one-step operation.
	ExactMatchID string `json:"exact_match_id,omitempty"`
}

func (s *Server) listAssets(c *gin.Context) {
	offset, limit := Paging(c)

	f := asset.ListFilter{
		Q:                  c.Query("q"),
		CategoryID:         c.Query("category_id"),
		IncludeDescendants: c.DefaultQuery("include_descendants", "true") != "false",
		Status:             c.Query("status"),
		OwnerID:            c.Query("owner_id"),
		HolderType:         c.Query("holder_type"),
		HolderID:           c.Query("holder_id"),
		AttrFilters:        map[string]string{},
		Offset:             offset,
		Limit:              limit,
	}
	// attr.<key>=<value>. An unknown key is ignored rather than rejected so a
	// stale client schema cannot break the whole page.
	for k, v := range c.Request.URL.Query() {
		if key, ok := strings.CutPrefix(k, "attr."); ok && key != "" && len(v) > 0 {
			f.AttrFilters[key] = v[0]
		}
	}

	res, err := s.assets.List(c.Request.Context(), f)
	if err != nil {
		FailErr(c, err)
		return
	}
	if err := s.decorate(c, res.Items); err != nil {
		FailErr(c, err)
		return
	}
	c.JSON(http.StatusOK, assetListResponse{
		Page:         NewPage(res.Items, res.Total, offset, limit),
		ExactMatchID: res.ExactMatchID,
	})
}

// decorate fills in holder, owner and model display names.
//
// One batched lookup per kind, never one per row: the statement count stays
// constant no matter how many assets came back.
func (s *Server) decorate(c *gin.Context, items []model.Asset) error {
	if len(items) == 0 {
		return nil
	}
	ctx := c.Request.Context()

	users, err := s.users.List(ctx)
	if err != nil {
		return err
	}
	userByID := make(map[string]model.User, len(users))
	for _, u := range users {
		userByID[u.ID] = u
	}

	entities, err := s.holders.List(ctx)
	if err != nil {
		return err
	}
	entityByID := make(map[string]model.HolderEntity, len(entities))
	for _, e := range entities {
		entityByID[e.ID] = e
	}

	// One resolver for both the current holder and the home, so the two can
	// never end up reading differently on the same screen.
	name := func(h *model.Holder) {
		switch h.Type {
		case model.HolderTypeUser:
			if u, ok := userByID[h.ID]; ok {
				h.Name = u.Name
			}
		case model.HolderTypeEntity:
			if e, ok := entityByID[h.ID]; ok {
				h.Name, h.EntityType = e.Name, e.Type
			}
		}
	}

	for i := range items {
		if u, ok := userByID[items[i].OwnerID]; ok {
			owner := u
			items[i].Owner = &owner
		}
		name(&items[i].Holder)
		if items[i].HomeHolder != nil {
			name(items[i].HomeHolder)
		}
		if items[i].HomeOwnerID != nil {
			if u, ok := userByID[*items[i].HomeOwnerID]; ok {
				homeOwner := u
				items[i].HomeOwner = &homeOwner
			}
		}
	}
	return nil
}

type assetWriteRequest struct {
	CategoryID string         `json:"category_id" binding:"required"`
	ModelID    *string        `json:"model_id"`
	Status     string         `json:"status"`
	OwnerID    string         `json:"owner_id" binding:"required"`
	HolderType string         `json:"holder_type" binding:"required"`
	HolderID   string         `json:"holder_id" binding:"required"`
	Attrs      map[string]any `json:"attrs"`
	Version    int            `json:"version"`
	Note       string         `json:"note"`
	// Where the device belongs when it is not out. Absent means "leave it
	// alone" on an update, and "wherever it is being recorded" on a create.
	// Explicit null clears it, restoring the global default stock point.
	HomeHolderType json.RawMessage `json:"home_holder_type"`
	HomeHolderID   json.RawMessage `json:"home_holder_id"`
	HomeOwnerID    json.RawMessage `json:"home_owner_id"`
}

// home reads the tri-state home fields off a write request.
func (r assetWriteRequest) home() (holder *model.Holder, owner *string, clear bool) {
	var ht, hid, oid *string
	_ = json.Unmarshal(r.HomeHolderType, &ht)
	_ = json.Unmarshal(r.HomeHolderID, &hid)
	_ = json.Unmarshal(r.HomeOwnerID, &oid)

	// An explicit null on the holder is what "no home" means; the owner
	// follows it, since answering "who" without "where" is not a home.
	if len(r.HomeHolderType) > 0 && ht == nil {
		return nil, nil, true
	}
	if ht != nil && hid != nil {
		holder = &model.Holder{Type: model.HolderType(*ht), ID: *hid}
	}
	return holder, oid, false
}

func (r assetWriteRequest) toInput(id, actorID string) asset.SaveInput {
	status := model.AssetStatus(r.Status)
	if status == "" {
		status = model.StatusInStock
	}
	homeHolder, homeOwner, clearHome := r.home()
	return asset.SaveInput{
		ID: id, CategoryID: r.CategoryID, ModelID: r.ModelID, Status: status,
		OwnerID: r.OwnerID,
		Holder:  model.Holder{Type: model.HolderType(r.HolderType), ID: r.HolderID},
		Attrs:   r.Attrs, Version: r.Version, ActorID: actorID, Note: r.Note,
		HomeHolder: homeHolder, HomeOwnerID: homeOwner, ClearHome: clearHome,
	}
}

func (s *Server) createAsset(c *gin.Context) {
	var req assetWriteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		FailMsg(c, http.StatusBadRequest, CodeValidationFailed, i18n.KeyBadRequest)
		return
	}
	actor, _ := auth.CurrentUser(c)
	out, err := s.assets.Save(c.Request.Context(), req.toInput("", actor.ID))
	if err != nil {
		FailErr(c, err)
		return
	}
	c.JSON(http.StatusCreated, out)
}

func (s *Server) patchAsset(c *gin.Context) {
	var req assetWriteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		FailMsg(c, http.StatusBadRequest, CodeValidationFailed, i18n.KeyBadRequest)
		return
	}
	if req.Version <= 0 {
		FailField(c, http.StatusBadRequest, "version", i18n.KeyVersionRequired)
		return
	}
	actor, _ := auth.CurrentUser(c)
	out, err := s.assets.Save(c.Request.Context(), req.toInput(c.Param("id"), actor.ID))
	if err != nil {
		FailErr(c, err)
		return
	}
	c.JSON(http.StatusOK, out)
}

func (s *Server) getAsset(c *gin.Context) {
	a, err := s.assets.Get(c.Request.Context(), c.Param("id"))
	if err != nil {
		FailErr(c, err)
		return
	}
	items := []model.Asset{a}
	if err := s.decorate(c, items); err != nil {
		FailErr(c, err)
		return
	}
	history, err := s.assets.ValueHistory(c.Request.Context(), a.ID)
	if err != nil {
		FailErr(c, err)
		return
	}
	if history == nil {
		history = []asset.HistoricValue{}
	}
	c.JSON(http.StatusOK, gin.H{"asset": items[0], "value_history": history})
}

func (s *Server) deleteAsset(c *gin.Context) {
	confirm := c.Query("confirm")
	if confirm == "" {
		FailField(c, http.StatusBadRequest, "confirm", i18n.KeyConfirmSN)
		return
	}
	if err := s.assets.Delete(c.Request.Context(), c.Param("id"), confirm); err != nil {
		FailErr(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

// deleteAssets removes a selection in one go.
//
// A POST rather than a DELETE because the request carries a body: DELETE with
// one is supported unevenly across proxies and clients, and this is not the
// place to find that out.
func (s *Server) deleteAssets(c *gin.Context) {
	var req struct {
		AssetIDs []string `json:"asset_ids" binding:"required"`
		Confirm  string   `json:"confirm"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		FailMsg(c, http.StatusBadRequest, CodeValidationFailed, i18n.KeyBadRequest)
		return
	}

	n, err := s.assets.DeleteMany(c.Request.Context(), req.AssetIDs, req.Confirm)
	if err != nil {
		FailErr(c, err)
		return
	}
	// No audit entry, matching the single delete: the audit log covers
	// configuration objects, and an asset's history lives in its transfer log
	// -- which this removes along with it.
	c.JSON(http.StatusOK, gin.H{"deleted": n})
}
