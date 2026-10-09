package httpapi

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/klskk23/nexus-assets/internal/asset"
	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/schema"
	"github.com/klskk23/nexus-assets/internal/store"
)

// All instrumentation lives in this test adapter. Plan starts after BEGIN
// IMMEDIATE; Apply returns before COMMIT. Their enclosing span is a lower bound
// on lock holding, never an exact transaction duration.
type measuredSchemaEffects struct {
	inner                                schema.AssetEffects
	started                              time.Time
	lockLower, planElapsed, applyElapsed time.Duration
	effectReads, effectSchemaReads       int
}

func (m *measuredSchemaEffects) Plan(ctx context.Context, q store.Querier, change schema.SchemaChange) (*schema.AssetEffectPlan, error) {
	m.started = time.Now()
	observed := &scaleQueryProbe{Querier: q}
	plan, err := m.inner.Plan(ctx, observed, change)
	m.effectReads, m.effectSchemaReads = observed.reads, observed.schemaReads
	m.planElapsed = time.Since(m.started)
	if err != nil || plan == nil || plan.Apply == nil {
		return plan, err
	}
	apply := plan.Apply
	plan.Apply = func(ctx context.Context, tx *sql.Tx) error {
		start := time.Now()
		err := apply(ctx, tx)
		m.applyElapsed = time.Since(start)
		m.lockLower = time.Since(m.started)
		return err
	}
	return plan, nil
}

// This wrapper counts only the supplied read surface, not writes or transaction
// boundaries. The driver counter separately observes whole HTTP operations.
type scaleQueryProbe struct {
	store.Querier
	reads, schemaReads int
}

func (p *scaleQueryProbe) record(query string) {
	p.reads++
	query = strings.ToLower(query)
	for _, table := range []string{"categories", "field_definitions", "category_fields", "category_field_selections", "product_models", "vendors", "model_fields", "vendor_fields"} {
		if strings.Contains(query, table) {
			p.schemaReads++
			return
		}
	}
}

func (p *scaleQueryProbe) QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error) {
	p.record(query)
	return p.Querier.QueryContext(ctx, query, args...)
}

func (p *scaleQueryProbe) QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row {
	p.record(query)
	return p.Querier.QueryRowContext(ctx, query, args...)
}

func (f *inheritanceScale) snapshotReads(t *testing.T) int {
	t.Helper()
	var observed scaleQueryProbe
	err := f.h.db.ReadTx(f.h.ctx, func(ctx context.Context, q store.Querier) error {
		observed.Querier = q
		snapshot, err := schema.LoadSchemaSnapshot(ctx, &observed)
		if err != nil {
			return err
		}
		loaded := observed.reads
		for _, category := range f.categories {
			for _, mid := range f.models {
				if _, err := snapshot.AssetSchema(category, &mid); err != nil {
					return err
				}
			}
		}
		if observed.reads != loaded {
			return fmt.Errorf("resolution queried after snapshot load: %d -> %d", loaded, observed.reads)
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if observed.schemaReads == 0 || observed.schemaReads != observed.reads {
		t.Fatalf("unexpected snapshot count: %+v", observed)
	}
	t.Logf("snapshot schema_reads=%d; resolving 12 category/model combinations adds zero SQL", observed.schemaReads)
	return observed.schemaReads
}

type inheritanceScale struct {
	h             *harness
	categories    []string
	models        []string
	all, retained []string
	probe         *measuredSchemaEffects
	schema        *schema.Store
}

func newInheritanceScale(t *testing.T) *inheritanceScale {
	t.Helper()
	h := newHarness(t)
	f := &inheritanceScale{h: h, retained: []string{inheritanceMAC(t, h), h.snFieldID}}
	f.all = append(f.all, f.retained...)
	for _, input := range []schema.CreateFieldInput{
		{Key: "scale_tag", Label: "Scale tag", Type: model.FieldText, IsUnique: true, Required: true},
		{Key: "firmware", Label: "Firmware", Type: model.FieldText, Searchable: true},
		{Key: "scale_computed", Label: "Computed tag", Type: model.FieldComputed, IsUnique: true, Options: model.FieldOptions{Template: `attrs.scale_tag + "-computed"`}},
	} {
		field, err := h.schema.CreateField(h.ctx, input)
		if err != nil {
			t.Fatal(err)
		}
		if err := h.schema.Bind(h.ctx, h.catID, field.ID, 30+len(f.all)); err != nil {
			t.Fatal(err)
		}
		f.all = append(f.all, field.ID)
	}
	for i := 0; i < 3; i++ {
		parent := h.catID
		if i > 0 {
			parent = f.categories[0]
		}
		cat, err := h.schema.CreateCategory(h.ctx, schema.CreateCategoryInput{
			Code: fmt.Sprintf("SCALE%d", i), Name: fmt.Sprintf("Scale %d", i), ParentID: &parent, InheritedFieldIDs: &f.all,
		})
		if err != nil {
			t.Fatal(err)
		}
		f.categories = append(f.categories, cat.ID)
	}
	device, err := h.schema.CreateField(h.ctx, schema.CreateFieldInput{Key: "device_note", Label: "Device note", Type: model.FieldText, Searchable: true})
	if err != nil {
		t.Fatal(err)
	}
	for v := 0; v < 2; v++ {
		vendor, err := h.schema.CreateVendor(h.ctx, fmt.Sprintf("Scale vendor %d", v))
		if err != nil {
			t.Fatal(err)
		}
		if err := h.schema.BindVendor(h.ctx, vendor.ID, device.ID, 0); err != nil {
			t.Fatal(err)
		}
		for i := 0; i < 2; i++ {
			pm, err := h.schema.CreateModel(h.ctx, schema.CreateModelInput{Name: fmt.Sprintf("Scale model %d", i), VendorID: vendor.ID, AttrDefaults: map[string]any{"device_note": "retained device value"}})
			if err != nil {
				t.Fatal(err)
			}
			f.models = append(f.models, pm.ID)
		}
	}
	f.probe = &measuredSchemaEffects{inner: asset.NewSchemaEffects()}
	f.schema = schema.NewWithEffects(h.db, f.probe)
	return f
}

// Seed through the real preparation/persistence pipeline in one transaction,
// sharing its schema as an importer does. No raw asset/index fixture inserts.
func (f *inheritanceScale) seed(t *testing.T, from, count int) {
	t.Helper()
	h := f.h
	err := h.db.Write(h.ctx, func(ctx context.Context, tx *sql.Tx) error {
		snapshot, err := schema.LoadSchemaSnapshot(ctx, tx)
		if err != nil {
			return err
		}
		persistence, err := h.assets.BeginPersistence(ctx, tx)
		if err != nil {
			return err
		}
		for i := from; i < from+count; i++ {
			mid := f.models[i%len(f.models)]
			prep, err := h.assets.PrepareWithSnapshot(ctx, snapshot, asset.SaveInput{
				CategoryID: f.categories[i%len(f.categories)], ModelID: &mid, Status: model.StatusInStock,
				OwnerID: h.userID, Holder: model.Holder{Type: model.HolderTypeEntity, ID: h.locID}, ActorID: h.userID,
				Attrs: map[string]any{"mac": fmt.Sprintf("021A2B%06X", i), "scale_tag": fmt.Sprintf("tag-%06d", i), "firmware": "2.1.3"},
			})
			if err != nil {
				return fmt.Errorf("prepare scale asset %d: %w", i, err)
			}
			if _, err := persistence.Persist(ctx, prep); err != nil {
				return fmt.Errorf("persist scale asset %d: %w", i, err)
			}
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}

func (f *inheritanceScale) preview(t *testing.T, assets int) int {
	t.Helper()
	body, err := json.Marshal(map[string]any{"inherited_field_ids": f.retained})
	if err != nil {
		t.Fatal(err)
	}
	path := "/api/categories/" + f.categories[0] + "/preview?impact_limit=1&candidate_limit=1"
	count := store.ResetQueryCount()
	start := time.Now()
	rec := f.h.post(t, path, string(body))
	elapsed, queries := time.Since(start), count()
	requireInheritanceStatus(t, rec, http.StatusOK)
	p := decode[inheritanceHTTPPreview](t, rec)
	if p.Impact.Assets != assets || p.Impact.Total != 9 || len(p.Impact.Items) != 1 || p.Issues.Total != 0 || p.Token == "" {
		t.Fatalf("scale preview mismatch: %s", rec.Body.String())
	}
	t.Logf("HTTP preview assets=%d elapsed=%s statements=%d impact_total=%d returned=%d", assets, elapsed, queries, p.Impact.Total, len(p.Impact.Items))
	return queries
}

func TestInheritanceQueryCountIsBounded(t *testing.T) {
	f := newInheritanceScale(t)
	f.seed(t, 0, 3)
	small := f.preview(t, 3)
	smallSchema := f.snapshotReads(t)
	f.seed(t, 3, 27)
	large := f.preview(t, 30)
	if largeSchema := f.snapshotReads(t); smallSchema != largeSchema {
		t.Fatalf("schema reads grew: %d -> %d", smallSchema, largeSchema)
	}
	if small != large {
		t.Fatalf("preview statements grew: %d -> %d", small, large)
	}
	f.change(t, "withdraw small subtree", f.categories[0], f.retained, 30)
	for _, category := range f.categories {
		f.change(t, "restore small category", category, f.all, 10)
	}
}

// Run explicitly; ordinary tests retain only the small query-growth guard.
// NEXUS_PERF=1 GOMAXPROCS=2 go test ./internal/httpapi -run '^TestInheritancePerformanceAtTenThousandAssets$' -count=1 -v -timeout=10m
func TestInheritancePerformanceAtTenThousandAssets(t *testing.T) {
	if os.Getenv("NEXUS_PERF") == "" {
		t.Skip("set NEXUS_PERF=1 for the scale measurement")
	}
	f := newInheritanceScale(t)
	start := time.Now()
	f.seed(t, 0, 1000)
	small := f.preview(t, 1000)
	smallSchema := f.snapshotReads(t)
	f.seed(t, 1000, 9000)
	t.Logf("seeded 10000 assets, 4 categories, 3 levels, 4 models, 2 vendors in %s; Go=%s GOMAXPROCS=%d", time.Since(start), runtime.Version(), runtime.GOMAXPROCS(0))
	large := f.preview(t, seedSize)
	if largeSchema := f.snapshotReads(t); smallSchema != largeSchema {
		t.Errorf("schema reads grew: %d -> %d", smallSchema, largeSchema)
	}
	if small != large {
		t.Errorf("preview statements grew: %d -> %d", small, large)
	}
	f.measureReads(t)
	f.measureWrites(t)
	f.change(t, "withdraw subtree", f.categories[0], f.retained, seedSize)
	f.assertState(t, false)
	for i, category := range f.categories {
		expected := seedSize / 3
		if i == 0 {
			expected++
		}
		f.change(t, fmt.Sprintf("restore category %d", i), category, f.all, expected)
	}
	f.assertState(t, true)
}

func (f *inheritanceScale) measureReads(t *testing.T) {
	t.Helper()
	one := decode[assetListResponse](t, f.h.get(t, "/api/assets?limit=1")).Items[0]
	for _, tc := range []struct {
		name, path string
		budget     time.Duration
	}{
		{"list 50", "/api/assets?limit=50", listBudget},
		{"list 200", "/api/assets?limit=200", listBudget},
		{"deep page", "/api/assets?limit=50&offset=9000", listBudget},
		{"inherited attribute", "/api/assets?limit=50&attr.firmware=2.1.3", listBudget},
		{"model filter", "/api/assets?limit=50&model_id=" + f.models[0], listBudget},
		{"search", "/api/assets?limit=50&q=tag-000123", listBudget},
		{"single read", "/api/assets/" + one.ID, singleOpBudget},
	} {
		t.Run(tc.name, func(t *testing.T) {
			count := store.ResetQueryCount()
			samples := measure(perfSampleCount, func() { requireInheritanceStatus(t, f.h.get(t, tc.path), http.StatusOK) })
			got := p95(samples)
			t.Logf("HTTP p95=%s samples=%d statements/request=%d budget=%s", got, len(samples), count()/len(samples), tc.budget)
			if got >= tc.budget {
				t.Errorf("p95=%s exceeds budget=%s", got, tc.budget)
			}
		})
	}
	var previous int
	for _, limit := range []int{1, 50, 200} {
		count := store.ResetQueryCount()
		requireInheritanceStatus(t, f.h.get(t, fmt.Sprintf("/api/assets?limit=%d", limit)), http.StatusOK)
		got := count()
		t.Logf("list limit=%d statements=%d", limit, got)
		if previous != 0 && previous != got {
			t.Errorf("list statements grew: %d -> %d", previous, got)
		}
		previous = got
	}
}

func (f *inheritanceScale) measureWrites(t *testing.T) {
	t.Helper()
	one := decode[assetListResponse](t, f.h.get(t, "/api/assets?limit=1")).Items[0]
	version := one.Version
	samples := measure(perfSampleCount, func() {
		body, err := json.Marshal(map[string]any{
			"version": version, "note": fmt.Sprintf("scale write %d", version),
			"category_id": one.CategoryID, "model_id": one.ModelID, "owner_id": f.h.userID,
			"holder_type": "entity", "holder_id": f.h.locID, "attrs": one.Attrs,
		})
		if err != nil {
			t.Fatal(err)
		}
		requireInheritanceStatus(t, f.h.patch(t, "/api/assets/"+one.ID, string(body)), http.StatusOK)
		version++
	})
	got := p95(samples)
	t.Logf("single HTTP update p95=%s samples=%d budget=%s", got, len(samples), singleOpBudget)
	if got >= singleOpBudget {
		t.Errorf("single update p95=%s exceeds %s", got, singleOpBudget)
	}
}

func (f *inheritanceScale) change(t *testing.T, name, category string, selected []string, assets int) {
	t.Helper()
	var before, after runtime.MemStats
	runtime.GC()
	runtime.ReadMemStats(&before)
	start := time.Now()
	preview, err := f.schema.PreviewCategory(f.h.ctx, category, schema.CategoryDraft{InheritedFieldIDs: &selected})
	previewElapsed := time.Since(start)
	if err != nil {
		t.Fatal(err)
	}
	if len(preview.Issues) != 0 || preview.AssetCount != assets {
		t.Fatalf("%s preview: assets=%d issues=%+v", name, preview.AssetCount, preview.Issues)
	}
	*f.probe = measuredSchemaEffects{inner: asset.NewSchemaEffects()}
	count := store.ResetQueryCount()
	start = time.Now()
	_, err = f.schema.UpdateCategory(f.h.ctx, category, schema.UpdateCategoryInput{InheritedFieldIDs: &selected, ConfirmationToken: preview.ConfirmationToken})
	saveElapsed, statements := time.Since(start), count()
	runtime.ReadMemStats(&after)
	if err != nil {
		t.Fatal(err)
	}
	if f.probe.effectSchemaReads != 0 || f.probe.effectReads > 2 {
		t.Errorf("effects performed per-asset queries: schema=%d total_reads=%d", f.probe.effectSchemaReads, f.probe.effectReads)
	}
	t.Logf("%s effects reads=%d schema_reads=%d", name, f.probe.effectReads, f.probe.effectSchemaReads)
	if f.probe.lockLower <= 0 || f.probe.lockLower > saveElapsed {
		t.Fatalf("invalid lock bounds: %s .. %s", f.probe.lockLower, saveElapsed)
	}
	t.Logf("%s assets=%d domain_preview=%s domain_save=%s lock_lower=%s lock_upper=%s effect_plan=%s effect_apply=%s statements=%d allocated_preview_plus_save=%.2fMiB heap_after=%.2fMiB", name, assets, previewElapsed, saveElapsed, f.probe.lockLower, saveElapsed, f.probe.planElapsed, f.probe.applyElapsed, statements, float64(after.TotalAlloc-before.TotalAlloc)/(1<<20), float64(after.HeapAlloc)/(1<<20))
}

func (f *inheritanceScale) assertState(t *testing.T, restored bool) {
	t.Helper()
	for _, tc := range []struct {
		query string
		want  int
	}{
		{`SELECT count(*) FROM assets`, seedSize},
		{`SELECT count(*) FROM assets WHERE json_extract(attrs,'$.scale_tag') IS NOT NULL`, seedSize},
		{`SELECT count(*) FROM asset_search_values WHERE field_key='device_note'`, seedSize},
		{`SELECT count(*) FROM asset_search_values WHERE field_key='firmware'`, boolCount(restored)},
		{`SELECT count(*) FROM asset_unique_values WHERE field_key IN ('scale_tag','scale_computed') AND archived_at IS NULL AND search_suppressed=0`, 2 * boolCount(restored)},
	} {
		var got int
		if err := f.h.db.ReadDB().QueryRowContext(f.h.ctx, tc.query).Scan(&got); err != nil {
			t.Fatal(err)
		}
		if got != tc.want {
			t.Errorf("restored=%v: %s got=%d want=%d", restored, tc.query, got, tc.want)
		}
	}
}

func boolCount(value bool) int {
	if value {
		return seedSize
	}
	return 0
}
