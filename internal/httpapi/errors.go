// Package httpapi exposes the REST surface. Handlers only bind, delegate and
// translate; business rules live in the domain packages.
package httpapi

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/klskk23/nexus-assets/internal/asset"
	"github.com/klskk23/nexus-assets/internal/auth"
	"github.com/klskk23/nexus-assets/internal/holder"
	"github.com/klskk23/nexus-assets/internal/i18n"
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

// LangOf reports the language this request asked for.
//
// One place, so a handler cannot forget: Accept-Language is read on every
// request and everything user-facing is rendered through it.
func LangOf(c *gin.Context) i18n.Lang {
	return i18n.Parse(c.GetHeader("Accept-Language"))
}

// Fail writes an error envelope with an already-rendered message.
func Fail(c *gin.Context, status int, code, message string, fields map[string]string) {
	c.AbortWithStatusJSON(status, Envelope{Error: ErrorBody{Code: code, Message: message, Fields: fields}})
}

// FailMsg writes an error envelope from a catalogue key.
func FailMsg(c *gin.Context, status int, code, key string, args ...any) {
	Fail(c, status, code, i18n.M(key, args...).In(LangOf(c)), nil)
}

// FailField writes a failure whose message hangs off one field.
//
// The status stays a parameter rather than a constant: 400 means the request
// did not follow the contract (a missing version, an unparseable parent id),
// 422 means it did and the values were wrong. Collapsing the two would change
// what a client can conclude from a response.
func FailField(c *gin.Context, status int, field, key string, args ...any) {
	lang := LangOf(c)
	summary := i18n.KeyValidationFailed
	if status == http.StatusBadRequest {
		summary = i18n.KeyBadRequest
	}
	Fail(c, status, CodeValidationFailed, i18n.M(summary).In(lang),
		map[string]string{field: i18n.M(key, args...).In(lang)})
}

// FailErr maps a domain error onto the right status and code.
//
// Keeping the mapping in one place is what makes the codes in
// contracts/README.md true rather than aspirational.
func FailErr(c *gin.Context, err error) {
	lang := LangOf(c)
	var fieldErrs asset.FieldErrors
	switch {
	case errors.As(err, &fieldErrs):
		Fail(c, http.StatusUnprocessableEntity, CodeValidationFailed,
			i18n.M(i18n.KeyValidationFailed).In(lang), fieldErrs.In(lang))

	case errors.Is(err, asset.ErrVersionConflict):
		Fail(c, http.StatusConflict, CodeVersionConflict, i18n.M(i18n.KeyVersionConflict).In(lang), nil)

	case errors.Is(err, asset.ErrNotFound),
		errors.Is(err, schema.ErrNotFound),
		errors.Is(err, holder.ErrNotFound),
		errors.Is(err, auth.ErrNotFound):
		Fail(c, http.StatusNotFound, CodeNotFound, i18n.M(i18n.KeyNotFound).In(lang), nil)

	case errors.Is(err, schema.ErrCategoryHasChildren):
		Fail(c, http.StatusConflict, CodeReferenceBlocked,
			i18n.Text(err, lang), nil)

	case errors.Is(err, schema.ErrCategoryHasAssets):
		Fail(c, http.StatusConflict, CodeCategoryHasAssets,
			i18n.Text(err, lang), nil)

	case errors.Is(err, schema.ErrKeyConflict):
		Fail(c, http.StatusConflict, CodeUniqueConflict, i18n.Text(err, lang), nil)

	case errors.Is(err, schema.ErrModelDuplicate):
		Fail(c, http.StatusConflict, CodeUniqueConflict, i18n.Text(err, lang), nil)

	case errors.Is(err, schema.ErrModelAmbiguous):
		Fail(c, http.StatusUnprocessableEntity, CodeValidationFailed,
			i18n.Text(err, lang), nil)

	// Configuration mistakes carry their own explanation of what to fix first,
	// so the message is passed through rather than flattened to a generic one.
	case errors.Is(err, schema.ErrDependenciesUnmet):
		Fail(c, http.StatusUnprocessableEntity, CodeValidationFailed,
			i18n.Text(err, lang), nil)

	case errors.Is(err, schema.ErrStatusInvalid):
		Fail(c, http.StatusUnprocessableEntity, CodeValidationFailed,
			i18n.Text(err, lang), nil)

	case errors.Is(err, schema.ErrDisplayKeyInvalid):
		Fail(c, http.StatusUnprocessableEntity, CodeValidationFailed,
			i18n.Text(err, lang), nil)

	case errors.Is(err, schema.ErrFieldDependedOn):
		Fail(c, http.StatusConflict, CodeReferenceBlocked,
			i18n.Text(err, lang), nil)

	case errors.Is(err, holder.ErrDefaultStockRequired):
		Fail(c, http.StatusConflict, CodeReferenceBlocked,
			i18n.Text(err, lang), nil)

	case errors.Is(err, holder.ErrParentRequired),
		errors.Is(err, holder.ErrParentInvalid):
		Fail(c, http.StatusUnprocessableEntity, CodeValidationFailed,
			i18n.Text(err, lang), map[string]string{"parent_id": i18n.Text(err, lang)})

	case errors.Is(err, holder.ErrReferenced):
		Fail(c, http.StatusConflict, CodeReferenceBlocked, i18n.Text(err, lang), nil)

	case errors.Is(err, holder.ErrHasChildren):
		Fail(c, http.StatusConflict, CodeReferenceBlocked, i18n.Text(err, lang), nil)

	case errors.Is(err, auth.ErrStillOwnsAssets):
		Fail(c, http.StatusConflict, CodeReferenceBlocked,
			i18n.Text(err, lang), nil)

	default:
		Fail(c, http.StatusInternalServerError, CodeInternal, i18n.M(i18n.KeyInternal).In(lang), nil)
	}
}

// userText renders a domain error for the screen.
//
// It used to strip an English sentinel prefix off a Chinese string, which
// worked only because there was exactly one language to strip it down to.
// Domain errors carry a catalogue key now, so this is a lookup rather than a
// string operation -- and an error with no key at all is an internal failure,
// which gets the generic message rather than its own words.
func userText(c *gin.Context, err error) string {
	lang := LangOf(c)
	if !i18n.HasText(err) {
		return i18n.M(i18n.KeyInternal).In(lang)
	}
	return i18n.Text(err, lang)
}
