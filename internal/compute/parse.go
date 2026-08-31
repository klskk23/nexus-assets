package compute

import (
	"sort"
	"strings"

	"github.com/expr-lang/expr"

	"github.com/expr-lang/expr/ast"
	"github.com/expr-lang/expr/parser"
	"github.com/expr-lang/expr/vm"
	"github.com/klskk23/nexus-assets/internal/i18n"
)

// Program is a compiled expression together with what it reads.
//
// The references are extracted once, at compile time, because three separate
// guards consult them: cycle detection between computed fields, the binding
// gate that insists an expression's dependencies are bound and required, and
// the refusal to delete or unbind a field something still reads. Recomputing
// them at each call site would be three chances to disagree.
type Program struct {
	Name string
	Src  string
	refs []string
	prog *vm.Program
}

// References lists every context path the expression reads, longest form only:
// "attrs.mac", "category.code", "id".
func (p *Program) References() []string { return p.refs }

// AttrReferences narrows References to the custom field keys, which are the
// edges of the dependency graph between computed fields.
func (p *Program) AttrReferences() []string {
	var out []string
	for _, ref := range p.refs {
		if key, ok := strings.CutPrefix(ref, AttrPrefix+"."); ok && key != "" {
			// Only the first segment names a field.
			out = append(out, strings.SplitN(key, ".", 2)[0])
		}
	}
	sort.Strings(out)
	return dedupe(out)
}

// AttrPrefix is the context member that carries custom field values.
const AttrPrefix = "attrs"

// contextRoots are the only names an expression may start from.
//
// Everything else is either a function or a typo, and a typo has to be
// refused rather than resolved to nil: an undefined name would otherwise
// concatenate into an identifier as "<nil>" and only be noticed once it was in
// the database.
var contextRoots = map[string]bool{
	"id": true, AttrPrefix: true, "category": true, "model": true,
}

// Parse compiles an expression and refuses the constructs this project does
// not allow.
//
// The refusals are not stylistic. Each one closes a hole that would let static
// analysis be wrong about what an expression reads -- and "what does this
// read" is the question three guards are built on. See guard.Visit.
func Parse(name, src string) (*Program, error) {
	if strings.TrimSpace(src) == "" {
		return nil, named(name, i18n.M(i18n.KeyExprEmpty))
	}

	// Parsed before compiling: the guard has to run on the tree as written,
	// not on one an optimiser has rearranged.
	tree, err := parser.Parse(src)
	if err != nil {
		// expr's own message carries the column and an underline. It is
		// English whatever the reader asked for -- the same standing exception
		// third-party errors have always had here -- so it is wrapped in a
		// sentence that is not.
		return nil, named(name, i18n.M(i18n.KeyExprSyntax, err.Error()))
	}
	// Two passes: which identifiers are being called has to be known before
	// they are judged, and Walk gives no ordering guarantee between a call and
	// its callee.
	c := &calleeScan{set: map[ast.Node]bool{}}
	ast.Walk(&tree.Node, c)
	g := &guard{callees: c.set}
	ast.Walk(&tree.Node, g)
	if g.err != nil {
		return nil, named(name, g.err)
	}

	opts := append(Functions(),
		expr.Env(emptyEnv()),
		// The environment is a map, so its members cannot be typed ahead of
		// time -- attrs holds whatever fields the categories define.
		expr.AllowUndefinedVariables(),
	)
	prog, err := expr.Compile(src, opts...)
	if err != nil {
		return nil, named(name, i18n.M(i18n.KeyExprSyntax, err.Error()))
	}

	r := &refs{seen: map[string]struct{}{}}
	ast.Walk(&tree.Node, r)
	return &Program{Name: name, Src: src, refs: r.longest(), prog: prog}, nil
}

// calleeScan marks the identifiers that sit in a call position, so the guard
// can tell "no such function" from "no such context member" and say the one
// that helps.
type calleeScan struct{ set map[ast.Node]bool }

func (v *calleeScan) Visit(node *ast.Node) {
	if call, ok := (*node).(*ast.CallNode); ok {
		v.set[call.Callee] = true
	}
}

// guard refuses what would make the reference analysis lie, or what has no
// place in a rule that produces one identifier.
type guard struct {
	callees map[ast.Node]bool
	err     error
}

func (g *guard) Visit(node *ast.Node) {
	if g.err != nil {
		return
	}
	switch n := (*node).(type) {
	case *ast.MemberNode:
		// A computed subscript reads a field nothing can name in advance.
		// Allowing it would let a field be deleted while an expression still
		// reads it, and the failure would only show at the next save.
		switch n.Property.(type) {
		case *ast.StringNode, *ast.IntegerNode:
		default:
			g.err = i18n.M(i18n.KeyExprNameOutright, fragment(*node))
		}
	case *ast.PredicateNode:
		// The {...} of map/filter/any. Collection work has no place in a
		// numbering rule, and its cost is unbounded in a way nothing else here
		// is.
		g.err = i18n.M(i18n.KeyExprNoIteration)
	case *ast.BuiltinNode:
		if !allowedBuiltins[n.Name] {
			g.err = i18n.M(i18n.KeyExprBuiltinBlocked, n.Name, strings.Join(FunctionNames(), ", "))
		}
	case *ast.IdentifierNode:
		// expr resolves an unknown name to nil rather than complaining, so a
		// typo would concatenate into a serial number as "<nil>" and only be
		// noticed once it was in the database.
		if g.callees[*node] {
			if !isFunction(n.Value) {
				g.err = i18n.M(i18n.KeyExprNoSuchFunc, n.Value, strings.Join(FunctionNames(), ", "))
			}
			return
		}
		if !contextRoots[n.Value] {
			g.err = i18n.M(i18n.KeyExprNotReadable, n.Value)
		}
	}
}

func isFunction(name string) bool {
	for _, f := range FunctionNames() {
		if f == name {
			return true
		}
	}
	return false
}

// allowedBuiltins are expr's own builtins that earn their place.
//
// Everything else is refused rather than silently permitted: len and string
// are useful in a numbering rule; sum, map, sort and the rest belong to
// collection work this deliberately does not do.
var allowedBuiltins = map[string]bool{
	"len": true, "string": true, "int": true, "float": true,
	"trim": true, "upper": true, "lower": true,
	"split": true, "splitAfter": true, "replace": true, "repeat": true,
	"indexOf": true, "lastIndexOf": true, "hasPrefix": true, "hasSuffix": true,
	"abs": true, "ceil": true, "floor": true, "round": true,
}

// refs collects the context paths an expression reads.
type refs struct{ seen map[string]struct{} }

func (v *refs) Visit(node *ast.Node) {
	switch n := (*node).(type) {
	case *ast.MemberNode:
		if p := chain(n); p != "" {
			v.seen[p] = struct{}{}
		}
	case *ast.IdentifierNode:
		// A bare identifier is a context member too -- `id` is one, and a
		// visitor that only looked at member access would miss it. Function
		// names reach here as a call's callee and are not references.
		if contextRoots[n.Value] {
			v.seen[n.Value] = struct{}{}
		}
	}
}

// longest drops paths that another path extends, so a chain contributes
// "attrs.mac" rather than "attrs", "attrs.mac".
func (v *refs) longest() []string {
	all := make([]string, 0, len(v.seen))
	for k := range v.seen {
		all = append(all, k)
	}
	sort.Strings(all)

	out := []string{}
	for i, p := range all {
		extended := false
		for j, q := range all {
			if i != j && strings.HasPrefix(q, p+".") {
				extended = true
				break
			}
		}
		if !extended {
			out = append(out, p)
		}
	}
	return out
}

// chain renders a member access as a dotted path, or "" when it is not a plain
// chain of names.
func chain(n ast.Node) string {
	switch t := n.(type) {
	case *ast.IdentifierNode:
		return t.Value
	case *ast.MemberNode:
		base := chain(t.Node)
		s, ok := t.Property.(*ast.StringNode)
		if base == "" || !ok {
			return ""
		}
		return base + "." + s.Value
	}
	return ""
}

// fragment renders a node back to source for an error message.
func fragment(n ast.Node) string {
	if n == nil {
		return "the expression"
	}
	return n.String()
}

func dedupe(in []string) []string {
	if len(in) == 0 {
		return nil
	}
	out := in[:1]
	for _, v := range in[1:] {
		if v != out[len(out)-1] {
			out = append(out, v)
		}
	}
	return out
}

// named puts the field key in front of a message, so an operator editing five
// rules knows which one is complaining.
func named(name string, msg error) error {
	return i18n.M(i18n.KeyNamedProblem, name, msg)
}
