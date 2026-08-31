package i18n

import (
	"errors"
	"fmt"
	"reflect"
	"regexp"
	"testing"
)

// Two catalogues that have drifted apart are the failure this whole package
// exists to prevent: a key present in one language and missing in the other
// shows a bare key on screen, and nothing else would catch it.
func TestCatalogsCoverTheSameKeys(t *testing.T) {
	zh, en := Keys(ZH), Keys(EN)
	if !reflect.DeepEqual(zh, en) {
		missing := diff(zh, en)
		extra := diff(en, zh)
		t.Errorf("catalogues disagree.\nonly in zh: %v\nonly in en: %v", missing, extra)
	}
}

// The arguments are supplied once, by the code that raised the message, and
// rendered into whichever string the reader's language selects. A verb that
// appears in one language and not the other produces %!s(MISSING) for exactly
// the readers who are not testing it.
func TestVerbSequencesMatchAcrossLanguages(t *testing.T) {
	for _, k := range Keys(ZH) {
		zh, en := slots(catalogs[ZH][k]), slots(catalogs[EN][k])
		if !reflect.DeepEqual(zh, en) {
			t.Errorf("%s: zh consumes %v, en consumes %v", k, zh, en)
		}
	}
}

func TestUnknownKeyRendersAsTheKey(t *testing.T) {
	// Visible and traceable beats invisible: a missing translation should look
	// like a bug, not like an empty label.
	if got := M("no.such.key").In(EN); got != "no.such.key" {
		t.Errorf("got %q", got)
	}
}

func TestUntranslatedKeyFallsBackToTheDefaultLanguage(t *testing.T) {
	catalogs[ZH]["test.only.zh"] = "只有中文"
	t.Cleanup(func() { delete(catalogs[ZH], "test.only.zh") })

	if got := M("test.only.zh").In(EN); got != "只有中文" {
		t.Errorf("got %q, want the default-language text", got)
	}
}

func TestWrapKeepsTheSentinelFindable(t *testing.T) {
	sentinel := errors.New("holder entity is still referenced")
	err := Wrap(sentinel, KeyHolderHasChildren, "XX 集团", 2)

	if !errors.Is(err, sentinel) {
		t.Fatal("errors.Is must still find the sentinel -- the HTTP layer switches on it")
	}
	if got := Text(err, EN); got != `"XX 集团" still has 2 item(s) under it. Move or delete them first.` {
		t.Errorf("en = %q", got)
	}
	if got := Text(err, ZH); got != "「XX 集团」下还有 2 个下级，请先移走或删除它们" {
		t.Errorf("zh = %q", got)
	}
}

// A message wrapped again on the way up must still be reachable, or every
// intermediate fmt.Errorf would silently drop the translation.
func TestTextWalksTheChain(t *testing.T) {
	inner := Wrap(errors.New("boom"), KeyFieldRequired)
	outer := fmt.Errorf("saving asset: %w", inner)

	if got := Text(outer, EN); got != "This field is required." {
		t.Errorf("got %q", got)
	}
	if !HasText(outer) {
		t.Error("HasText should see through the wrapper too")
	}
}

func TestPlainErrorFallsBackToItsOwnText(t *testing.T) {
	err := errors.New("disk on fire")
	if got := Text(err, EN); got != "disk on fire" {
		t.Errorf("got %q", got)
	}
	if HasText(err) {
		t.Error("a plain error carries no translatable message")
	}
}

func TestParseAcceptLanguage(t *testing.T) {
	for header, want := range map[string]Lang{
		"":                        Default,
		"zh-CN,zh;q=0.9,en;q=0.8": ZH,
		"en-GB,en;q=0.9":          EN,
		"EN":                      EN,
		"fr-FR,fr;q=0.9":          Default,
		// An unsupported tag first must not stop a supported one behind it.
		"fr-FR,en;q=0.8": EN,
		"  zh-TW  ":      ZH,
	} {
		if got := Parse(header); got != want {
			t.Errorf("Parse(%q) = %q, want %q", header, got, want)
		}
	}
}

var verbPattern = regexp.MustCompile(`%[-+# 0-9.]*[a-zA-Z]`)

// slots reduces a format string to the sequence of argument kinds it consumes.
//
// %q and %s are the same slot -- both take the string the caller passed, and
// whether a language quotes it is a typographic choice. %d and %v are not
// interchangeable with them, and swapping two slots is the mistake worth
// catching: it silently prints a count where a name belongs.
func slots(format string) []string {
	out := []string{}
	for _, v := range verbPattern.FindAllString(format, -1) {
		kind := v[len(v)-1:]
		if kind == "q" {
			kind = "s"
		}
		out = append(out, kind)
	}
	return out
}

func diff(a, b []string) []string {
	have := make(map[string]bool, len(b))
	for _, s := range b {
		have[s] = true
	}
	var out []string
	for _, s := range a {
		if !have[s] {
			out = append(out, s)
		}
	}
	return out
}
