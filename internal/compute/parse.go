package compute

import (
	"fmt"
	"text/template"
	"text/template/parse"
)

// Parse compiles a template and rejects the constructs this project does not
// allow.
//
// An unknown function name is caught by text/template itself at parse time,
// which is why there is no explicit whitelist check here.
func Parse(name, text string) (*template.Template, error) {
	tmpl, err := template.New(name).Funcs(FuncMap()).Option("missingkey=zero").Parse(text)
	if err != nil {
		return nil, fmt.Errorf("parse template: %w", err)
	}
	if err := rejectControlFlow(tmpl.Tree.Root); err != nil {
		return nil, err
	}
	return tmpl, nil
}

// rejectControlFlow walks the syntax tree and refuses branching and iteration.
func rejectControlFlow(n parse.Node) error {
	var bad string
	walk(n, func(node parse.Node) {
		if bad != "" {
			return
		}
		switch node.(type) {
		case *parse.IfNode:
			bad = "if"
		case *parse.RangeNode:
			bad = "range"
		case *parse.WithNode:
			bad = "with"
		case *parse.TemplateNode:
			bad = "template"
		}
	})
	if bad != "" {
		return fmt.Errorf(
			"templates may not use %q: identifier rules must stay a plain mapping from other fields",
			bad)
	}
	return nil
}

// walk visits every node in the tree.
func walk(n parse.Node, fn func(parse.Node)) {
	if n == nil {
		return
	}
	fn(n)
	switch t := n.(type) {
	case *parse.ListNode:
		if t == nil {
			return
		}
		for _, c := range t.Nodes {
			walk(c, fn)
		}
	case *parse.ActionNode:
		walk(t.Pipe, fn)
	case *parse.PipeNode:
		if t == nil {
			return
		}
		for _, c := range t.Cmds {
			walk(c, fn)
		}
	case *parse.CommandNode:
		for _, a := range t.Args {
			walk(a, fn)
		}
	case *parse.IfNode:
		walkBranch(&t.BranchNode, fn)
	case *parse.RangeNode:
		walkBranch(&t.BranchNode, fn)
	case *parse.WithNode:
		walkBranch(&t.BranchNode, fn)
	case *parse.ChainNode:
		walk(t.Node, fn)
	}
}

func walkBranch(b *parse.BranchNode, fn func(parse.Node)) {
	walk(b.Pipe, fn)
	if b.List != nil {
		walk(b.List, fn)
	}
	if b.ElseList != nil {
		walk(b.ElseList, fn)
	}
}
