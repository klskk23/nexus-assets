// Package httpapi exposes the REST surface. Handlers only bind, delegate and
// translate; business rules live in the domain packages.
package httpapi

import (
	"errors"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/klskk23/nexus-assets/internal/asset"
	"github.com/klskk23/nexus-assets/internal/auth"
	"github.com/klskk23/nexus-assets/internal/holder"
	"github.com/klskk23/nexus-assets/internal/schema"
)

// Envelope is the single error shape every non-2xx response uses.
type Envelope struct {
	Error ErrorBody `json:"error"`
}

// ErrorBody carries a machine code, a human message and optional per-field
// messages. The fields member is what lets the dynamic form put each message
// next to the right input rather than showing one vague banner.
type ErrorBody struct {
	Code    string            `json:"code"`
	Message string            `json:"message"`
	Fields  map[string]string `json:"fields,omitempty"`
}

// Error codes. Machine-readable, English, snake_case.
const (
	CodeUnauthenticated   = "unauthenticated"
	CodeDomainNotAllowed  = "domain_not_allowed"
	CodeNotFound          = "not_found"
	CodeValidationFailed  = "validation_failed"
	CodeUniqueConflict    = "unique_conflict"
	CodeVersionConflict   = "version_conflict"
	CodeReferenceBlocked  = "reference_blocked"
	CodeIllegalTransition = "illegal_transition"
	CodeNotTailEvent      = "not_tail_event"
	CodeTemplateInvalid   = "template_invalid"
	CodeComputeFailed     = "compute_failed"
	CodeCategoryHasAssets = "category_has_assets"
	CodeInternal          = "internal_error"
)

// Fail writes an error envelope.
func Fail(c *gin.Context, status int, code, message string, fields map[string]string) {
	c.AbortWithStatusJSON(status, Envelope{Error: ErrorBody{Code: code, Message: message, Fields: fields}})
}

// FailErr maps a domain error onto the right status and code.
//
// Keeping the mapping in one place is what makes the codes in
// contracts/README.md true rather than aspirational.
func FailErr(c *gin.Context, err error) {
	var fieldErrs asset.FieldErrors
	switch {
	case errors.As(err, &fieldErrs):
		Fail(c, http.StatusUnprocessableEntity, CodeValidationFailed, MsgValidationFailed, fieldErrs)

	case errors.Is(err, asset.ErrVersionConflict):
		Fail(c, http.StatusConflict, CodeVersionConflict, MsgVersionConflict, nil)

	case errors.Is(err, asset.ErrNotFound),
		errors.Is(err, schema.ErrNotFound),
		errors.Is(err, holder.ErrNotFound),
		errors.Is(err, auth.ErrNotFound):
		Fail(c, http.StatusNotFound, CodeNotFound, MsgNotFound, nil)

	case errors.Is(err, schema.ErrCategoryHasAssets):
		Fail(c, http.StatusConflict, CodeCategoryHasAssets,
			userText(err, schema.ErrCategoryHasAssets), nil)

	case errors.Is(err, schema.ErrKeyConflict):
		Fail(c, http.StatusConflict, CodeUniqueConflict, userText(err, schema.ErrKeyConflict), nil)

	case errors.Is(err, schema.ErrModelDuplicate):
		Fail(c, http.StatusConflict, CodeUniqueConflict, userText(err, schema.ErrModelDuplicate), nil)

	case errors.Is(err, schema.ErrModelAmbiguous):
		Fail(c, http.StatusUnprocessableEntity, CodeValidationFailed,
			userText(err, schema.ErrModelAmbiguous), nil)

	// Configuration mistakes carry their own explanation of what to fix first,
	// so the message is passed through rather than flattened to a generic one.
	case errors.Is(err, schema.ErrDependenciesUnmet):
		Fail(c, http.StatusUnprocessableEntity, CodeValidationFailed,
			userText(err, schema.ErrDependenciesUnmet), nil)

	case errors.Is(err, schema.ErrDisplayKeyInvalid):
		Fail(c, http.StatusUnprocessableEntity, CodeValidationFailed,
			userText(err, schema.ErrDisplayKeyInvalid), nil)

	case errors.Is(err, schema.ErrFieldDependedOn):
		Fail(c, http.StatusConflict, CodeReferenceBlocked,
			userText(err, schema.ErrFieldDependedOn), nil)

	case errors.Is(err, holder.ErrDefaultStockRequired):
		Fail(c, http.StatusConflict, CodeReferenceBlocked,
			userText(err, holder.ErrDefaultStockRequired), nil)

	case errors.Is(err, holder.ErrReferenced):
		Fail(c, http.StatusConflict, CodeReferenceBlocked, userText(err, holder.ErrReferenced), nil)

	case errors.Is(err, auth.ErrStillOwnsAssets):
		Fail(c, http.StatusConflict, CodeReferenceBlocked,
			userText(err, auth.ErrStillOwnsAssets), nil)

	default:
		Fail(c, http.StatusInternalServerError, CodeInternal, MsgInternal, nil)
	}
}

// userText renders a domain error for the screen.
//
// A sentinel carries an English identifier so errors.Is can match it; the part
// after it is the Chinese guidance. Passing err.Error() through whole put
// "expression key dependencies are unmet: " in front of that guidance on the
// user's screen, which is exactly what principle V rules out.
func userText(err error, sentinel error) string {
	msg := err.Error()
	rest, ok := strings.CutPrefix(msg, sentinel.Error())
	if !ok {
		return msg
	}
	rest = strings.TrimLeft(rest, ": ：")
	if rest == "" {
		// A bare sentinel has no guidance of its own to show.
		return MsgValidationFailed
	}
	return rest
}
