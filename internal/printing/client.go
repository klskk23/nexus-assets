// Package printing hands rows to a label printing service and reports what
// happened to them.
//
// It knows two things about that service: a URL, and that a preset id names
// somewhere to print. Templates, printers, paper profiles and label geometry
// are the service's vocabulary and stay there -- an installation with no
// printer should not carry a model of one.
package printing

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"
)

// ErrNotConfigured is returned when no print service is configured. Callers use
// it to leave printing out of the interface entirely rather than to show a
// button that cannot work.
var ErrNotConfigured = errors.New("no print service is configured")

// Client talks to the print service.
type Client struct {
	baseURL string
	http    *http.Client
}

// New builds a client. An empty URL yields one that refuses every call with
// ErrNotConfigured, so callers need no nil checks.
func New(baseURL string) *Client {
	return &Client{
		baseURL: baseURL,
		// Long enough for a service that renders labels before it answers,
		// short enough that a wedged printer does not hold a request open until
		// the browser gives up on its own.
		http: &http.Client{Timeout: 20 * time.Second},
	}
}

// Configured reports whether printing is available at all.
func (c *Client) Configured() bool { return c != nil && c.baseURL != "" }

// Job is what the service says about a submission.
type Job struct {
	ID     string `json:"jobId"`
	Status string `json:"status"`
	Copies int    `json:"requestedCopies"`
	// Claims records numbers a template drew from the service's own sequence
	// pools. They are minted over there and invisible here, so whoever pressed
	// print has to be told which ones went onto labels.
	Claims []SequenceClaim `json:"seqClaims"`
	// Warnings are things the service printed anyway, such as content that
	// overflows the label.
	Warnings []string `json:"overflowWarnings"`
	// Pages is how many labels have actually come out, when polling.
	Pages          *int   `json:"pagesPrinted"`
	FailureCode    string `json:"failureCode"`
	FailureMessage string `json:"failureMessage"`
}

// SequenceClaim is one range of numbers a job consumed.
type SequenceClaim struct {
	PoolID   string `json:"poolId"`
	Variable string `json:"variableName"`
	Start    int    `json:"start"`
	End      int    `json:"end"`
}

// Rejection is what the service said when it refused.
//
// Its errors already carry a code and a sentence written for a person, in the
// language the request asked for. Passing that sentence through beats inventing
// a second, vaguer one here.
type Rejection struct {
	Status  int
	Code    string
	Message string
}

func (r *Rejection) Error() string {
	if r.Message != "" {
		return r.Message
	}
	return fmt.Sprintf("print service refused with %s (%d)", r.Code, r.Status)
}

// Print submits one batch of rows to a preset.
//
// The idempotency key is the caller's guard against a double click: the service
// answers a repeat with the job it already made rather than printing twice.
func (c *Client) Print(ctx context.Context, presetID string, body any, idempotencyKey, lang string) (Job, error) {
	var job Job
	if !c.Configured() {
		return job, ErrNotConfigured
	}

	payload, err := json.Marshal(body)
	if err != nil {
		return job, err
	}
	url := fmt.Sprintf("%s/api/print-presets/%s/print", c.baseURL, presetID)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(payload))
	if err != nil {
		return job, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Idempotency-Key", idempotencyKey)
	req.Header.Set("Accept-Language", lang)
	return c.do(req)
}

// Preset is one saved combination of template, printer and paper on the print
// service. Nexus stores only its id; the name is what a person picks from.
type Preset struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	// TemplateID is the design this preset prints. Carried through so a page
	// can link to that label rather than to the service's front door: "this
	// one looks wrong" is only actionable if you land on the thing itself.
	TemplateID string `json:"templateId"`
}

// Presets lists what can be printed, so choosing one is a menu rather than a
// copied identifier. Typing a uuid by hand is a step that exists only because
// nobody wrote this call.
func (c *Client) Presets(ctx context.Context, lang string) ([]Preset, error) {
	if !c.Configured() {
		return nil, ErrNotConfigured
	}
	req, err := http.NewRequestWithContext(ctx,
		http.MethodGet, c.baseURL+"/api/print-presets", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept-Language", lang)

	res, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if err != nil {
		return nil, err
	}
	if res.StatusCode >= 400 {
		var e struct {
			Code string `json:"code"`
			What string `json:"what"`
		}
		_ = json.Unmarshal(raw, &e)
		return nil, &Rejection{Status: res.StatusCode, Code: e.Code, Message: e.What}
	}
	// The service answers with an envelope, the way it does everywhere else.
	var body struct {
		Presets []Preset `json:"presets"`
	}
	if err := json.Unmarshal(raw, &body); err != nil {
		return nil, fmt.Errorf("print service answered with something that is not a preset list: %w", err)
	}
	return body.Presets, nil
}

// Status asks what became of a job.
func (c *Client) Status(ctx context.Context, jobID, lang string) (Job, error) {
	var job Job
	if !c.Configured() {
		return job, ErrNotConfigured
	}
	req, err := http.NewRequestWithContext(ctx,
		http.MethodGet, fmt.Sprintf("%s/api/print-jobs/%s", c.baseURL, jobID), nil)
	if err != nil {
		return job, err
	}
	req.Header.Set("Accept-Language", lang)
	return c.do(req)
}

func (c *Client) do(req *http.Request) (Job, error) {
	var job Job

	res, err := c.http.Do(req)
	if err != nil {
		return job, err
	}
	defer res.Body.Close()

	raw, err := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if err != nil {
		return job, err
	}
	if res.StatusCode >= 400 {
		// The service's error shape: {code, what, why, how}. "what" is the
		// sentence written for a reader; the rest belongs in a log.
		var e struct {
			Code string `json:"code"`
			What string `json:"what"`
		}
		_ = json.Unmarshal(raw, &e)
		return job, &Rejection{Status: res.StatusCode, Code: e.Code, Message: e.What}
	}
	if err := json.Unmarshal(raw, &job); err != nil {
		return job, fmt.Errorf("print service answered with something that is not a job: %w", err)
	}
	return job, nil
}
