// Package httpapi exposes the REST surface. Handlers only bind, delegate and
// translate; business rules live in the domain packages.
package httpapi

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/klskk23/nexus-assets/internal/asset"
	"github.com/klskk23/nexus-assets/internal/auth"
	"github.com/klskk23/nexus-assets/internal/authz"
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
	CodeUnauthenticated = "unauthenticated"
	// CodeForbidden is authenticated but not allowed -- a permission the
	// account's role does not carry.
	CodeForbidden         = "forbidden"
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

// refusal is how one domain sentinel is answered.
type refusal struct {
	status int
	code   string
	// key replaces the error's own words. Only a few refusals need it: most
	// carry a sentence written for the person who caused them, and flattening
	// that to "not found" throws away the only useful part.
	key string
	// field names the input to highlight, when the refusal is about one.
	field string
}

// refusals maps sentinels onto answers, in order.
//
// A table rather than a switch, because the switch was the same three lines
// twenty times over and the differences between the cases were hard to see
// among them. Order is preserved and still matters: a wrapped sentinel matches
// the first entry it satisfies.
//
// Keeping the mapping in one place is what makes the codes in
// contracts/README.md true rather than aspirational.
var refusals = []struct {
	sentinel error
	answer   refusal
}{
	{asset.ErrVersionConflict, refusal{http.StatusConflict, CodeVersionConflict, i18n.KeyVersionConflict, ""}},

	{asset.ErrNotFound, refusal{http.StatusNotFound, CodeNotFound, i18n.KeyNotFound, ""}},
	{schema.ErrNotFound, refusal{http.StatusNotFound, CodeNotFound, i18n.KeyNotFound, ""}},
	{holder.ErrNotFound, refusal{http.StatusNotFound, CodeNotFound, i18n.KeyNotFound, ""}},
	{auth.ErrNotFound, refusal{http.StatusNotFound, CodeNotFound, i18n.KeyNotFound, ""}},

	{schema.ErrCategoryHasChildren, refusal{http.StatusConflict, CodeReferenceBlocked, "", ""}},
	{schema.ErrCategoryHasAssets, refusal{http.StatusConflict, CodeCategoryHasAssets, "", ""}},
	{schema.ErrKeyConflict, refusal{http.StatusConflict, CodeUniqueConflict, "", ""}},
	{schema.ErrModelDuplicate, refusal{http.StatusConflict, CodeUniqueConflict, "", ""}},
	{schema.ErrModelInvalid, refusal{http.StatusUnprocessableEntity, CodeValidationFailed, "", ""}},
	{schema.ErrModelInUse, refusal{http.StatusConflict, CodeReferenceBlocked, "", ""}},
	{schema.ErrModelAmbiguous, refusal{http.StatusUnprocessableEntity, CodeValidationFailed, "", ""}},

	// Configuration mistakes carry their own explanation of what to fix first,
	// so the message is passed through rather than flattened to a generic one.
	{schema.ErrDependenciesUnmet, refusal{http.StatusUnprocessableEntity, CodeValidationFailed, "", ""}},
	{schema.ErrStatusInvalid, refusal{http.StatusUnprocessableEntity, CodeValidationFailed, "", ""}},
	{schema.ErrDisplayKeyInvalid, refusal{http.StatusUnprocessableEntity, CodeValidationFailed, "", ""}},
	{schema.ErrFieldDependedOn, refusal{http.StatusConflict, CodeReferenceBlocked, "", ""}},
	// One field binds to categories or to models, never both (015, decision
	// 96). A conflict rather than a validation failure: nothing about the
	// request is malformed, the system refuses to end up in that state.
	{schema.ErrBindingModeConflict, refusal{http.StatusConflict, CodeReferenceBlocked, "", ""}},
	{schema.ErrDisplayKeyNotCategoryField, refusal{http.StatusUnprocessableEntity, CodeValidationFailed, "", "display_key"}},

	{holder.ErrDefaultStockRequired, refusal{http.StatusConflict, CodeReferenceBlocked, "", ""}},
	{holder.ErrParentRequired, refusal{http.StatusUnprocessableEntity, CodeValidationFailed, "", "parent_id"}},
	{holder.ErrParentInvalid, refusal{http.StatusUnprocessableEntity, CodeValidationFailed, "", "parent_id"}},
	{holder.ErrReferenced, refusal{http.StatusConflict, CodeReferenceBlocked, "", ""}},
	{holder.ErrNotALocation, refusal{http.StatusUnprocessableEntity, CodeValidationFailed, "", "is_default_stock"}},
	{holder.ErrHasChildren, refusal{http.StatusConflict, CodeReferenceBlocked, "", ""}},

	{auth.ErrStillOwnsAssets, refusal{http.StatusConflict, CodeReferenceBlocked, "", ""}},
	{auth.ErrValidation, refusal{http.StatusUnprocessableEntity, CodeValidationFailed, "", ""}},

	{authz.ErrNotFound, refusal{http.StatusNotFound, CodeNotFound, i18n.KeyNotFound, ""}},
	{authz.ErrInvalid, refusal{http.StatusUnprocessableEntity, CodeValidationFailed, "", ""}},
	{authz.ErrInUse, refusal{http.StatusConflict, CodeReferenceBlocked, "", ""}},
	// The two that keep somebody in charge. A conflict rather than a
	// validation failure: nothing about the request is malformed, the system
	// is refusing to end up in that state.
	{authz.ErrLastAdmin, refusal{http.StatusConflict, CodeReferenceBlocked, "", ""}},
	{authz.ErrSelfDemote, refusal{http.StatusConflict, CodeReferenceBlocked, "", ""}},
}

// FailErr maps a domain error onto the right status and code.
func FailErr(c *gin.Context, err error) {
	lang := LangOf(c)

	// Field errors first: they are a set of messages rather than one, and no
	// sentinel below can describe them.
	var fieldErrs asset.FieldErrors
	if errors.As(err, &fieldErrs) {
		Fail(c, http.StatusUnprocessableEntity, CodeValidationFailed,
			i18n.M(i18n.KeyValidationFailed).In(lang), fieldErrs.In(lang))
		return
	}

	for _, r := range refusals {
		if !errors.Is(err, r.sentinel) {
			continue
		}
		msg := i18n.Text(err, lang)
		if r.answer.key != "" {
			msg = i18n.M(r.answer.key).In(lang)
		}
		var fields map[string]string
		if r.answer.field != "" {
			fields = map[string]string{r.answer.field: msg}
		}
		Fail(c, r.answer.status, r.answer.code, msg, fields)
		return
	}

	Fail(c, http.StatusInternalServerError, CodeInternal, i18n.M(i18n.KeyInternal).In(lang), nil)
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
