package httpapi

import (
	"errors"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/klskk23/nexus-assets/internal/auth"
	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/transfer"
)

// transferRequest is one action applied to one or many assets.
//
// Every destination is optional and an omitted one keeps whatever the asset
// already has, so checkout, return, hand-over and reassignment are the same
// endpoint with different fields filled in.
type transferRequest struct {
	AssetIDs   []string `json:"asset_ids" binding:"required,min=1"`
	ToStatus   *string  `json:"to_status"`
	ToHolderTy *string  `json:"to_holder_type"`
	ToHolderID *string  `json:"to_holder_id"`
	ToOwnerID  *string  `json:"to_owner_id"`
	Note       string   `json:"note"`
	DueAt      *string  `json:"due_at"`
	// CheckIn asks the server for the default stock point instead of naming a
	// destination, which is what the return button sends.
	CheckIn bool `json:"check_in"`
}

func (s *Server) createTransfer(c *gin.Context) {
	var req transferRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		Fail(c, http.StatusBadRequest, CodeValidationFailed, MsgBadRequest, nil)
		return
	}
	actor, _ := auth.CurrentUser(c)

	in := transfer.Request{
		AssetIDs: req.AssetIDs,
		Note:     req.Note,
		ActorID:  actor.ID,
		CheckIn:  req.CheckIn,
	}
	if req.ToStatus != nil {
		st := model.AssetStatus(*req.ToStatus)
		statuses, err := s.schema.StatusSet(c.Request.Context())
		if err != nil {
			FailErr(c, err)
			return
		}
		if _, ok := statuses.Get(st); !ok {
			Fail(c, http.StatusUnprocessableEntity, CodeValidationFailed, MsgValidationFailed,
				map[string]string{"to_status": "不是有效的状态"})
			return
		}
		in.ToStatus = &st
	}
	if req.ToHolderTy != nil && req.ToHolderID != nil {
		in.ToHolder = &model.Holder{Type: model.HolderType(*req.ToHolderTy), ID: *req.ToHolderID}
	}
	in.ToOwnerID = req.ToOwnerID
	if req.DueAt != nil && *req.DueAt != "" {
		t, err := time.Parse(time.RFC3339, *req.DueAt)
		if err != nil {
			Fail(c, http.StatusUnprocessableEntity, CodeValidationFailed, MsgValidationFailed,
				map[string]string{"due_at": "时间格式不正确"})
			return
		}
		in.DueAt = &t
	}

	res, err := s.transfers.Apply(c.Request.Context(), in)
	if err != nil {
		failTransfer(c, err)
		return
	}
	if err := s.decorateTransfers(c, res.Transfers); err != nil {
		FailErr(c, err)
		return
	}
	c.JSON(http.StatusCreated, res)
}

func (s *Server) patchTransfer(c *gin.Context) {
	var req struct {
		ToStatus   *string `json:"to_status"`
		ToHolderTy *string `json:"to_holder_type"`
		ToHolderID *string `json:"to_holder_id"`
		ToOwnerID  *string `json:"to_owner_id"`
		Note       *string `json:"note"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		Fail(c, http.StatusBadRequest, CodeValidationFailed, MsgBadRequest, nil)
		return
	}
	actor, _ := auth.CurrentUser(c)

	in := transfer.EditRequest{Note: req.Note, ToOwnerID: req.ToOwnerID, EditorID: actor.ID}
	if req.ToStatus != nil {
		st := model.AssetStatus(*req.ToStatus)
		in.ToStatus = &st
	}
	if req.ToHolderTy != nil && req.ToHolderID != nil {
		in.ToHolder = &model.Holder{Type: model.HolderType(*req.ToHolderTy), ID: *req.ToHolderID}
	}

	out, err := s.transfers.Edit(c.Request.Context(), c.Param("id"), in)
	if err != nil {
		failTransfer(c, err)
		return
	}
	if err := s.decorateTransfers(c, out); err != nil {
		FailErr(c, err)
		return
	}
	c.JSON(http.StatusOK, out)
}

func (s *Server) listAssetTransfers(c *gin.Context) {
	items, err := s.transfers.ByAsset(c.Request.Context(), c.Param("id"))
	if err != nil {
		FailErr(c, err)
		return
	}
	if err := s.decorateTransfers(c, items); err != nil {
		FailErr(c, err)
		return
	}
	if items == nil {
		items = []model.Transfer{}
	}
	c.JSON(http.StatusOK, items)
}

// decorateTransfers fills in display names with one batched lookup per kind,
// never one per row.
func (s *Server) decorateTransfers(c *gin.Context, items []model.Transfer) error {
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

	name := func(h *model.Holder) {
		if h == nil {
			return
		}
		switch h.Type {
		case model.HolderTypeUser:
			if u, ok := userByID[h.ID]; ok {
				h.Name = u.Name
			}
		case model.HolderTypeEntity:
			if e, ok := entityByID[h.ID]; ok {
				h.Name = e.Name
				h.EntityType = e.Type
			}
		}
	}

	for i := range items {
		name(items[i].FromHolder)
		name(&items[i].ToHolder)
		if u, ok := userByID[items[i].ActorID]; ok {
			actor := u
			items[i].Actor = &actor
		}
	}
	return nil
}

// failTransfer maps the transfer-specific errors, then defers to the shared
// mapping for everything else.
func failTransfer(c *gin.Context, err error) {
	switch {
	case errors.Is(err, transfer.ErrNotTailEvent):
		Fail(c, http.StatusConflict, CodeNotTailEvent, MsgNotTailEvent, nil)
	case errors.Is(err, transfer.ErrNoDefaultStock):
		Fail(c, http.StatusUnprocessableEntity, CodeValidationFailed, MsgNoDefaultStock,
			map[string]string{"to_holder_id": MsgNoDefaultStock})
	case errors.Is(err, transfer.ErrNotFound), errors.Is(err, transfer.ErrAssetNotFound):
		Fail(c, http.StatusNotFound, CodeNotFound, MsgNotFound, nil)
	case errors.Is(err, transfer.ErrHolderKind):
		// Tagged to the field that was actually chosen. Reporting a holder
		// problem against to_status is what made this refusal unactionable.
		Fail(c, http.StatusUnprocessableEntity, CodeValidationFailed,
			userText(err, transfer.ErrHolderKind),
			map[string]string{"to_holder_id": userText(err, transfer.ErrHolderKind)})
	case isTransitionError(err):
		Fail(c, http.StatusUnprocessableEntity, CodeIllegalTransition, err.Error(),
			map[string]string{"to_status": err.Error()})
	default:
		FailErr(c, err)
	}
}

// isTransitionError recognises the status-machine and holder-coupling refusals,
// which arrive as plain errors from the model layer.
func isTransitionError(err error) bool {
	msg := err.Error()
	for _, marker := range []string{"terminal", "checked back in", "not allowed", "unknown status"} {
		if len(msg) >= len(marker) && indexOfString(msg, marker) >= 0 {
			return true
		}
	}
	return false
}

func indexOfString(h, n string) int {
	for i := 0; i+len(n) <= len(h); i++ {
		if h[i:i+len(n)] == n {
			return i
		}
	}
	return -1
}
