package httpapi

import (
	"fmt"
	"net/http"
	"os"
	"sort"
	"testing"
	"time"
)

// The targets the constitution sets (principle IV), measured at the scale it
// names: ten thousand assets.
const (
	seedSize        = 10000
	listBudget      = 200 * time.Millisecond
	singleOpBudget  = 100 * time.Millisecond
	perfSampleCount = 30
)

// p95 returns the 95th percentile of a set of durations.
func p95(samples []time.Duration) time.Duration {
	sort.Slice(samples, func(i, j int) bool { return samples[i] < samples[j] })
	idx := int(float64(len(samples))*0.95) - 1
	if idx < 0 {
		idx = 0
	}
	return samples[idx]
}

func measure(n int, fn func()) []time.Duration {
	out := make([]time.Duration, 0, n)
	for i := 0; i < n; i++ {
		start := time.Now()
		fn()
		out = append(out, time.Since(start))
	}
	return out
}

// TestPerformanceAtTenThousandAssets is skipped in the ordinary run: seeding
// ten thousand rows takes long enough to be a nuisance on every save. It is the
// measurement behind the numbers in the constitution, so it has to exist and be
// runnable rather than be a claim nobody checks.
//
//	go test ./internal/httpapi/ -run TestPerformance -perf
func TestPerformanceAtTenThousandAssets(t *testing.T) {
	if os.Getenv("NEXUS_PERF") == "" {
		t.Skip("set NEXUS_PERF=1 to run the ten-thousand-asset measurement")
	}

	h := newHarness(t)
	start := time.Now()
	h.seed(t, 0, seedSize)
	t.Logf("seeded %d assets in %s", seedSize, time.Since(start).Round(time.Millisecond))

	items := decode[assetListResponse](t, h.get(t, "/api/assets?limit=1")).Items
	if len(items) == 0 {
		t.Fatal("seeding produced nothing")
	}
	one := items[0]

	cases := []struct {
		name   string
		path   string
		budget time.Duration
	}{
		{"list first page", "/api/assets?limit=50", listBudget},
		{"list deep page", "/api/assets?limit=50&offset=9000", listBudget},
		{"list filtered by status", "/api/assets?limit=50&status=in_stock", listBudget},
		{"list filtered by custom field", "/api/assets?limit=50&attr.firmware=2.1.3", listBudget},
		{"exact serial-number search", "/api/assets?q=" + one.SN, listBudget},
		{"single asset read", "/api/assets/" + one.ID, singleOpBudget},
		{"overview", "/api/overview", listBudget},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			samples := measure(perfSampleCount, func() {
				if rec := h.get(t, tc.path); rec.Code != http.StatusOK {
					t.Fatalf("%s returned %d", tc.path, rec.Code)
				}
			})
			got := p95(samples)
			t.Logf("p95 %s (budget %s)", got.Round(time.Millisecond), tc.budget)
			if got > tc.budget {
				t.Errorf("p95 %s exceeds the %s budget", got, tc.budget)
			}
		})
	}

	t.Run("single asset write", func(t *testing.T) {
		i := 0
		samples := measure(perfSampleCount, func() {
			i++
			body := fmt.Sprintf(`{"category_id":"%s","owner_id":"%s","holder_type":"entity",
				"holder_id":"%s","attrs":{"mac":"03%010X"}}`, h.catID, h.userID, h.locID, i)
			if rec := h.post(t, "/api/assets", body); rec.Code != http.StatusCreated {
				t.Fatalf("create returned %d: %s", rec.Code, rec.Body.String())
			}
		})
		got := p95(samples)
		t.Logf("p95 %s (budget %s)", got.Round(time.Millisecond), singleOpBudget)
		if got > singleOpBudget {
			t.Errorf("p95 %s exceeds the %s budget", got, singleOpBudget)
		}
	})
}
