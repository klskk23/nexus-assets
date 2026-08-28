package asset

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/schema"
)

// FieldErrors maps a field key to a user-facing message. It becomes the
// "fields" member of the error envelope, which is what lets the dynamic form
// put each message next to the right input.
type FieldErrors map[string]string

// Error renders a summary.
func (e FieldErrors) Error() string {
	keys := make([]string, 0, len(e))
	for k := range e {
		keys = append(keys, k)
	}
	return fmt.Sprintf("validation failed for %s", strings.Join(keys, ", "))
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
				errs[f.Key] = "此字段必填"
			}
			continue
		}

		v, err := validateOne(f, raw)
		if err != nil {
			errs[f.Key] = err.Error()
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
				return nil, fmt.Errorf("字段配置的校验规则无效")
			}
			if !re.MatchString(s) {
				if f.Options.RegexHint != "" {
					return nil, fmt.Errorf("格式不符合要求：%s", f.Options.RegexHint)
				}
				return nil, fmt.Errorf("格式不符合要求")
			}
		}
		return s, nil

	case model.FieldNumber:
		n, err := strconv.ParseFloat(s, 64)
		if err != nil {
			return nil, fmt.Errorf("必须是数字")
		}
		if f.Options.Min != nil && n < *f.Options.Min {
			return nil, fmt.Errorf("不能小于 %v", *f.Options.Min)
		}
		if f.Options.Max != nil && n > *f.Options.Max {
			return nil, fmt.Errorf("不能大于 %v", *f.Options.Max)
		}
		return n, nil

	case model.FieldBoolean:
		b, err := strconv.ParseBool(s)
		if err != nil {
			return nil, fmt.Errorf("必须是是或否")
		}
		return b, nil

	case model.FieldDate:
		if _, err := time.Parse("2006-01-02", s); err != nil {
			return nil, fmt.Errorf("日期格式应为 YYYY-MM-DD")
		}
		return s, nil

	case model.FieldEnum:
		if !schema.ChoiceExists(f.Options, s) {
			return nil, fmt.Errorf("不是可选值之一")
		}
		if schema.IsDeprecatedChoice(f.Options, s) {
			// A retired option stays readable on existing assets but may not be
			// chosen anew, which is what separates "archive" from "delete".
			return nil, fmt.Errorf("该选项已废弃，请选择其他值")
		}
		return s, nil

	case model.FieldReference:
		if s == "" {
			return nil, fmt.Errorf("必须选择一个目标")
		}
		return s, nil // existence is checked against the database by the caller

	default:
		return nil, fmt.Errorf("未知的字段类型 %s", f.Type)
	}
}

// ValidateHolderForStatus enforces the coupling between status and holder.
//
// in_stock means the device is sitting in a warehouse. Allowing "in stock but
// held by a person" would leave the stocktake question -- which warehouse is it
// in -- unanswerable.
func ValidateHolderForStatus(status model.AssetStatus, holder model.Holder, entityType model.EntityType) error {
	if !model.RequiresLocationHolder(status) {
		return nil
	}
	if holder.Type != model.HolderTypeEntity || entityType != model.EntityLocation {
		return fmt.Errorf("在库状态的持有方必须是一个位置")
	}
	return nil
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
