package httpapi

import (
	"errors"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/klskk23/nexus-assets/internal/auth"
	"github.com/klskk23/nexus-assets/internal/i18n"
)

// maxKeyDays is as far out as a key may be dated. Not a security boundary --
// a key can be revoked at any time -- but a date nobody will outlive is the
// same as no expiry, and this dialog is where someone decides how long a
// script should be trusted.
const maxKeyDays = 3650

func (s *Server) listAPIKeys(c *gin.Context) {
	u, _ := auth.CurrentUser(c)
	keys, err := s.keys.List(c.Request.Context(), u.ID)
	if err != nil {
		FailErr(c, err)
		return
	}
	c.JSON(http.StatusOK, keys)
}

// createAPIKey mints a key and returns its secret exactly once.
//
// The secret is never stored, only its hash, so this response is the only
// chance anyone has to copy it. The dialog says so before it is dismissed.
func (s *Server) createAPIKey(c *gin.Context) {
	u, _ := auth.CurrentUser(c)

	var req struct {
		Name string `json:"name" binding:"required"`
		// How many days from now it stops working. Zero means no expiry, which
		// the interface does not offer but a script setting one up may want.
		Days int `json:"days"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		FailMsg(c, http.StatusBadRequest, CodeValidationFailed, i18n.KeyBadRequest)
		return
	}
	if req.Days < 0 || req.Days > maxKeyDays {
		FailField(c, http.StatusUnprocessableEntity, "days", i18n.KeyKeyDaysRange, maxKeyDays)
		return
	}

	var expires *time.Time
	if req.Days > 0 {
		t := time.Now().UTC().AddDate(0, 0, req.Days)
		expires = &t
	}

	key, secret, err := s.keys.Create(c.Request.Context(), u.ID, req.Name, expires)
	if err != nil {
		FailErr(c, err)
		return
	}
	c.JSON(http.StatusCreated, gin.H{"key": key, "secret": secret})
}

func (s *Server) revokeAPIKey(c *gin.Context) {
	u, _ := auth.CurrentUser(c)
	if err := s.keys.Revoke(c.Request.Context(), u.ID, c.Param("id")); err != nil {
		if errors.Is(err, auth.ErrNotFound) {
			FailMsg(c, http.StatusNotFound, CodeNotFound, i18n.KeyNotFound)
			return
		}
		FailErr(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}
