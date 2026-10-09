package httpapi

import (
	"os"
	"strings"
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
		// 016: vendors and field groups.
		"/vendors":                          "post",
		"/vendors/{id}":                     "patch",
		"/vendors/{id}/bindings":            "post",
		"/vendors/{id}/bindings/{field_id}": "delete",
		"/vendors/{id}/required-impact":     "get",
		"/field-groups":                     "post",
		"/field-groups/{id}":                "patch",
		"/field-groups/{id}/bindings":       "post",
		"/models/{id}/vendor-change-impact": "get",
	} {
		if _, ok := doc.Paths[path][method]; !ok {
			t.Errorf("the contract is missing %s %s", method, path)
		}
	}
}

// Clients need the same confirmation and count contract as the HTTP handlers.
func TestContractDocumentsInheritanceConfirmation(t *testing.T) {
	type schemaNode struct {
		Ref        string                `yaml:"$ref"`
		Type       any                   `yaml:"type"`
		Required   []string              `yaml:"required"`
		Properties map[string]schemaNode `yaml:"properties"`
		Enum       []string              `yaml:"enum"`
		Minimum    *int                  `yaml:"minimum"`
	}
	type content struct {
		Schema   schemaNode `yaml:"schema"`
		Examples map[string]struct {
			Value struct {
				Error struct{ Code, Message string } `yaml:"error"`
			} `yaml:"value"`
		} `yaml:"examples"`
	}
	type response struct {
		Ref     string             `yaml:"$ref"`
		Content map[string]content `yaml:"content"`
	}
	type operation struct {
		RequestBody struct {
			Required bool               `yaml:"required"`
			Content  map[string]content `yaml:"content"`
		} `yaml:"requestBody"`
		Responses map[string]response `yaml:"responses"`
	}
	var doc struct {
		Paths map[string]struct {
			Get    operation `yaml:"get"`
			Post   operation `yaml:"post"`
			Patch  operation `yaml:"patch"`
			Delete operation `yaml:"delete"`
		} `yaml:"paths"`
		Components struct {
			Schemas   map[string]schemaNode `yaml:"schemas"`
			Responses map[string]response   `yaml:"responses"`
		} `yaml:"components"`
	}
	body, err := docsFS.ReadFile("docs/openapi.yaml")
	if err != nil {
		t.Fatal(err)
	}
	if err := yaml.Unmarshal(body, &doc); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"CategoryDraft", "CategoryPreview"} {
		token := doc.Components.Schemas[name].Properties["confirmation_token"]
		if token.Type != "string" || len(token.Enum) != 0 {
			t.Errorf("%s must accept an opaque nonempty confirmation token", name)
		}
	}
	for _, key := range []string{"asset_id", "conflict_asset_id"} {
		if doc.Components.Schemas["CategoryPreviewIssue"].Properties[key].Type != "string" {
			t.Errorf("preview issue is missing %s", key)
		}
	}
	unbind := "/categories/{id}/bindings/{field_id}"
	preview := doc.Paths[unbind+"/unbind-preview"].Post
	if preview.Responses["200"].Content["application/json"].Schema.Ref != "#/components/schemas/CategoryPreview" {
		t.Error("unbind preview must return the shared CategoryPreview")
	}
	deletion := doc.Paths[unbind].Delete
	request := deletion.RequestBody
	if request.Required || request.Content["application/json"].Schema.Properties["confirmation_token"].Type != "string" {
		t.Error("unbind must accept an optional JSON confirmation token")
	}
	for _, endpoint := range []struct{ path, method string }{{"/categories", "post"}, {"/categories/{id}", "patch"}, {unbind, "delete"}} {
		op := doc.Paths[endpoint.path].Post
		if endpoint.method == "patch" {
			op = doc.Paths[endpoint.path].Patch
		}
		if endpoint.method == "delete" {
			op = doc.Paths[endpoint.path].Delete
		}
		conflict := op.Responses["409"]
		if conflict.Ref != "" {
			conflict = doc.Components.Responses[strings.TrimPrefix(conflict.Ref, "#/components/responses/")]
		}
		json := conflict.Content["application/json"]
		if json.Schema.Ref != "#/components/schemas/ErrorEnvelope" {
			t.Errorf("%s conflict must use ErrorEnvelope", endpoint.path)
		}
		for _, code := range []string{"confirmation_required", "impact_stale"} {
			example := json.Examples[code].Value.Error
			if example.Code != code || example.Message == "" {
				t.Errorf("%s is missing %s example", endpoint.path, code)
			}
		}
	}
	count := doc.Paths["/fields/{id}/asset-count"].Get
	if count.Responses["200"].Content["application/json"].Schema.Ref != "#/components/schemas/FieldAssetCount" {
		t.Error("count route must return FieldAssetCount")
	}
	shape := doc.Components.Schemas["FieldAssetCount"]
	value := shape.Properties["count"]
	if shape.Type != "object" || len(shape.Required) != 1 || shape.Required[0] != "count" || value.Type != "integer" || value.Minimum == nil || *value.Minimum != 0 {
		t.Error("field count must be a required nonnegative integer in an object")
	}
	for _, code := range []string{"401", "404"} {
		if _, ok := count.Responses[code]; !ok {
			t.Errorf("count route is missing %s", code)
		}
	}
}

// Clients must be able to distinguish a stale schema from row validation and
// asset-version conflicts at all four write/preview entry points.
func TestContractDocumentsSchemaStale(t *testing.T) {
	type response struct {
		Ref         string `yaml:"$ref"`
		Description string `yaml:"description"`
		Content     map[string]struct {
			Schema struct {
				Ref string `yaml:"$ref"`
			} `yaml:"schema"`
			Examples map[string]struct {
				Value struct {
					Error struct {
						Code    string `yaml:"code"`
						Message string `yaml:"message"`
					} `yaml:"error"`
				} `yaml:"value"`
			} `yaml:"examples"`
		} `yaml:"content"`
	}
	type operation struct {
		Responses map[string]response `yaml:"responses"`
	}
	var doc struct {
		Paths map[string]struct {
			Post  operation `yaml:"post"`
			Patch operation `yaml:"patch"`
		} `yaml:"paths"`
		Components struct {
			Responses map[string]response `yaml:"responses"`
		} `yaml:"components"`
	}
	body, err := docsFS.ReadFile("docs/openapi.yaml")
	if err != nil {
		t.Fatal(err)
	}
	if err := yaml.Unmarshal(body, &doc); err != nil {
		t.Fatal(err)
	}
	for _, endpoint := range []struct{ path, method string }{
		{"/assets", "post"},
		{"/assets/{id}", "patch"},
		{"/import/preview", "post"},
		{"/import/commit", "post"},
	} {
		t.Run(endpoint.method+" "+endpoint.path, func(t *testing.T) {
			op := doc.Paths[endpoint.path].Post
			if endpoint.method == "patch" {
				op = doc.Paths[endpoint.path].Patch
			}
			conflict, ok := op.Responses["409"]
			if !ok {
				t.Fatal("missing 409 response for schema_stale")
			}
			if conflict.Ref != "" {
				conflict, ok = doc.Components.Responses[strings.TrimPrefix(conflict.Ref, "#/components/responses/")]
				if !ok {
					t.Fatal("409 response reference does not resolve")
				}
			}
			if !strings.Contains(conflict.Description, "schema_stale") {
				t.Error("409 response does not describe schema_stale")
			}
			content := conflict.Content["application/json"]
			if content.Schema.Ref != "#/components/schemas/ErrorEnvelope" {
				t.Error("schema_stale must use the shared ErrorEnvelope")
			}
			example := content.Examples["schema_stale"].Value.Error
			if example.Code != "schema_stale" || example.Message == "" {
				t.Errorf("schema_stale example must contain error.code and error.message: %+v", example)
			}
		})
	}
}
