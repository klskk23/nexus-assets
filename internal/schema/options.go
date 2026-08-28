package schema

import (
	"fmt"
	"regexp"
	"slices"

	"github.com/klskk23/nexus-assets/internal/compute"
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
				return fmt.Errorf("regex %q is not valid: %w", o.Regex, err)
			}
		}
	case model.FieldNumber:
		if o.Min != nil && o.Max != nil && *o.Min > *o.Max {
			return fmt.Errorf("min %v is greater than max %v", *o.Min, *o.Max)
		}
		if o.Precision != nil && (*o.Precision < 0 || *o.Precision > 10) {
			return fmt.Errorf("precision must be between 0 and 10, got %d", *o.Precision)
		}
	case model.FieldEnum:
		if len(o.Choices) == 0 {
			return fmt.Errorf("an enum field needs at least one choice")
		}
		seen := map[string]bool{}
		for _, c := range o.Choices {
			if c.Value == "" {
				return fmt.Errorf("enum choice values may not be empty")
			}
			if seen[c.Value] {
				return fmt.Errorf("duplicate enum choice %q", c.Value)
			}
			seen[c.Value] = true
		}
		for _, d := range o.Deprecated {
			if !seen[d] {
				return fmt.Errorf("deprecated value %q is not among the choices; "+
					"removed options stay listed so existing assets keep displaying them", d)
			}
		}
	case model.FieldReference:
		switch o.Target {
		case "user":
			if len(o.EntityTypes) > 0 {
				return fmt.Errorf("entity_types only applies when target is \"entity\"")
			}
		case "entity":
			for _, et := range o.EntityTypes {
				if !slices.Contains([]model.EntityType{
					model.EntityCompany, model.EntityLocation, model.EntityDepartment,
				}, et) {
					return fmt.Errorf("unknown entity type %q", et)
				}
			}
		default:
			return fmt.Errorf("reference target must be \"user\" or \"entity\", got %q", o.Target)
		}
	case model.FieldComputed:
		if o.Template == "" {
			return fmt.Errorf("a computed field needs a template")
		}
		if _, err := compute.Parse("field", o.Template); err != nil {
			return err
		}
	case model.FieldBoolean, model.FieldDate, model.FieldMAC, model.FieldIP, model.FieldURL:
		// No configuration; normalisation and validation are built in.
	default:
		return fmt.Errorf("unknown field type %q", t)
	}
	return nil
}

// IsDeprecatedChoice reports whether a stored enum value has been retired.
// Retired values keep displaying on existing assets but cannot be chosen anew.
func IsDeprecatedChoice(o model.FieldOptions, value string) bool {
	return slices.Contains(o.Deprecated, value)
}

// ChoiceExists reports whether a value is among the declared choices.
func ChoiceExists(o model.FieldOptions, value string) bool {
	for _, c := range o.Choices {
		if c.Value == value {
			return true
		}
	}
	return false
}
