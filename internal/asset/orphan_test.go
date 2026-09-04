package asset

import (
	"testing"

	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/schema"
)

// Unbinding is the only way to retire a field that assets carry values for, and
// the whole point is that those values survive. If the next ordinary edit wipes
// them, the retirement path quietly destroys data.
func TestOrphanValuesSurviveALaterSave(t *testing.T) {
	f := newFixture(t)

	rack, err := f.schema.CreateField(f.ctx, schema.CreateFieldInput{
		Key: "rack", Label: "机柜", Type: model.FieldText,
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := f.schema.Bind(f.ctx, f.rootID, rack.ID, 40); err != nil {
		t.Fatal(err)
	}

	a, err := f.save(t, SaveInput{Attrs: map[string]any{"mac": "001A2B3C4D5E", "rack": "R-01"}})
	if err != nil {
		t.Fatal(err)
	}
	if err := f.schema.Unbind(f.ctx, f.rootID, rack.ID); err != nil {
		t.Fatal(err)
	}

	got, err := f.svc.Get(f.ctx, a.ID)
	if err != nil {
		t.Fatal(err)
	}
	if got.ArchivedAttrs["rack"] != "R-01" {
		t.Fatalf("right after the unbind the value should be an archived attribute, got %#v", got.ArchivedAttrs)
	}

	// An ordinary edit that has nothing to do with rack.
	if _, err := f.save(t, SaveInput{
		ID: a.ID, Version: got.Version,
		Attrs: map[string]any{"mac": "001A2B3C4D5E", "firmware": "2.2.0"},
	}); err != nil {
		t.Fatalf("update: %v", err)
	}

	after, err := f.svc.Get(f.ctx, a.ID)
	if err != nil {
		t.Fatal(err)
	}
	if after.ArchivedAttrs["rack"] != "R-01" {
		t.Errorf("the orphan value did not survive an unrelated edit: %#v", after.ArchivedAttrs)
	}
}
