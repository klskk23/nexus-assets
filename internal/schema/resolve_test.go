package schema

import (
	"strings"
	"testing"

	"github.com/klskk23/nexus-assets/internal/model"
)

func def(key string, t model.FieldType) model.FieldDefinition {
	return model.FieldDefinition{ID: "f-" + key, Key: key, Label: key, Type: t}
}

// A three-level tree: net (root) > router > sdwan.
func fixture() (map[string][]Binding, string) {
	b := map[string][]Binding{
		"net": {
			{CategoryID: "net", Field: def("mac", model.FieldMAC), Required: true, Sort: 10},
			{CategoryID: "net", Field: def("firmware", model.FieldText), Sort: 20},
		},
		"router": {
			{CategoryID: "router", Field: def("wan_ports", model.FieldNumber), Sort: 10},
		},
		"sdwan": {
			{CategoryID: "sdwan", Field: def("tunnel_cap", model.FieldNumber), Sort: 10},
		},
	}
	return b, "/net/router/sdwan/"
}

func TestResolveUnionsAncestorChain(t *testing.T) {
	bindings, path := fixture()
	got, err := Resolve(path, bindings)
	if err != nil {
		t.Fatalf("Resolve: %v", err)
	}
	if len(got) != 4 {
		t.Fatalf("got %d fields, want 4", len(got))
	}
	wantOrder := []string{"mac", "firmware", "wan_ports", "tunnel_cap"}
	for i, w := range wantOrder {
		if got[i].Key != w {
			t.Errorf("field %d = %q, want %q (root-first order)", i, got[i].Key, w)
		}
	}
}

func TestResolveAttributesInheritance(t *testing.T) {
	bindings, path := fixture()
	got, _ := Resolve(path, bindings)
	byKey := map[string]model.BoundField{}
	for _, f := range got {
		byKey[f.Key] = f
	}
	if byKey["mac"].InheritedFrom != "net" {
		t.Errorf("mac InheritedFrom = %q, want net", byKey["mac"].InheritedFrom)
	}
	if byKey["wan_ports"].InheritedFrom != "router" {
		t.Errorf("wan_ports InheritedFrom = %q, want router", byKey["wan_ports"].InheritedFrom)
	}
	if byKey["tunnel_cap"].InheritedFrom != "" {
		t.Errorf("own binding should have empty InheritedFrom, got %q", byKey["tunnel_cap"].InheritedFrom)
	}
}

func TestResolveRejectsDuplicateKeyOnChain(t *testing.T) {
	bindings, path := fixture()
	bindings["sdwan"] = append(bindings["sdwan"], Binding{
		CategoryID: "sdwan", Field: def("mac", model.FieldText), Sort: 99,
	})
	_, err := Resolve(path, bindings)
	if err == nil {
		t.Fatal("a key bound twice on the chain must be reported")
	}
	if !strings.Contains(err.Error(), "mac") {
		t.Errorf("error should name the offending key, got: %v", err)
	}
}

func TestResolveSNTemplateWalksUp(t *testing.T) {
	templates := map[string]string{"net": "{{ .id }}", "router": "{{ .attrs.mac | hex2dec }}"}
	tmpl, from := ResolveSNTemplate("/net/router/sdwan/", templates)
	if from != "router" {
		t.Errorf("template should come from the nearest ancestor that sets one, got %q", from)
	}
	if tmpl != "{{ .attrs.mac | hex2dec }}" {
		t.Errorf("tmpl = %q", tmpl)
	}

	tmpl, from = ResolveSNTemplate("/net/router/sdwan/", map[string]string{})
	if tmpl != "" || from != "" {
		t.Errorf("no template anywhere on the chain should yield empty, got %q from %q", tmpl, from)
	}
}

func TestPathHelpers(t *testing.T) {
	if got := BuildPath("", "net"); got != "/net/" {
		t.Errorf("BuildPath root = %q", got)
	}
	if got := BuildPath("/net/", "router"); got != "/net/router/" {
		t.Errorf("BuildPath child = %q", got)
	}
	if !IsDescendantOf("/net/router/sdwan/", "/net/") {
		t.Error("subtree prefix matching broken")
	}
	if IsDescendantOf("/other/", "/net/") {
		t.Error("unrelated path must not match")
	}
}

func TestActiveFieldsDropsArchived(t *testing.T) {
	now := timeNow()
	fields := []model.BoundField{
		{FieldDefinition: def("a", model.FieldText)},
		{FieldDefinition: model.FieldDefinition{Key: "b", ArchivedAt: &now}},
	}
	got := ActiveFields(fields)
	if len(got) != 1 || got[0].Key != "a" {
		t.Errorf("ActiveFields = %+v, want only a", got)
	}
}
