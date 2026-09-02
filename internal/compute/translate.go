package compute

import (
	"fmt"
	"strconv"
	"strings"
	"text/template"
	"text/template/parse"
)

// legacyFuncs are the names the old text/template engine accepted, needed only
// so a stored rule still parses while it is being translated.
var legacyFuncs = template.FuncMap{
	"hex2dec": nil, "dec2hex": nil, "pad": nil, "trunc": nil, "slice": nil,
	"upper": nil, "lower": nil, "trim": nil, "replace": nil, "default": nil,
	"printf": nil,
}

// Translate rewrites a rule from the old hex2dec(attrs.mac) syntax
// into an expression.
//
// It exists for one migration and is kept afterwards for the same reason a
// migration file is: someone restoring a backup from before the change will
// need it, and reconstructing it from memory would be worse than reading it.
//
// The two engines order pipe arguments differently -- text/template appended
// the piped value, expr prepends it -- so `pad 16` becomes `pad(x, 16)`. That
// inversion is the whole reason this is done from the syntax tree rather than
// with a regular expression.
func Translate(src string) (string, error) {
	if !strings.Contains(src, "{{") {
		// A rule with no actions at all was a constant. Quote it and it means
		// the same thing.
		return strconv.Quote(src), nil
	}
	// Every legacy function has to be declared for Parse to accept the text;
	// their bodies are never called.
	funcs := template.FuncMap{}
	for name := range legacyFuncs {
		funcs[name] = func(args ...any) any { return nil }
	}
	tmpl, err := template.New("legacy").Funcs(funcs).Parse(src)
	if err != nil {
		return "", fmt.Errorf("read the old rule: %w", err)
	}

	var parts []string
	for _, n := range tmpl.Root.Nodes {
		switch t := n.(type) {
		case *parse.TextNode:
			text := string(t.Text)
			if strings.TrimSpace(text) == "" && len(tmpl.Root.Nodes) == 1 {
				continue
			}
			parts = append(parts, strconv.Quote(text))
		case *parse.ActionNode:
			e, err := translatePipe(t.Pipe)
			if err != nil {
				return "", err
			}
			parts = append(parts, e)
		default:
			return "", fmt.Errorf("the old rule uses %T, which has no equivalent", n)
		}
	}
	if len(parts) == 0 {
		return "", fmt.Errorf("the old rule is empty")
	}
	if len(parts) == 1 {
		return parts[0], nil
	}
	// Several pieces joined: text/template concatenated whatever each produced,
	// so each piece has to become a string explicitly.
	for i, p := range parts {
		if !strings.HasPrefix(p, `"`) {
			parts[i] = "str(" + p + ")"
		}
	}
	return strings.Join(parts, " + "), nil
}

// translatePipe turns `X | f a | g` into `g(f(X, a))`.
func translatePipe(p *parse.PipeNode) (string, error) {
	if p == nil || len(p.Cmds) == 0 {
		return "", fmt.Errorf("the old rule has an empty action")
	}
	out, err := translateCmd(p.Cmds[0], "")
	if err != nil {
		return "", err
	}
	for _, cmd := range p.Cmds[1:] {
		if out, err = translateCmd(cmd, out); err != nil {
			return "", err
		}
	}
	return out, nil
}

// translateCmd renders one stage. `piped` is the value flowing in, empty for
// the first stage.
func translateCmd(cmd *parse.CommandNode, piped string) (string, error) {
	if len(cmd.Args) == 0 {
		return "", fmt.Errorf("the old rule has an empty stage")
	}
	head, err := translateArg(cmd.Args[0])
	if err != nil {
		return "", err
	}
	// A stage that is just a value: either the source, or a redundant pipe.
	if _, isFunc := legacyFuncs[head]; !isFunc {
		if piped != "" {
			return "", fmt.Errorf("the old rule pipes into %q, which is not a function", head)
		}
		return head, nil
	}

	args := make([]string, 0, len(cmd.Args))
	if piped != "" {
		// text/template put the piped value last; expr puts it first.
		args = append(args, piped)
	}
	for _, a := range cmd.Args[1:] {
		s, err := translateArg(a)
		if err != nil {
			return "", err
		}
		args = append(args, s)
	}
	if head == "printf" {
		return "", fmt.Errorf("printf has no equivalent; rewrite the rule by hand")
	}
	return head + "(" + strings.Join(args, ", ") + ")", nil
}

func translateArg(n parse.Node) (string, error) {
	switch t := n.(type) {
	case *parse.FieldNode:
		return strings.Join(t.Ident, "."), nil
	case *parse.IdentifierNode:
		return t.Ident, nil
	case *parse.StringNode:
		return t.Quoted, nil
	case *parse.NumberNode:
		return t.Text, nil
	case *parse.DotNode:
		return "", fmt.Errorf("the old rule uses a bare dot, which has no equivalent")
	case *parse.ChainNode:
		base, err := translateArg(t.Node)
		if err != nil {
			return "", err
		}
		return base + "." + strings.Join(t.Field, "."), nil
	default:
		return "", fmt.Errorf("the old rule uses %T, which has no equivalent", n)
	}
}
