package compute

import (
	"reflect"
	"testing"
)

func refsOf(t *testing.T, text string) []string {
	t.Helper()
	tmpl, err := Parse("t", text)
	if err != nil {
		t.Fatalf("Parse(%q): %v", text, err)
	}
	return AttrReferences(tmpl.Tree.Root)
}

// The regex-would-get-this-wrong cases.
func TestAttrReferencesThroughNestedPipelines(t *testing.T) {
	cases := []struct {
		text string
		want []string
	}{
		{`{{ .attrs.mac | hex2dec }}`, []string{"mac"}},
		{`{{ .attrs.mac | hex2dec | pad 16 }}`, []string{"mac"}},
		{`{{ printf "%s-%s" .category.code (.attrs.mac | hex2dec) }}`, []string{"mac"}},
		{`{{ printf "%s%s" (.attrs.a | upper) (.attrs.b | lower) }}`, []string{"a", "b"}},
		// A literal that merely looks like a reference must not be picked up.
		{`{{ replace ".attrs.fake" "" .attrs.real }}`, []string{"real"}},
		{`{{ .id }}`, nil},
	}
	for _, tc := range cases {
		got := refsOf(t, tc.text)
		if !reflect.DeepEqual(got, tc.want) {
			t.Errorf("AttrReferences(%q) = %v, want %v", tc.text, got, tc.want)
		}
	}
}

func TestReferencesIncludeNonAttrPaths(t *testing.T) {
	tmpl, err := Parse("t", `{{ printf "%s-%s" .category.code (.attrs.mac | hex2dec) }}`)
	if err != nil {
		t.Fatal(err)
	}
	got := References(tmpl.Tree.Root)
	want := []string{"attrs.mac", "category.code"}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("References = %v, want %v", got, want)
	}
}
