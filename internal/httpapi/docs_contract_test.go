package httpapi

import (
	"os"
	"testing"

	"github.com/goccy/go-yaml"
)

// The contract is embedded from a copy, because go:embed cannot reach outside
// its own package. A copy drifts unless something watches it, so this is what
// watches it -- and it parses the file while it is here, since a documentation
// page that renders nothing is worse than none.
func TestEmbeddedContractMatchesTheSpec(t *testing.T) {
	embedded, err := docsFS.ReadFile("docs/openapi.yaml")
	if err != nil {
		t.Fatal(err)
	}
	canonical, err := os.ReadFile("../../specs/001-asset-ledger-demo/contracts/openapi.yaml")
	if err != nil {
		t.Fatal(err)
	}
	if string(embedded) != string(canonical) {
		t.Error("internal/httpapi/docs/openapi.yaml has drifted from the one in specs/; " +
			"copy it across so the docs page shows what the contract actually says")
	}

	var doc struct {
		Paths map[string]map[string]any `yaml:"paths"`
	}
	if err := yaml.Unmarshal(embedded, &doc); err != nil {
		t.Fatalf("the contract does not parse, so Swagger UI would show nothing: %v", err)
	}
	// The endpoints this round added, since a contract that forgets them is
	// the same as no contract for anyone generating a client.
	for path, method := range map[string]string{
		"/auth/refresh":  "post",
		"/auth/logout":   "post",
		"/api-keys":      "post",
		"/api-keys/{id}": "delete",
		"/me":            "patch",
		// Read by a container runtime and a reverse proxy, which is exactly the
		// sort of endpoint that gets added to the code and nowhere else.
		"/health": "get",
	} {
		if _, ok := doc.Paths[path][method]; !ok {
			t.Errorf("the contract is missing %s %s", method, path)
		}
	}
}
