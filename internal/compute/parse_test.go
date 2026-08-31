package compute

import (
	"reflect"
	"strings"
	"testing"

	"github.com/klskk23/nexus-assets/internal/i18n"
)

// Reference extraction is what cycle detection, the binding gate and the
// "referenced means refused" guards are all built on. If it misses something,
// those three go quiet rather than wrong -- which is worse.
func TestReferencesSeeThroughEveryConstruct(t *testing.T) {
	for _, tc := range []struct {
		src  string
		want []string
	}{
		{`attrs.mac`, []string{"attrs.mac"}},
		{`hex2dec(attrs.mac)`, []string{"attrs.mac"}},
		{`attrs.mac | hex2dec()`, []string{"attrs.mac"}},
		{`attrs.mac | hex2dec() | pad(16)`, []string{"attrs.mac"}},
		{`upper(trim(attrs.mac))`, []string{"attrs.mac"}},
		{`category.code + "-" + attrs.seq`, []string{"attrs.seq", "category.code"}},
		{`attrs.sn ?? hex2dec(attrs.mac)`, []string{"attrs.mac", "attrs.sn"}},
		{`attrs.kind == "spare" ? attrs.a : attrs.b`, []string{"attrs.a", "attrs.b", "attrs.kind"}},
		// A bare identifier is a context member too. A visitor that only
		// looked at member access would drop this one silently.
		{`id`, []string{"id"}},
		{`id + "-" + attrs.mac`, []string{"attrs.mac", "id"}},
		// A chain contributes its longest form, not every prefix of it.
		{`attrs.a.b.c`, []string{"attrs.a.b.c"}},
		// Literals are not references, however much they look like paths.
		{`"attrs.mac"`, []string{}},
	} {
		p, err := Parse("k", tc.src)
		if err != nil {
			t.Errorf("%s: %v", tc.src, err)
			continue
		}
		if got := p.References(); !reflect.DeepEqual(got, tc.want) {
			t.Errorf("%s: references = %v, want %v", tc.src, got, tc.want)
		}
	}
}

func TestAttrReferencesNarrowsToFieldKeys(t *testing.T) {
	p, err := Parse("k", `category.code + "-" + hex2dec(attrs.mac) + attrs.seq + id`)
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"mac", "seq"}
	if got := p.AttrReferences(); !reflect.DeepEqual(got, want) {
		t.Errorf("attr references = %v, want %v", got, want)
	}
}

// The three refusals are the point of this pass, not house style. Each one
// closes a way for the analysis above to be wrong.
func TestGuardRefusesWhatWouldMakeAnalysisLie(t *testing.T) {
	for _, tc := range []struct{ src, key string }{
		// Nothing can name the field this reads, so the field could be deleted
		// while an expression still depends on it.
		{`attrs[attrs.which]`, i18n.KeyExprNameOutright},
		// Caught one guard earlier, by the one that refuses unknown names --
		// which is the better message of the two.
		{`attrs[somevar]`, i18n.KeyExprNotReadable},
		// Collection work has no place in a numbering rule, and its cost is
		// unbounded in a way nothing else here is.
		{`map(1..100, {# * 2})`, i18n.KeyExprNoIteration},
		{`filter(1..10, {# > 5})`, i18n.KeyExprNoIteration},
		{`sum(1..1000000)`, i18n.KeyExprBuiltinBlocked},
		{`sort([3, 1, 2])`, i18n.KeyExprBuiltinBlocked},
	} {
		err := mustFail(t, tc.src)
		if err != nil && !i18n.HasKey(err, tc.key) {
			t.Errorf("%s: want %s, got %v", tc.src, tc.key, err)
		}
	}
}

// A constant subscript names a field just as plainly as dotted access, so it
// is allowed and analysed identically.
func TestConstantSubscriptIsATrueReference(t *testing.T) {
	p, err := Parse("k", `attrs["mac"]`)
	if err != nil {
		t.Fatal(err)
	}
	if got := p.AttrReferences(); !reflect.DeepEqual(got, []string{"mac"}) {
		t.Errorf("attr references = %v", got)
	}
}

// expr resolves an unknown name to nil rather than complaining. Left alone,
// a typo would concatenate into a serial number as "<nil>" and only be noticed
// once it was in the database, in the column assets are identified by.
func TestUnknownNamesAreRefusedRatherThanResolvedToNil(t *testing.T) {
	for _, tc := range []struct{ src, key string }{
		{`nosuch.thing`, i18n.KeyExprNotReadable},
		{`attrs.mac + suffix`, i18n.KeyExprNotReadable},
		{`hex2decc(attrs.mac)`, i18n.KeyExprNoSuchFunc},
		{`md5(attrs.mac)`, i18n.KeyExprNoSuchFunc},
	} {
		err := mustFail(t, tc.src)
		if err != nil && !i18n.HasKey(err, tc.key) {
			t.Errorf("%s: want %s, got %v", tc.src, tc.key, err)
		}
	}
}

func TestUsefulBuiltinsStayAvailable(t *testing.T) {
	for _, src := range []string{
		`len(attrs.mac) > 4 ? attrs.mac : "short"`,
		`string(attrs.seq)`,
		`hasPrefix(attrs.mac, "00")` + ` ? "A" : "B"`,
	} {
		if _, err := Parse("k", src); err != nil {
			t.Errorf("%s: %v", src, err)
		}
	}
}

func TestEmptyExpressionIsRefused(t *testing.T) {
	if _, err := Parse("k", "   "); err == nil {
		t.Fatal("an empty expression must be refused")
	}
}

// The name is in front so the operator knows which rule failed, and expr's own
// message carries the column.
func TestSyntaxErrorNamesTheFieldAndThePosition(t *testing.T) {
	_, err := Parse("sn", `attrs.mac +`)
	if err == nil {
		t.Fatal("a syntax error must be reported")
	}
	// The separator is copy, so it differs by language; what matters is that
	// the key comes first.
	if !strings.HasPrefix(err.Error(), "sn") {
		t.Errorf("message should start with the field key, got %v", err)
	}
	if !strings.Contains(err.Error(), "1:") {
		t.Errorf("message should carry a position, got %v", err)
	}
}

// mustFail parses and insists it was refused, returning the error to assert on.
func mustFail(t *testing.T, src string) error {
	t.Helper()
	_, err := Parse("k", src)
	if err == nil {
		t.Errorf("%s should have been refused", src)
	}
	return err
}
