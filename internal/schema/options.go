package schema

import (
	"regexp"

	"github.com/klskk23/nexus-assets/internal/compute"
	"github.com/klskk23/nexus-assets/internal/i18n"
	"github.com/klskk23/nexus-assets/internal/model"
)

// ValidateOptions checks that a field's configuration matches its type.
//
// The shape of options is decided entirely by the type, so this is where the
// contract in data-model.md is enforced. Getting it wrong here would surface
// much later as a form that cannot render or a template that cannot evaluate.
func ValidateOptions(t model.FieldType, o model.FieldOptions) error {
	switch t {
	case model.FieldText:
		if o.Regex != "" {
			if _, err := regexp.Compile(o.Regex); err != nil {
				return i18n.M(i18n.KeyOptRegexInvalid, o.Regex)
			}
		}
	case model.FieldNumber:
		if o.Min != nil && o.Max != nil && *o.Min > *o.Max {
			return i18n.M(i18n.KeyOptMinAboveMax, *o.Min, *o.Max)
		}
		if o.Precision != nil && (*o.Precision < 0 || *o.Precision > 10) {
			return i18n.M(i18n.KeyOptPrecisionRange, *o.Precision)
		}
	case model.FieldComputed:
		if o.Template == "" {
			return i18n.M(i18n.KeyOptTemplateEmpty)
		}
		if _, err := compute.Parse("field", o.Template); err != nil {
			return err
		}
	case model.FieldBoolean, model.FieldDate, model.FieldMAC, model.FieldIP, model.FieldURL:
		// No configuration; normalisation and validation are built in.
	default:
		return i18n.M(i18n.KeyFieldTypeUnknown, string(t))
	}
	return nil
}
