package asset

import (
	"fmt"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/klskk23/nexus-assets/internal/i18n"
	"github.com/klskk23/nexus-assets/internal/model"
)

// FieldErrors maps a field key to a message about it. It becomes the "fields"
// member of the error envelope, which is what lets the dynamic form put each
// message next to the right input.
//
// The values are Messages, not strings: which language they render in is the
// reader's business, and this map is built long before the reader is known.
type FieldErrors map[string]i18n.Message

// Error renders a summary. English by design -- this one goes to logs.
func (e FieldErrors) Error() string {
	keys := make([]string, 0, len(e))
	for k := range e {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return fmt.Sprintf("validation failed for %s", strings.Join(keys, ", "))
}

// In renders every message in one language, ready for the JSON envelope.
func (e FieldErrors) In(l i18n.Lang) map[string]string {
	out := make(map[string]string, len(e))
	for k, m := range e {
		out[k] = m.In(l)
	}
	return out
}

// Any reports whether anything was recorded.
func (e FieldErrors) Any() bool { return len(e) > 0 }

// ValidateAttrs checks and normalises the custom values of one asset.
//
// Normalisation happens here, before the caller runs the uniqueness check, and
// the returned map is the one that must be persisted.
func ValidateAttrs(fields []model.BoundField, in map[string]any) (map[string]any, FieldErrors) {
	out := make(map[string]any, len(in))
	errs := FieldErrors{}

	for _, f := range fields {
		if f.Type == model.FieldComputed {
			continue // produced by evaluation, never supplied by the caller
		}
		raw, present := in[f.Key]
		empty := !present || raw == nil || fmt.Sprintf("%v", raw) == ""

		if empty {
			if f.Required {
				errs[f.Key] = i18n.M(i18n.KeyFieldRequired)
			}
			continue
		}

		v, err := validateOne(f, raw)
		if err != nil {
			errs[f.Key] = asMessage(err)
			continue
		}
		out[f.Key] = v
	}
	return out, errs
}

func validateOne(f model.BoundField, raw any) (any, error) {
	s := fmt.Sprintf("%v", raw)

	switch f.Type {
	case model.FieldMAC, model.FieldIP, model.FieldURL:
		return Normalize(f.Type, s)

	case model.FieldText:
		if f.Options.Regex != "" {
			re, err := regexp.Compile(f.Options.Regex)
			if err != nil {
				return nil, i18n.M(i18n.KeyFieldRuleInvalid)
			}
			if !re.MatchString(s) {
				if f.Options.RegexHint != "" {
					return nil, i18n.M(i18n.KeyFieldPatternHint, f.Options.RegexHint)
				}
				return nil, i18n.M(i18n.KeyFieldPattern)
			}
		}
		return s, nil

	case model.FieldNumber:
		n, err := strconv.ParseFloat(s, 64)
		if err != nil {
			return nil, i18n.M(i18n.KeyFieldNotNumber)
		}
		if f.Options.Min != nil && n < *f.Options.Min {
			return nil, i18n.M(i18n.KeyFieldMin, *f.Options.Min)
		}
		if f.Options.Max != nil && n > *f.Options.Max {
			return nil, i18n.M(i18n.KeyFieldMax, *f.Options.Max)
		}
		return n, nil

	case model.FieldBoolean:
		b, err := strconv.ParseBool(s)
		if err != nil {
			return nil, i18n.M(i18n.KeyFieldNotBool)
		}
		return b, nil

	case model.FieldDate:
		if _, err := time.Parse("2006-01-02", s); err != nil {
			return nil, i18n.M(i18n.KeyFieldDateShape)
		}
		return s, nil

	default:
		return nil, i18n.M(i18n.KeyFieldTypeUnknown, string(f.Type))
	}
}

// SplitAttrs separates values that still belong to the effective field set from
// orphan keys left behind by an unbound field or a category change. Orphans are
// kept and shown read-only; nothing is silently destroyed.
func SplitAttrs(fields []model.BoundField, stored map[string]any) (live, archived map[string]any) {
	known := make(map[string]struct{}, len(fields))
	for _, f := range fields {
		known[f.Key] = struct{}{}
	}
	live = map[string]any{}
	archived = map[string]any{}
	for k, v := range stored {
		if _, ok := known[k]; ok {
			live[k] = v
		} else {
			archived[k] = v
		}
	}
	return live, archived
}

// asMessage lifts an error into a Message so it can carry a language.
//
// Everything raised inside this package already is one; anything else is a
// failure the operator cannot act on, and its own text is the best available
// description of it.
func asMessage(err error) i18n.Message {
	if m, ok := err.(i18n.Message); ok {
		return m
	}
	return i18n.M(i18n.KeyPassthrough, err.Error())
}
