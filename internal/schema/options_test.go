package schema

import (
	"strings"
	"testing"

	"github.com/klskk23/nexus-assets/internal/model"
)

func f64(v float64) *float64 { return &v }
func i(v int) *int           { return &v }

func TestValidateOptionsAcceptsEveryType(t *testing.T) {
	cases := map[model.FieldType]model.FieldOptions{
		model.FieldText:    {Regex: `^[A-Z]{2}-\d{4}$`, RegexHint: "两位大写字母加四位数字"},
		model.FieldNumber:  {Min: f64(0), Max: f64(65535), Precision: i(0), Unit: "W"},
		model.FieldBoolean: {},
		model.FieldDate:    {},
		model.FieldEnum: {
			Choices:    []model.EnumChoice{{Value: "v213", Label: "2.1.3"}, {Value: "v190", Label: "1.9.0"}},
			Deprecated: []string{"v190"},
		},
		model.FieldReference: {Target: "entity", EntityTypes: []model.EntityType{model.EntityLocation}},
		model.FieldMAC:       {},
		model.FieldIP:        {},
		model.FieldURL:       {},
		model.FieldComputed:  {Template: "hex2dec(attrs.mac)"},
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
	cases := []struct {
		name string
		typ  model.FieldType
		opts model.FieldOptions
		want string
	}{
		{"bad regex", model.FieldText, model.FieldOptions{Regex: "([a-z"}, "regex"},
		{"min above max", model.FieldNumber, model.FieldOptions{Min: f64(10), Max: f64(1)}, "greater than max"},
		{"enum with no choices", model.FieldEnum, model.FieldOptions{}, "at least one choice"},
		{"duplicate enum value", model.FieldEnum, model.FieldOptions{
			Choices: []model.EnumChoice{{Value: "a"}, {Value: "a"}}}, "duplicate"},
		{"deprecated value not among choices", model.FieldEnum, model.FieldOptions{
			Choices: []model.EnumChoice{{Value: "a"}}, Deprecated: []string{"ghost"}}, "not among the choices"},
		{"reference without target", model.FieldReference, model.FieldOptions{}, "must be"},
		{"entity types on a user reference", model.FieldReference, model.FieldOptions{
			Target: "user", EntityTypes: []model.EntityType{model.EntityLocation}}, "only applies"},
		{"computed without template", model.FieldComputed, model.FieldOptions{}, "needs a template"},
		{"computed with control flow", model.FieldComputed, model.FieldOptions{
			Template: `map(1..3, {#})`}, "不能做遍历"},
		{"unknown type", model.FieldType("nope"), model.FieldOptions{}, "unknown field type"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := ValidateOptions(tc.typ, tc.opts)
			if err == nil {
				t.Fatal("expected rejection")
			}
			if !strings.Contains(err.Error(), tc.want) {
				t.Errorf("error should mention %q, got: %v", tc.want, err)
			}
		})
	}
}

func TestDeprecatedChoiceHelpers(t *testing.T) {
	o := model.FieldOptions{
		Choices:    []model.EnumChoice{{Value: "v213"}, {Value: "v190"}},
		Deprecated: []string{"v190"},
	}
	if !ChoiceExists(o, "v190") {
		t.Error("a deprecated value must still be a known choice so old assets render")
	}
	if !IsDeprecatedChoice(o, "v190") {
		t.Error("v190 should report as deprecated")
	}
	if IsDeprecatedChoice(o, "v213") {
		t.Error("v213 is current")
	}
}
