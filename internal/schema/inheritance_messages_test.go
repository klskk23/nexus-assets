package schema

import (
	"errors"
	"strings"
	"testing"

	"github.com/klskk23/nexus-assets/internal/i18n"
)

// Invalid drafts must explain the correction, not just repeat "bad request".
func TestInheritanceDraftErrorsExplainTheInvalidChoice(t *testing.T) {
	for _, tc := range []struct {
		name   string
		draft  CategoryDraft
		zh, en string
	}{
		{name: "null", draft: CategoryDraft{InheritedFieldIDs: slicePointer(nil)}, zh: "null", en: "null"},
		{name: "unavailable field", draft: CategoryDraft{InheritedFieldIDs: slicePointer([]string{"unavailable-field"})}, zh: "unavailable-field", en: "unavailable-field"},
		{name: "cycle", draft: CategoryDraft{ParentID: parentPointer("leaf")}, zh: "后代", en: "descendant"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			s, ctx := newStore(t)
			seedSnapshot(t, s, ctx)
			_, err := s.PreviewCategory(ctx, "child", tc.draft)
			if !errors.Is(err, ErrInheritanceSelection) {
				t.Fatalf("invalid draft error = %v", err)
			}
			if !i18n.HasText(err) {
				t.Fatalf("draft error is not localizable: %v", err)
			}
			zh, en := i18n.Text(err, i18n.ZH), i18n.Text(err, i18n.EN)
			if !strings.Contains(zh, tc.zh) || !strings.Contains(en, tc.en) || zh == en {
				t.Fatalf("unhelpful draft error: zh=%q en=%q", zh, en)
			}
		})
	}
}

func parentPointer(id string) **string {
	parent := &id
	return &parent
}
