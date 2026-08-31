package schema

import (
	"testing"

	"github.com/klskk23/nexus-assets/internal/i18n"
	"github.com/klskk23/nexus-assets/internal/model"
)

func f64(v float64) *float64 { return &v }
func i(v int) *int           { return &v }

func TestValidateOptionsAcceptsEveryType(t *testing.T) {
	cases := map[model.FieldType]model.FieldOptions{
		model.FieldText:     {Regex: `^[A-Z]{2}-\d{4}$`, RegexHint: "两位大写字母加四位数字"},
		model.FieldNumber:   {Min: f64(0), Max: f64(65535), Precision: i(0), Unit: "W"},
		model.FieldBoolean:  {},
		model.FieldDate:     {},
		model.FieldMAC:      {},
		model.FieldIP:       {},
		model.FieldURL:      {},
		model.FieldComputed: {Template: "hex2dec(attrs.mac)"},
	}
	if len(cases) != len(model.AllFieldTypes) {
		t.Fatalf("test covers %d types, model declares %d", len(cases), len(model.AllFieldTypes))
	}
	for typ, opts := range cases {
		if err := ValidateOptions(typ, opts); err != nil {
			t.Errorf("ValidateOptions(%s): %v", typ, err)
		}
	}
}

func TestValidateOptionsRejections(t *testing.T) {
	// Asserted by catalogue key rather than by wording: these messages are
	// shown to the operator in two languages, and a test pinned to one of them
	// fails the day someone improves the sentence.
	cases := []struct {
		name string
		typ  model.FieldType
		opts model.FieldOptions
		want string
	}{
		{"bad regex", model.FieldText, model.FieldOptions{Regex: "([a-z"}, i18n.KeyOptRegexInvalid},
		{"min above max", model.FieldNumber, model.FieldOptions{Min: f64(10), Max: f64(1)}, i18n.KeyOptMinAboveMax},
		{"precision out of range", model.FieldNumber, model.FieldOptions{Precision: i(11)}, i18n.KeyOptPrecisionRange},
		// The withdrawn types are now unknown ones, which is the whole point:
		// nothing can create a field the product no longer has.
		{"withdrawn enum type", model.FieldType("enum"), model.FieldOptions{}, i18n.KeyFieldTypeUnknown},
		{"withdrawn reference type", model.FieldType("reference"), model.FieldOptions{}, i18n.KeyFieldTypeUnknown},
		{"computed without template", model.FieldComputed, model.FieldOptions{}, i18n.KeyOptTemplateEmpty},
		{"computed with control flow", model.FieldComputed, model.FieldOptions{
			Template: `map(1..3, {#})`}, i18n.KeyExprNoIteration},
		{"unknown type", model.FieldType("nope"), model.FieldOptions{}, i18n.KeyFieldTypeUnknown},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := ValidateOptions(tc.typ, tc.opts)
			if err == nil {
				t.Fatal("expected rejection")
			}
			if !i18n.HasKey(err, tc.want) {
				t.Errorf("error should carry key %q, got: %v", tc.want, err)
			}
		})
	}
}
