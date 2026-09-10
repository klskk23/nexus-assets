package httpapi

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/klskk23/nexus-assets/internal/i18n"

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
		FailMsg(c, http.StatusBadRequest, CodeValidationFailed, i18n.KeyBadRequest)
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
			FailField(c, http.StatusUnprocessableEntity, "to_status", i18n.KeyStatusUnknown)
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
			FailField(c, http.StatusUnprocessableEntity, "due_at", i18n.KeyTimeShape)
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
		FailMsg(c, http.StatusBadRequest, CodeValidationFailed, i18n.KeyBadRequest)
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

// transferLookups is everything a page of transfers needs looked up, gathered
// once.
//
// Split from the filling-in below because the two halves fail for different
// reasons and change for different reasons: this half talks to four stores and
// can return an error, the other half is arithmetic on fields that are already
// in memory.
type transferLookups struct {
	userByID   map[string]model.User
	entityByID map[string]model.HolderEntity
	// numbers is the asset's readable number, which is not stored on the
	// transfer -- it is whichever attribute the asset's category nominates.
	numbers map[string]string
	// sizes is how many devices moved in each batch.
	sizes map[string]int
}

// One lookup for the whole page, not one per row. Every endpoint that returns
// transfers comes through here, which is what makes "the number travels with
// the transfer" true everywhere rather than in the four or five places
// somebody remembered.
func (s *Server) loadTransferLookups(ctx context.Context, items []model.Transfer) (transferLookups, error) {
	var lk transferLookups

	users, err := s.users.List(ctx)
	if err != nil {
		return lk, err
	}
	lk.userByID = make(map[string]model.User, len(users))
	for _, u := range users {
		lk.userByID[u.ID] = u
	}

	entities, err := s.holders.List(ctx)
	if err != nil {
		return lk, err
	}
	lk.entityByID = make(map[string]model.HolderEntity, len(entities))
	for _, e := range entities {
		lk.entityByID[e.ID] = e
	}

	ids := make([]string, 0, len(items))
	batches := make([]string, 0, len(items))
	for i := range items {
		ids = append(ids, items[i].AssetID)
		if items[i].BatchID != nil {
			batches = append(batches, *items[i].BatchID)
		}
	}
	if lk.numbers, err = s.assets.DisplayNames(ctx, ids); err != nil {
		return lk, err
	}
	if lk.sizes, err = s.transfers.BatchSizes(ctx, batches); err != nil {
		return lk, err
	}
	return lk, nil
}

// nameHolder fills in who or what a holder is, in place.
func (lk transferLookups) nameHolder(h *model.Holder) {
	if h == nil {
		return
	}
	switch h.Type {
	case model.HolderTypeUser:
		if u, ok := lk.userByID[h.ID]; ok {
			h.Name = u.Name
		}
	case model.HolderTypeEntity:
		if e, ok := lk.entityByID[h.ID]; ok {
			h.Name = e.Name
			h.EntityType = e.Type
		}
	}
}

// person is the account behind an id, or nil when there is none to name.
//
// The owners, the actor and the editor are always people, so they need no type
// switch -- but they do need the same batched lookup, because a reassignment's
// whole content is two of those fields and the client has no user list of its
// own on two of the three screens that render one.
func (lk transferLookups) person(id string) *model.User {
	if id == "" {
		return nil
	}
	u, ok := lk.userByID[id]
	if !ok {
		return nil
	}
	return &u
}

// apply writes everything looked up onto one transfer.
func (lk transferLookups) apply(t *model.Transfer) {
	lk.nameHolder(t.FromHolder)
	lk.nameHolder(&t.ToHolder)
	if t.FromOwnerID != nil {
		t.FromOwner = lk.person(*t.FromOwnerID)
	}
	t.ToOwner = lk.person(t.ToOwnerID)
	t.Actor = lk.person(t.ActorID)
	if t.EditedBy != nil {
		t.Editor = lk.person(*t.EditedBy)
	}
	if t.BatchID != nil {
		t.BatchSize = lk.sizes[*t.BatchID]
	}
	t.AssetDisplayName = lk.numbers[t.AssetID]
}

// decorateTransfers fills in display names with one batched lookup per kind,
// never one per row.
func (s *Server) decorateTransfers(c *gin.Context, items []model.Transfer) error {
	if len(items) == 0 {
		return nil
	}
	lk, err := s.loadTransferLookups(c.Request.Context(), items)
	if err != nil {
		return err
	}
	for i := range items {
		lk.apply(&items[i])
	}
	return nil
}

// failTransfer maps the transfer-specific errors, then defers to the shared
// mapping for everything else.
func failTransfer(c *gin.Context, err error) {
	switch {
	case errors.Is(err, transfer.ErrNotTailEvent):
		FailMsg(c, http.StatusConflict, CodeNotTailEvent, i18n.KeyNotTailEvent)
	case errors.Is(err, transfer.ErrNoDefaultStock):
		Fail(c, http.StatusUnprocessableEntity, CodeValidationFailed, i18n.M(i18n.KeyNoDefaultStock).In(LangOf(c)),
			map[string]string{"to_holder_id": i18n.M(i18n.KeyNoDefaultStock).In(LangOf(c))})
	case errors.Is(err, transfer.ErrNotFound), errors.Is(err, transfer.ErrAssetNotFound):
		FailMsg(c, http.StatusNotFound, CodeNotFound, i18n.KeyNotFound)
	case isTransitionError(err):
		Fail(c, http.StatusUnprocessableEntity, CodeIllegalTransition, userText(c, err),
			map[string]string{"to_status": userText(c, err)})
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

// listTransfers answers "where did devices go", across every asset.
//
// The operations audit next to it answers a different question -- who renamed a
// field, who deleted a category -- and the two are separate on purpose: they
// come from different tables, they interest different people, and each carries
// its own permission. Movements are never written to the audit log.
func (s *Server) listTransfers(c *gin.Context) {
	offset, limit := Paging(c)
	res, err := s.transfers.List(c.Request.Context(), transfer.ListFilter{
		ActorID:     c.Query("actor_id"),
		AssetNumber: c.Query("asset_number"),
		Kind:        c.Query("kind"),
		From:        c.Query("from"),
		To:          c.Query("to"),
		Offset:      offset,
		Limit:       limit,
	})
	if err != nil {
		FailErr(c, err)
		return
	}
	if err := s.decorateTransfers(c, res.Items); err != nil {
		FailErr(c, err)
		return
	}
	c.JSON(http.StatusOK, res)
}
