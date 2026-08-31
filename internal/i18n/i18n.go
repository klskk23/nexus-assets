// Package i18n renders user-facing server messages in the caller's language.
//
// The domain packages do not format their own text any more. They return a
// Message -- a catalogue key plus its arguments -- and the HTTP layer renders
// it once, in whatever language the request asked for. That split is what
// makes a second language possible without every refusal in the system
// growing a language parameter.
//
// Identifiers, logs and error codes stay English (constitution principle V).
// Only what a person reads on screen goes through here.
package i18n

import (
	"errors"
	"fmt"
	"sort"
	"strings"
)

// Lang is a supported interface language.
type Lang string

const (
	ZH Lang = "zh"
	EN Lang = "en"
)

// Default is what an unrecognised or absent Accept-Language falls back to.
//
// The deployment is a Chinese-speaking company; an English-speaking visitor
// gets English by asking, which their browser does automatically.
const Default = ZH

// Supported lists the languages, in the order a picker should show them.
var Supported = []Lang{ZH, EN}

// Message is one translatable string: a catalogue key and its arguments.
//
// It is an error as well as a message, so a domain function can return it
// directly. Error() renders Chinese, which keeps logs and test assertions
// readable without either having to know about languages.
type Message struct {
	Key  string
	Args []any
}

// M builds a message.
func M(key string, args ...any) Message { return Message{Key: key, Args: args} }

// Error renders the message in the default language.
func (m Message) Error() string { return m.In(Default) }

// In renders the message in one language.
//
// An unknown key renders as the key itself rather than as an empty string: a
// missing translation should be obvious and traceable, not invisible.
func (m Message) In(l Lang) string {
	format, ok := lookup(l, m.Key)
	if !ok {
		return m.Key
	}
	if len(m.Args) == 0 {
		return format
	}
	return fmt.Sprintf(format, localize(l, m.Args)...)
}

// localizable is anything that can render itself in a language.
//
// Message satisfies it, which is what lets one message be an argument of
// another: "a department may only belong to a company" is one string with two
// translatable nouns inside it, and resolving those nouns at construction time
// would freeze them into whatever language the writer happened to be in.
type localizable interface{ In(l Lang) string }

func localize(l Lang, args []any) []any {
	out := make([]any, len(args))
	for i, a := range args {
		if loc, ok := a.(localizable); ok {
			out[i] = loc.In(l)
		} else {
			out[i] = a
		}
	}
	return out
}

// joined renders a list with a translated separator.
type joined struct {
	sepKey string
	parts  []any
}

// Join builds a list whose separator is itself translated -- 「或」 and " or "
// are not interchangeable, and neither is the spacing around them.
func Join(sepKey string, parts ...any) any { return joined{sepKey: sepKey, parts: parts} }

func (j joined) In(l Lang) string {
	rendered := make([]string, 0, len(j.parts))
	for _, p := range localize(l, j.parts) {
		rendered = append(rendered, fmt.Sprint(p))
	}
	sep, ok := lookup(l, j.sepKey)
	if !ok {
		sep = j.sepKey
	}
	return strings.Join(rendered, sep)
}

func (j joined) String() string { return j.In(Default) }

func lookup(l Lang, key string) (string, bool) {
	if cat, ok := catalogs[l]; ok {
		if s, ok := cat[key]; ok {
			return s, true
		}
	}
	// Falling back to the default catalogue means a key added in Chinese and
	// not yet translated shows Chinese rather than a bare key.
	s, ok := catalogs[Default][key]
	return s, ok
}

// wrapped pairs a sentinel with a translatable message.
//
// errors.Is still finds the sentinel, which is what the HTTP layer switches
// on, while Text can reach the Message underneath and render it.
type wrapped struct {
	sentinel error
	msg      Message
}

func (w wrapped) Error() string { return w.sentinel.Error() + "：" + w.msg.Error() }
func (w wrapped) Unwrap() error { return w.sentinel }
func (w wrapped) Msg() Message  { return w.msg }
func (w wrapped) Is(target error) bool {
	return errors.Is(w.sentinel, target)
}

// Wrap ties a sentinel to a translatable message.
func Wrap(sentinel error, key string, args ...any) error {
	return wrapped{sentinel: sentinel, msg: M(key, args...)}
}

// messenger is anything carrying a renderable message.
type messenger interface{ Msg() Message }

// Text renders whatever user-facing message an error carries.
//
// It walks the chain, so a message wrapped by fmt.Errorf on the way up is
// still found. An error with none falls back to Error() -- an internal failure
// the HTTP layer will replace with a generic message anyway.
func Text(err error, l Lang) string {
	for e := err; e != nil; e = errors.Unwrap(e) {
		if m, ok := e.(Message); ok {
			return m.In(l)
		}
		if w, ok := e.(messenger); ok {
			return w.Msg().In(l)
		}
	}
	if err == nil {
		return ""
	}
	return err.Error()
}

// HasText reports whether an error carries a translatable message.
func HasText(err error) bool {
	for e := err; e != nil; e = errors.Unwrap(e) {
		if _, ok := e.(Message); ok {
			return true
		}
		if _, ok := e.(messenger); ok {
			return true
		}
	}
	return false
}

// Parse picks a language from an Accept-Language header.
//
// Deliberately small: the header's full grammar allows weights and wildcards,
// but this app has two languages and a default, so the first supported tag
// wins and everything else falls through. Getting q-values subtly wrong would
// be worse than ignoring them.
func Parse(header string) Lang {
	for _, part := range strings.Split(header, ",") {
		tag := strings.ToLower(strings.TrimSpace(strings.SplitN(part, ";", 2)[0]))
		switch {
		case tag == "":
			continue
		case strings.HasPrefix(tag, "zh"):
			return ZH
		case strings.HasPrefix(tag, "en"):
			return EN
		}
	}
	return Default
}

// Keys lists every catalogue key, sorted. Used by the parity test.
func Keys(l Lang) []string {
	out := make([]string, 0, len(catalogs[l]))
	for k := range catalogs[l] {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}
