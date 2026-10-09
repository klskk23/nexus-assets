package schema

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"slices"

	"github.com/klskk23/nexus-assets/internal/i18n"
	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/store"
)

var ErrImpactStale = errors.New("schema change confirmation is stale")

func newConfirmationKey() [32]byte {
	var key [32]byte
	// crypto/rand.Read fails closed on an unavailable system entropy source.
	rand.Read(key[:])
	return key
}

// confirmationSchema excludes mutable resolution caches and includes every
// definition and binding used by dependency, collision and source validation.
type confirmationSchema struct {
	Categories     map[string]model.Category
	Fields         map[string]model.FieldDefinition
	Models         map[string]model.ProductModel
	Vendors        map[string]model.Vendor
	Bindings       map[string][]Binding
	Selections     map[string]map[string]bool
	ModelBindings  map[string][]ModelBinding
	VendorBindings map[string][]ModelBinding
}

func confirmationSnapshot(s *SchemaSnapshot) confirmationSchema {
	return confirmationSchema{s.categories, s.fields, s.models, s.vendors,
		s.bindings, s.selections, s.modelBindings, s.vendorBindings}
}

func (s *Store) signCategoryPlan(ctx context.Context, q store.Querier, operation, target string, draft CategoryDraft, plan categoryPlan) (string, error) {
	draft.ConfirmationToken = ""
	if draft.InheritedFieldIDs != nil {
		ids := slices.Clone(*draft.InheritedFieldIDs)
		slices.Sort(ids)
		ids = slices.Compact(ids)
		draft.InheritedFieldIDs = &ids
	}
	mac := hmac.New(sha256.New, s.confirmationKey[:])
	encoder := json.NewEncoder(mac)
	payload := struct {
		Operation, Target string
		Draft             CategoryDraft
		ParentPresent     bool
		Before, After     confirmationSchema
		Changes           []FieldDelta
	}{operation, target, draft, draft.ParentID != nil,
		confirmationSnapshot(plan.before), confirmationSnapshot(plan.after), plan.preview.Changes}
	if err := encoder.Encode(payload); err != nil {
		return "", fmt.Errorf("encode confirmation: %w", err)
	}
	categories := make([]string, 0, len(plan.preview.Changes))
	for _, change := range plan.preview.Changes {
		categories = append(categories, change.CategoryID)
	}
	slices.Sort(categories)
	encoded, err := json.Marshal(slices.Compact(categories))
	if err != nil {
		return "", err
	}
	// Stream all affected records, not an HTTP page or just a count/version.
	// Raw attributes are validation input even if a legacy writer missed a version.
	if err := encodeConfirmationRows(ctx, q, encoder, `SELECT * FROM assets
  WHERE category_id IN (SELECT value FROM json_each(?)) ORDER BY id`, string(encoded)); err != nil {
		return "", err
	}
	// Claims outside the affected set also determine whether final values are legal.
	// Including all claims conservatively invalidates a preview on concurrent edits.
	if err := encodeConfirmationRows(ctx, q, encoder, `SELECT * FROM asset_unique_values
  ORDER BY asset_id, field_key, scope_id, value, rowid`); err != nil {
		return "", err
	}
	return hex.EncodeToString(mac.Sum(nil)), nil
}

func encodeConfirmationRows(ctx context.Context, q store.Querier, encoder *json.Encoder, query string, args ...any) error {
	rows, err := q.QueryContext(ctx, query, args...)
	if err != nil {
		return err
	}
	defer rows.Close()
	columns, err := rows.Columns()
	if err != nil {
		return err
	}
	if err := encoder.Encode(columns); err != nil {
		return err
	}
	for rows.Next() {
		values := make([]any, len(columns))
		pointers := make([]any, len(columns))
		for i := range values {
			pointers[i] = &values[i]
		}
		if err := rows.Scan(pointers...); err != nil {
			return err
		}
		if err := encoder.Encode(values); err != nil {
			return err
		}
	}
	if err := rows.Err(); err != nil {
		return err
	}
	return encoder.Encode(nil)
}

func (s *Store) prepareConfirmation(ctx context.Context, q store.Querier, operation, target string, draft CategoryDraft, plan *categoryPlan) error {
	plan.preview.RequiresConfirmation = slices.ContainsFunc(plan.preview.Changes, func(d FieldDelta) bool { return d.Change == "removed" })
	if !plan.preview.RequiresConfirmation || len(plan.preview.Issues) != 0 {
		return nil
	}
	token, err := s.signCategoryPlan(ctx, q, operation, target, draft, *plan)
	plan.preview.ConfirmationToken = token
	return err
}

func checkConfirmation(preview CategoryPreview, token string) error {
	// A supplied token must never become authority for a changed, now harmless draft.
	if token != "" {
		expected, err := hex.DecodeString(preview.ConfirmationToken)
		actual, decodeErr := hex.DecodeString(token)
		if err != nil || decodeErr != nil || len(expected) != sha256.Size || !hmac.Equal(expected, actual) {
			return i18n.Wrap(ErrImpactStale, i18n.KeySchemaImpactStale)
		}
		return nil
	}
	if preview.RequiresConfirmation {
		return i18n.Wrap(ErrConfirmationRequired, i18n.KeySchemaConfirmationRequired)
	}
	return nil
}
