package schema

import (
	"reflect"
	"testing"

	"github.com/klskk23/nexus-assets/internal/model"
)

func TestStoreFieldReadersUseExplicitSelections(t *testing.T) {
	s, ctx := newStore(t)
	seedSnapshot(t, s, ctx)
	for _, tc := range []struct {
		name string
		read func() ([]model.BoundField, error)
	}{
		{"category", func() ([]model.BoundField, error) { return s.EffectiveFields(ctx, "leaf") }},
		{"path", func() ([]model.BoundField, error) { return s.FieldsOfPath(ctx, "/root/child/leaf/") }},
		{"asset", func() ([]model.BoundField, error) { return s.FieldsForAsset(ctx, "/root/child/leaf/", "") }},
		{"asset category", func() ([]model.BoundField, error) { return s.EffectiveFieldsForAsset(ctx, "leaf", nil) }},
		{"possible", func() ([]model.BoundField, error) { return s.EveryPossibleField(ctx, "leaf") }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			fields, err := tc.read()
			if err != nil {
				t.Fatal(err)
			}
			if got := snapshotIDs(fields); !reflect.DeepEqual(got, []string{"a", "c", "d"}) {
				t.Fatalf("fields = %v, want only explicitly selected ancestors and own bindings", got)
			}
			if fields[0].InheritedFrom != "root" {
				t.Fatalf("original source lost: %+v", fields[0])
			}
		})
	}
}
