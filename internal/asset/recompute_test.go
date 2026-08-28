package asset

import (
	"errors"
	"strings"
	"testing"

	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/schema"
)

// setSNTemplate rewrites the rule on the fixture's leaf category.
func (f *fixture) setSNTemplate(t *testing.T, tmpl string) {
	t.Helper()
	if _, err := f.schema.UpdateCategory(f.ctx, f.catID, schema.UpdateCategoryInput{SNTemplate: &tmpl}); err != nil {
		t.Fatalf("set sn_template: %v", err)
	}
}

func (f *fixture) snOf(t *testing.T, id string) string {
	t.Helper()
	a, err := f.svc.Get(f.ctx, id)
	if err != nil {
		t.Fatalf("get asset: %v", err)
	}
	return a.SN
}

// A dry run must be exactly that: a report, with nothing written.
func TestRecomputeDryRunWritesNothing(t *testing.T) {
	f := newFixture(t)
	a, err := f.save(t, SaveInput{Attrs: map[string]any{"mac": "001A2B3C4D5E"}})
	if err != nil {
		t.Fatal(err)
	}
	before := a.SN

	f.setSNTemplate(t, `{{ printf "%s-%s" .category.code (.attrs.mac | hex2dec) }}`)

	report, err := f.svc.RecomputeSN(f.ctx, f.catID, true)
	if err != nil {
		t.Fatalf("dry run: %v", err)
	}
	if report.Applied {
		t.Error("a dry run must not report itself as applied")
	}
	if report.Affected != 1 || report.Total != 1 {
		t.Errorf("affected/total = %d/%d, want 1/1", report.Affected, report.Total)
	}
	if len(report.Samples) != 1 || report.Samples[0].From != before {
		t.Errorf("the report should show a before/after sample, got %+v", report.Samples)
	}
	if report.Samples[0].To != "RT-112394521950" {
		t.Errorf("sample target = %q", report.Samples[0].To)
	}
	if got := f.snOf(t, a.ID); got != before {
		t.Errorf("the dry run changed the stored number: %q -> %q", before, got)
	}
}

func TestRecomputeAppliesAndArchivesOldNumbers(t *testing.T) {
	f := newFixture(t)
	var ids []string
	for _, mac := range []string{"001A2B3C4D01", "001A2B3C4D02", "001A2B3C4D03"} {
		a, err := f.save(t, SaveInput{Attrs: map[string]any{"mac": mac}})
		if err != nil {
			t.Fatal(err)
		}
		ids = append(ids, a.ID)
	}
	oldSNs := make([]string, len(ids))
	for i, id := range ids {
		oldSNs[i] = f.snOf(t, id)
	}

	f.setSNTemplate(t, `{{ printf "%s-%s" .category.code (.attrs.mac | hex2dec) }}`)

	report, err := f.svc.RecomputeSN(f.ctx, f.catID, false)
	if err != nil {
		t.Fatalf("apply: %v", err)
	}
	if !report.Applied || report.Affected != 3 {
		t.Fatalf("report = %+v", report)
	}

	for i, id := range ids {
		newSN := f.snOf(t, id)
		if !strings.HasPrefix(newSN, "RT-") {
			t.Errorf("asset %d keeps the old rule: %q", i, newSN)
		}
		// A printed label must still find the device.
		hist, err := f.svc.SNHistory(f.ctx, id)
		if err != nil {
			t.Fatal(err)
		}
		if len(hist) != 1 || hist[0] != oldSNs[i] {
			t.Errorf("asset %d did not archive its old number: %v", i, hist)
		}
		res, err := f.svc.List(f.ctx, ListFilter{Q: oldSNs[i]})
		if err != nil {
			t.Fatal(err)
		}
		if res.ExactMatchID != id {
			t.Errorf("the retired number %q no longer resolves", oldSNs[i])
		}
	}
}

// Two devices ending up with the same number must abandon the whole run: a
// half-renumbered warehouse is worse than an un-renumbered one.
func TestRecomputeRollsBackEntirelyOnAConflict(t *testing.T) {
	f := newFixture(t)
	var ids []string
	// The last 16 bits differ, everything above is identical.
	for _, mac := range []string{"001A2B3C0001", "001A2B3D0001"} {
		a, err := f.save(t, SaveInput{Attrs: map[string]any{"mac": mac}})
		if err != nil {
			t.Fatal(err)
		}
		ids = append(ids, a.ID)
	}
	before := []string{f.snOf(t, ids[0]), f.snOf(t, ids[1])}

	// Keeping only the trailing four hex digits collapses them onto one number.
	f.setSNTemplate(t, `{{ slice 8 12 .attrs.mac | hex2dec }}`)

	report, err := f.svc.RecomputeSN(f.ctx, f.catID, true)
	if err != nil {
		t.Fatalf("dry run: %v", err)
	}
	if len(report.Conflicts) == 0 {
		t.Fatal("the dry run must surface the collision before anything is written")
	}
	if len(report.Conflicts[0].Assets) < 2 {
		t.Errorf("the conflict should name the devices involved: %+v", report.Conflicts[0])
	}

	report, err = f.svc.RecomputeSN(f.ctx, f.catID, false)
	if err != nil {
		t.Fatalf("real run should report rather than error: %v", err)
	}
	if report.Applied {
		t.Fatal("a run with a conflict must not be applied")
	}
	for i, id := range ids {
		if got := f.snOf(t, id); got != before[i] {
			t.Errorf("asset %d changed despite the rollback: %q -> %q", i, before[i], got)
		}
	}
}

func TestRecomputeWithNoChangesIsANoOp(t *testing.T) {
	f := newFixture(t)
	if _, err := f.save(t, SaveInput{Attrs: map[string]any{"mac": "001A2B3C4D5E"}}); err != nil {
		t.Fatal(err)
	}
	report, err := f.svc.RecomputeSN(f.ctx, f.catID, false)
	if err != nil {
		t.Fatalf("recompute: %v", err)
	}
	if report.Affected != 0 {
		t.Errorf("nothing should change when the rule is unchanged, got %d", report.Affected)
	}
	if report.Applied {
		t.Error("a run that changes nothing has nothing to apply")
	}
}

func TestRecomputeReportsAnUnevaluableRule(t *testing.T) {
	f := newFixture(t)
	if _, err := f.save(t, SaveInput{Attrs: map[string]any{"mac": "001A2B3C4D5E"}}); err != nil {
		t.Fatal(err)
	}
	// firmware is not set on this asset.
	f.setSNTemplate(t, `{{ .attrs.firmware | upper }}`)

	_, err := f.svc.RecomputeSN(f.ctx, f.catID, true)
	if err == nil {
		t.Fatal("a rule that cannot be evaluated must be reported, not applied")
	}
	var fe FieldErrors
	if !errors.As(err, &fe) || fe["sn"] == "" {
		t.Errorf("the error should point at the serial number, got %#v", err)
	}
}

func TestRecomputeRequiresAKnownCategory(t *testing.T) {
	f := newFixture(t)
	if _, err := f.svc.RecomputeSN(f.ctx, "missing", true); !errors.Is(err, schema.ErrNotFound) {
		t.Errorf("want ErrNotFound, got %v", err)
	}
}

var _ = model.StatusInStock
