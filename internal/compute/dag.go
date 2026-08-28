package compute

import (
	"fmt"
	"sort"
	"strings"
)

// TopoSort orders computed field keys so every field comes after the fields it
// reads.
//
// deps maps a computed field key to the keys it references. References to
// non-computed fields are ignored: those values are already present before
// evaluation starts.
func TopoSort(deps map[string][]string) ([]string, error) {
	if cycle := findCycle(deps); cycle != nil {
		return nil, fmt.Errorf("computed fields form a cycle: %s", strings.Join(cycle, " -> "))
	}

	keys := make([]string, 0, len(deps))
	for k := range deps {
		keys = append(keys, k)
	}
	sort.Strings(keys) // deterministic order for equal-depth nodes

	state := make(map[string]int, len(deps)) // 0 unvisited, 2 done
	out := make([]string, 0, len(deps))

	var visit func(string)
	visit = func(k string) {
		if state[k] != 0 {
			return
		}
		state[k] = 2
		reqs := append([]string(nil), deps[k]...)
		sort.Strings(reqs)
		for _, d := range reqs {
			if _, isComputed := deps[d]; isComputed {
				visit(d)
			}
		}
		out = append(out, k)
	}
	for _, k := range keys {
		visit(k)
	}
	return out, nil
}

// findCycle returns one cycle path, or nil when the graph is acyclic.
func findCycle(deps map[string][]string) []string {
	const (
		white = 0
		grey  = 1
		black = 2
	)
	colour := make(map[string]int, len(deps))
	var stack []string
	var cycle []string

	keys := make([]string, 0, len(deps))
	for k := range deps {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	var visit func(string) bool
	visit = func(k string) bool {
		colour[k] = grey
		stack = append(stack, k)

		reqs := append([]string(nil), deps[k]...)
		sort.Strings(reqs)
		for _, d := range reqs {
			if _, isComputed := deps[d]; !isComputed {
				continue
			}
			switch colour[d] {
			case grey:
				// Cut the stack down to where the cycle opened.
				for i, s := range stack {
					if s == d {
						cycle = append(append([]string{}, stack[i:]...), d)
						break
					}
				}
				return true
			case white:
				if visit(d) {
					return true
				}
			}
		}
		stack = stack[:len(stack)-1]
		colour[k] = black
		return false
	}

	for _, k := range keys {
		if colour[k] == white && visit(k) {
			return cycle
		}
	}
	return nil
}
