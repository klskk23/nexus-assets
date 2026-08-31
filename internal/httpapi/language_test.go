package httpapi

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"
)

// Every user-facing string the server produces goes through the catalogue, so
// asking for English has to change all of them -- a refusal that is half
// translated is worse than one that is not translated at all, because it looks
// like the feature works.
func TestRefusalsAnswerInTheRequestedLanguage(t *testing.T) {
	h := newHarness(t)

	for _, tc := range []struct {
		name, lang, method, path, body string
		want                           string
	}{
		{
			name: "holder hierarchy, English", lang: "en-GB",
			method: http.MethodPost, path: "/api/holders",
			body: `{"type":"department","name":"Ops"}`,
			want: "A department must belong to a company",
		},
		{
			name: "holder hierarchy, Chinese", lang: "zh-CN",
			method: http.MethodPost, path: "/api/holders",
			body: `{"type":"department","name":"运维部"}`,
			want: "部门必须属于一个公司",
		},
		{
			name: "status colour, English", lang: "en",
			method: http.MethodPost, path: "/api/statuses",
			body: `{"key":"on_loan","label":"On loan","color":"#ff00aa"}`,
			want: "is not in the palette",
		},
		{
			name: "built-in status, English", lang: "en",
			method: http.MethodDelete, path: "/api/statuses/retired", body: "",
			want: "is built in",
		},
		{
			name: "not found, English", lang: "en",
			method: http.MethodGet, path: "/api/holders/nope/usage", body: "",
			want: "No such record",
		},
		{
			// An unsupported language falls back rather than answering in keys.
			name: "unsupported language falls back", lang: "fr-FR",
			method: http.MethodPost, path: "/api/holders",
			body: `{"type":"department","name":"运维部"}`,
			want: "部门必须属于一个公司",
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			res := h.doLang(t, tc.lang, tc.method, tc.path, tc.body)
			if !strings.Contains(res.Body.String(), tc.want) {
				t.Errorf("want %q in the response, got %s", tc.want, res.Body)
			}
		})
	}
}

// Field-level messages are what the dynamic form puts next to each input, so
// they have to follow the language too -- and the keys must not.
func TestFieldErrorsAreTranslatedButTheirKeysAreNot(t *testing.T) {
	h := newHarness(t)

	body := `{"category_id":"` + h.catID + `","owner_id":"` + h.userID +
		`","holder_type":"entity","holder_id":"` + h.locID + `","attrs":{"mac":"not-a-mac"}}`
	res := h.doLang(t, "en", http.MethodPost, "/api/assets", body)
	if res.Code != http.StatusUnprocessableEntity {
		t.Fatalf("got %d: %s", res.Code, res.Body)
	}

	var env Envelope
	if err := json.Unmarshal(res.Body.Bytes(), &env); err != nil {
		t.Fatal(err)
	}
	// The key is how the form finds the input; translating it would break the
	// mapping silently.
	msg, ok := env.Error.Fields["mac"]
	if !ok {
		t.Fatalf("the message must hang off the field key, got %+v", env.Error.Fields)
	}
	if !strings.Contains(msg, "Not a valid MAC address") {
		t.Errorf("en = %q", msg)
	}

	res = h.doLang(t, "zh", http.MethodPost, "/api/assets", body)
	if err := json.Unmarshal(res.Body.Bytes(), &env); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(env.Error.Fields["mac"], "MAC 格式非法") {
		t.Errorf("zh = %q", env.Error.Fields["mac"])
	}
}

// The CSV a person downloads is headed in their language; the second row, the
// machine keys, is not -- that is what the importer reads back.
func TestCSVHeadersFollowTheLanguage(t *testing.T) {
	h := newHarness(t)

	en := h.doLang(t, "en", http.MethodGet, "/api/export.csv", "").Body.String()
	if !strings.Contains(en, "Asset number") || !strings.Contains(en, "Holder") {
		t.Errorf("english export header: %q", firstLine(en))
	}
	zh := h.doLang(t, "zh", http.MethodGet, "/api/export.csv", "").Body.String()
	if !strings.Contains(zh, "资产编号") {
		t.Errorf("chinese export header: %q", firstLine(zh))
	}

	tmpl := h.doLang(t, "en", http.MethodGet,
		"/api/categories/"+h.catID+"/import-template.csv", "").Body.String()
	if !strings.Contains(tmpl, "Holder (name)") {
		t.Errorf("english template header: %q", firstLine(tmpl))
	}
	if !strings.Contains(tmpl, "holder") {
		t.Error("the machine key row must stay as it is, whatever the language")
	}
}

func firstLine(s string) string {
	if i := strings.IndexByte(s, '\n'); i >= 0 {
		return s[:i]
	}
	return s
}
