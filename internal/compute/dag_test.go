package compute

import (
	"strings"
	"testing"
)

func TestTopoSortOrdersDependenciesFirst(t *testing.T) {
	// full <- base <- mac(plain). plain fields are not part of the graph.
	deps := map[string][]string{
		"full": {"base", "prefix"},
		"base": {"mac"},
	}
	got, err := TopoSort(deps)
	if err != nil {
		t.Fatalf("TopoSort: %v", err)
	}
	pos := map[string]int{}
	for i, k := range got {
		pos[k] = i
	}
	if pos["base"] > pos["full"] {
		t.Errorf("base must be evaluated before full, got %v", got)
	}
}

func TestTopoSortDetectsThreeNodeCycle(t *testing.T) {
	deps := map[string][]string{
		"a": {"b"},
		"b": {"c"},
		"c": {"a"},
	}
	_, err := TopoSort(deps)
	if err == nil {
		t.Fatal("a cycle must be refused")
	}
	if !strings.Contains(err.Error(), "->") {
		t.Errorf("error should show the cycle path, got: %v", err)
	}
	for _, k := range []string{"a", "b", "c"} {
		if !strings.Contains(err.Error(), k) {
			t.Errorf("cycle path should mention %q, got: %v", k, err)
		}
	}
}

func TestTopoSortDetectsSelfReference(t *testing.T) {
	if _, err := TopoSort(map[string][]string{"a": {"a"}}); err == nil {
		t.Fatal("a self-referencing computed field must be refused")
	}
}

func TestTopoSortIsDeterministic(t *testing.T) {
	deps := map[string][]string{"z": {"y"}, "y": nil, "x": nil}
	first, err := TopoSort(deps)
	if err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 20; i++ {
		again, err := TopoSort(deps)
		if err != nil {
			t.Fatal(err)
		}
		if strings.Join(again, ",") != strings.Join(first, ",") {
			t.Fatalf("order is not stable: %v vs %v", first, again)
		}
	}
}
