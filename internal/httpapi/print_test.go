package httpapi

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
)

// fakePrintService stands in for the label service. It records what arrived,
// because what this side has to get right is the shape of the request: one
// batch per category, the columns keyed by field key, and an idempotency key
// that differs per batch but repeats on a retry.
type fakePrintService struct {
	server   *httptest.Server
	requests []printRequest
	// status is what /api/print-jobs/:id answers with.
	status map[string]any
	// refuse, when set, is returned instead of a job.
	refuse *fakeRefusal
}

type printRequest struct {
	PresetID       string
	IdempotencyKey string
	Columns        []string
	Rows           []map[string]string
	Copies         int
}

type fakeRefusal struct {
	Status int
	Code   string
	What   string
}

func newFakePrintService(t *testing.T) *fakePrintService {
	t.Helper()
	f := &fakePrintService{status: map[string]any{}}
	mux := http.NewServeMux()
	mux.HandleFunc("/api/print-presets/", func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		var in struct {
			Columns []string            `json:"columns"`
			Rows    []map[string]string `json:"rows"`
			Copies  int                 `json:"copies"`
		}
		_ = json.Unmarshal(body, &in)
		// /api/print-presets/<id>/print
		preset := r.URL.Path[len("/api/print-presets/") : len(r.URL.Path)-len("/print")]
		f.requests = append(f.requests, printRequest{
			PresetID:       preset,
			IdempotencyKey: r.Header.Get("Idempotency-Key"),
			Columns:        in.Columns, Rows: in.Rows, Copies: in.Copies,
		})

		if f.refuse != nil {
			w.WriteHeader(f.refuse.Status)
			_ = json.NewEncoder(w).Encode(map[string]any{
				"code": f.refuse.Code, "what": f.refuse.What,
				"why": "because", "how": "do this",
			})
			return
		}
		w.WriteHeader(http.StatusAccepted)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"jobId": "job-" + preset, "status": "queued",
			"requestedCopies": len(in.Rows),
			"seqClaims": []map[string]any{
				{"poolId": "p1", "variableName": "seq", "start": 1001, "end": 1008},
			},
		})
	})
	mux.HandleFunc("/api/print-presets", func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"presets": []map[string]string{
				{"id": "preset-rt", "name": "路由器标签"},
				{"id": "preset-sw", "name": "交换机标签"},
			},
		})
	})
	mux.HandleFunc("/api/print-jobs/", func(w http.ResponseWriter, r *http.Request) {
		id := r.URL.Path[len("/api/print-jobs/"):]
		if body, ok := f.status[id]; ok {
			_ = json.NewEncoder(w).Encode(body)
			return
		}
		w.WriteHeader(http.StatusNotFound)
		_ = json.NewEncoder(w).Encode(map[string]any{"code": "NOT_FOUND", "what": "没有这个作业"})
	})

	f.server = httptest.NewServer(mux)
	t.Cleanup(f.server.Close)
	return f
}

type printResponse struct {
	Batches []struct {
		CategoryID   string `json:"category_id"`
		CategoryName string `json:"category_name"`
		Count        int    `json:"count"`
		PresetName   string `json:"preset_name"`
		JobID        string `json:"job_id"`
		Status       string `json:"status"`
		Error        string `json:"error"`
		Claims       []struct {
			Start int `json:"start"`
			End   int `json:"end"`
		} `json:"claims"`
	} `json:"batches"`
}

// The daily action: tick some rows, press print. What leaves this side is one
// batch per category, keyed by field key.
func TestPrintSendsOneBatchPerCategory(t *testing.T) {
	fake := newFakePrintService(t)
	h := newHarnessWithPrinting(t, fake.server.URL)
	h.seed(t, 0, 2)

	if rec := h.patch(t, "/api/categories/"+h.catID, `{"print_preset_id":"preset-rt"}`); rec.Code != http.StatusOK {
		t.Fatal(rec.Body.String())
	}
	ids := h.assetIDs(t)

	rec := h.post(t, "/api/print", `{"ids":["`+ids[0]+`","`+ids[1]+`"]}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("print = %d %s", rec.Code, rec.Body.String())
	}
	out := decode[printResponse](t, rec)
	if len(out.Batches) != 1 {
		t.Fatalf("batches = %d, want 1", len(out.Batches))
	}
	b := out.Batches[0]
	if b.Count != 2 || b.JobID != "job-preset-rt" || b.Status != "queued" {
		t.Errorf("batch = %+v", b)
	}
	// Numbers minted on the other side are invisible here unless they are
	// reported, so they travel back with the batch.
	if len(b.Claims) != 1 || b.Claims[0].Start != 1001 || b.Claims[0].End != 1008 {
		t.Errorf("sequence claims did not come through: %+v", b.Claims)
	}

	if len(fake.requests) != 1 {
		t.Fatalf("the service saw %d requests, want 1", len(fake.requests))
	}
	req := fake.requests[0]
	if req.PresetID != "preset-rt" {
		t.Errorf("preset = %q", req.PresetID)
	}
	if len(req.Rows) != 2 {
		t.Fatalf("rows = %d, want 2", len(req.Rows))
	}
	if req.Rows[0]["mac"] == "" || req.Rows[0]["sys_sn"] == "" {
		t.Errorf("the row lost its values: %v", req.Rows[0])
	}
	if req.IdempotencyKey == "" {
		t.Error("a batch must carry an idempotency key, or a double click prints twice")
	}
}

// A template belongs to a category and a field key only means something inside
// one, so a selection spanning two categories is two jobs -- and the response
// says so rather than quietly printing something else.
func TestPrintSplitsASelectionByCategory(t *testing.T) {
	fake := newFakePrintService(t)
	h := newHarnessWithPrinting(t, fake.server.URL)
	h.seed(t, 0, 1)

	other := decode[map[string]any](t, h.post(t, "/api/categories", `{"code":"SW","name":"交换机"}`))
	otherID := other["id"].(string)
	rec := h.post(t, "/api/fields", `{"key":"rack","label":"机柜位","type":"text"}`)
	rackID := decode[map[string]any](t, rec)["id"].(string)
	if b := h.post(t, "/api/categories/"+otherID+"/bindings",
		`{"field_id":"`+rackID+`","required":false,"sort":10}`); b.Code != http.StatusNoContent {
		t.Fatal(b.Body.String())
	}
	if a := h.post(t, "/api/assets", `{"category_id":"`+otherID+`","status":"in_stock","owner_id":"`+
		h.userID+`","holder_type":"entity","holder_id":"`+h.locID+
		`","attrs":{"rack":"A-01"}}`); a.Code != http.StatusCreated {
		t.Fatal(a.Body.String())
	}
	for _, spec := range []struct{ id, preset string }{{h.catID, "preset-rt"}, {otherID, "preset-sw"}} {
		if r := h.patch(t, "/api/categories/"+spec.id,
			`{"print_preset_id":"`+spec.preset+`"}`); r.Code != http.StatusOK {
			t.Fatal(r.Body.String())
		}
	}

	ids := h.assetIDs(t)
	out := decode[printResponse](t, h.post(t, "/api/print", `{"ids":["`+ids[0]+`","`+ids[1]+`"]}`))
	if len(out.Batches) != 2 {
		t.Fatalf("batches = %d, want 2: %+v", len(out.Batches), out.Batches)
	}
	if len(fake.requests) != 2 {
		t.Fatalf("the service saw %d requests, want 2", len(fake.requests))
	}
	// Two batches of one submission must not share an idempotency key, or the
	// service would answer the second with the first one's job.
	if fake.requests[0].IdempotencyKey == fake.requests[1].IdempotencyKey {
		t.Error("the two batches shared an idempotency key")
	}
	// Each batch carries its own category's vocabulary and nothing else.
	for _, req := range fake.requests {
		_, hasMac := req.Rows[0]["mac"]
		_, hasRack := req.Rows[0]["rack"]
		if hasMac == hasRack {
			t.Errorf("a batch mixed two categories' columns: %v", req.Columns)
		}
	}
}

// Nobody has said what this category's label looks like. That is not a printer
// failure and must not read as one.
func TestPrintSaysWhichCategoryHasNoPreset(t *testing.T) {
	fake := newFakePrintService(t)
	h := newHarnessWithPrinting(t, fake.server.URL)
	h.seed(t, 0, 1)

	out := decode[printResponse](t, h.post(t, "/api/print", `{"ids":["`+h.assetIDs(t)[0]+`"]}`))
	if len(out.Batches) != 1 || out.Batches[0].JobID != "" {
		t.Fatalf("batches = %+v", out.Batches)
	}
	if out.Batches[0].Error == "" || !contains(out.Batches[0].Error, "SDWAN 路由器") {
		t.Errorf("the refusal should name the category, got %q", out.Batches[0].Error)
	}
	if len(fake.requests) != 0 {
		t.Error("nothing should have been sent")
	}
}

// The service's refusals are already written for a person, in the language the
// request asked for. Passing that sentence through beats inventing a vaguer one.
func TestPrintRelaysTheServicesOwnRefusal(t *testing.T) {
	fake := newFakePrintService(t)
	fake.refuse = &fakeRefusal{Status: http.StatusConflict, Code: "QUEUE_PAUSED",
		What: "打印队列已暂停，需要先恢复"}
	h := newHarnessWithPrinting(t, fake.server.URL)
	h.seed(t, 0, 1)
	if r := h.patch(t, "/api/categories/"+h.catID, `{"print_preset_id":"preset-rt"}`); r.Code != http.StatusOK {
		t.Fatal(r.Body.String())
	}

	out := decode[printResponse](t, h.post(t, "/api/print", `{"ids":["`+h.assetIDs(t)[0]+`"]}`))
	if len(out.Batches) != 1 || out.Batches[0].Error != "打印队列已暂停，需要先恢复" {
		t.Errorf("the service's own sentence should reach the reader, got %+v", out.Batches)
	}
}

// The print service sends no CORS headers, so the page cannot poll it directly.
// Carrying the answer across is this side's job.
func TestPrintJobStatusIsRelayed(t *testing.T) {
	fake := newFakePrintService(t)
	fake.status["job-1"] = map[string]any{
		"jobId": "job-1", "status": "completed", "pagesPrinted": 8,
	}
	h := newHarnessWithPrinting(t, fake.server.URL)

	rec := h.get(t, "/api/print/jobs/job-1")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d %s", rec.Code, rec.Body.String())
	}
	got := decode[struct {
		Status string `json:"status"`
		Pages  *int   `json:"pagesPrinted"`
	}](t, rec)
	if got.Status != "completed" || got.Pages == nil || *got.Pages != 8 {
		t.Errorf("relayed = %+v", got)
	}
}

// An installation without a printer should look like one: nothing about
// printing in the interface, and the endpoints say so plainly.
func TestPrintingIsAbsentWhenUnconfigured(t *testing.T) {
	h := newHarness(t)

	caps := decode[map[string]any](t, h.get(t, "/api/capabilities"))
	if caps["printing"] != false {
		t.Errorf("capabilities = %v", caps)
	}
	if rec := h.post(t, "/api/print", `{"ids":["x"]}`); rec.Code != http.StatusNotFound {
		t.Errorf("printing without a service = %d, want 404", rec.Code)
	}
}

// Choosing where a category prints should be a menu, not a copied identifier.
// The list is relayed because the service sends no CORS headers.
func TestPrintPresetsAreRelayed(t *testing.T) {
	fake := newFakePrintService(t)
	h := newHarnessWithPrinting(t, fake.server.URL)

	got := decode[struct {
		Presets []struct {
			ID   string `json:"id"`
			Name string `json:"name"`
		} `json:"presets"`
	}](t, h.get(t, "/api/print/presets"))

	if len(got.Presets) != 2 || got.Presets[0].Name != "路由器标签" {
		t.Errorf("presets = %+v", got.Presets)
	}
}

func TestPrintPresetsAreAbsentWhenUnconfigured(t *testing.T) {
	h := newHarness(t)
	if rec := h.get(t, "/api/print/presets"); rec.Code != http.StatusNotFound {
		t.Errorf("presets without a service = %d, want 404", rec.Code)
	}
}

// Paper comes out of a machine in another room, so the button asks first.
// A dry run works out exactly what a real one would do -- the same grouping,
// the same refusals -- and touches nothing.
func TestPrintDryRunSendsNothing(t *testing.T) {
	fake := newFakePrintService(t)
	h := newHarnessWithPrinting(t, fake.server.URL)
	h.seed(t, 0, 3)
	if r := h.patch(t, "/api/categories/"+h.catID, `{"print_preset_id":"preset-rt"}`); r.Code != http.StatusOK {
		t.Fatal(r.Body.String())
	}

	ids := h.assetIDs(t)
	out := decode[printResponse](t, h.post(t, "/api/print",
		`{"dry_run":true,"ids":["`+ids[0]+`","`+ids[1]+`","`+ids[2]+`"]}`))

	if len(out.Batches) != 1 || out.Batches[0].Count != 3 {
		t.Fatalf("batches = %+v", out.Batches)
	}
	if out.Batches[0].JobID != "" {
		t.Error("a dry run must not produce a job")
	}
	for _, req := range fake.requests {
		if req.PresetID != "" {
			t.Fatalf("a dry run reached the printer: %+v", req)
		}
	}
	// The confirmation says what will come out, in the words the print service
	// uses for it.
	if out.Batches[0].PresetName != "路由器标签" {
		t.Errorf("preset name = %q, want 路由器标签", out.Batches[0].PresetName)
	}
}

// The thing worth learning before pressing print, not after.
func TestPrintDryRunReportsAMissingPreset(t *testing.T) {
	fake := newFakePrintService(t)
	h := newHarnessWithPrinting(t, fake.server.URL)
	h.seed(t, 0, 1)

	out := decode[printResponse](t, h.post(t, "/api/print",
		`{"dry_run":true,"ids":["`+h.assetIDs(t)[0]+`"]}`))
	if len(out.Batches) != 1 || out.Batches[0].Error == "" {
		t.Fatalf("batches = %+v", out.Batches)
	}
}
