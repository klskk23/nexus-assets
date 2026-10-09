package main

import (
	"context"
	"database/sql"
	"strings"
	"testing"

	"github.com/klskk23/nexus-assets/internal/asset"
	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/schema"
)

func verifyExec(t *testing.T, a *app, query string, args ...any) {
	t.Helper()
	if _, err := a.db.WriteDBForTest().ExecContext(context.Background(), query, args...); err != nil {
		t.Fatal(err)
	}
}

func verifyIDs(t *testing.T, a *app) (string, string, string) {
	t.Helper()
	var cat, field, id string
	if err := a.db.ReadDB().QueryRow(`SELECT a.category_id, f.id, a.id FROM assets a JOIN field_definitions f ON f.key = 'mac' LIMIT 1`).Scan(&cat, &field, &id); err != nil {
		t.Fatal(err)
	}
	return cat, field, id
}

// Each mutation leaves valid SQL but breaks one derived-index invariant.
func TestVerifyDetectsIndexDrift(t *testing.T) {
	for _, tc := range []struct{ name, query string }{
		{"missing unique", `DELETE FROM asset_unique_values WHERE asset_id = ?`},
		{"unique value", `UPDATE asset_unique_values SET value = 'WRONG' WHERE asset_id = ?`},
		{"unique scope", `UPDATE asset_unique_values SET scope_id = 'wrong-scope' WHERE asset_id = ?`},
		{"live suppressed", `UPDATE asset_unique_values SET search_suppressed = 1 WHERE asset_id = ?`},
		{"extra unique", `INSERT INTO asset_unique_values(asset_id, field_key, value, scope_id, created_at) VALUES (?, 'orphan', 'old', 'scope', '2026-01-01T00:00:00Z')`},
		{"duplicate unique", `INSERT INTO asset_unique_values(asset_id, field_key, value, scope_id, created_at) SELECT asset_id, field_key, value, 'duplicate-scope', created_at FROM asset_unique_values WHERE asset_id = ?`},
		{"missing search", `DELETE FROM asset_search_values WHERE asset_id = ?`},
		{"search value", `UPDATE asset_search_values SET value = 'WRONG' WHERE asset_id = ?`},
		{"extra search", `INSERT INTO asset_search_values(asset_id, field_key, value) VALUES (?, 'orphan', 'old')`},
	} {
		t.Run(tc.name, func(t *testing.T) {
			a, _, _ := newApp(t)
			_, _, id := verifyIDs(t, a)
			verifyExec(t, a, tc.query, id)
			if err := runVerify(context.Background(), a); err == nil {
				t.Fatal("corrupted index reconciled")
			}
		})
	}
}

func TestVerifyDetectsSchemaCorruption(t *testing.T) {
	for _, scenario := range []string{"root selection", "unreachable selection", "direct selection", "path", "cycle", "display key", "missing dependency", "optional dependency", "computed cycle", "invalid expression", "device dependency"} {
		t.Run(scenario, func(t *testing.T) {
			a, _, _ := newApp(t)
			cat, field, _ := verifyIDs(t, a)
			child, err := a.schema.CreateCategory(context.Background(), schema.CreateCategoryInput{ParentID: &cat, Code: "CHILD", Name: "Child"})
			if err != nil {
				t.Fatal(err)
			}
			switch scenario {
			case "root selection":
				verifyExec(t, a, `INSERT INTO category_field_selections VALUES (?, ?)`, cat, field)
			case "unreachable selection":
				grand, err := a.schema.CreateCategory(context.Background(), schema.CreateCategoryInput{ParentID: &child.ID, Code: "GRAND", Name: "Grand"})
				if err != nil {
					t.Fatal(err)
				}
				verifyExec(t, a, `INSERT INTO category_field_selections VALUES (?, ?)`, grand.ID, field)
			case "direct selection":
				verifyExec(t, a, `INSERT INTO category_fields(category_id,field_id,sort) VALUES (?, ?, 0)`, child.ID, field)
				verifyExec(t, a, `INSERT INTO category_field_selections VALUES (?, ?)`, child.ID, field)
			case "path":
				verifyExec(t, a, `UPDATE categories SET path = '/wrong/' WHERE id = ?`, child.ID)
			case "cycle":
				verifyExec(t, a, `UPDATE categories SET parent_id = ? WHERE id = ?`, child.ID, cat)
			case "display key":
				verifyExec(t, a, `UPDATE categories SET display_key = 'mac' WHERE id = ?`, child.ID)
			default:
				template := "attrs.missing"
				if scenario == "optional dependency" {
					template = "attrs.mac"
				}
				if scenario == "computed cycle" {
					template = "attrs.derived"
				}
				if scenario == "invalid expression" {
					template = "attrs[model.name]"
				}
				f, err := a.schema.CreateField(context.Background(), schema.CreateFieldInput{Key: "derived", Label: "Derived", Type: model.FieldText})
				if err != nil {
					t.Fatal(err)
				}
				verifyExec(t, a, `UPDATE field_definitions SET type='computed', options=json_object('template', ?) WHERE id=?`, template, f.ID)
				if scenario == "device dependency" {
					m, err := a.schema.CreateModel(context.Background(), schema.CreateModelInput{Name: "Device"})
					if err != nil {
						t.Fatal(err)
					}
					verifyExec(t, a, `INSERT INTO model_fields(model_id,field_id,sort) VALUES (?, ?, 0)`, m.ID, f.ID)
				} else {
					verifyExec(t, a, `INSERT INTO category_fields(category_id,field_id,sort) VALUES (?, ?, 0)`, cat, f.ID)
				}
			}
			if err := runVerify(context.Background(), a); err == nil {
				t.Fatal("corrupted schema reconciled")
			}
		})
	}
}

// Binding conflicts depend on overlap, not a global key uniqueness rule.
func TestVerifyBindingConflictMatrix(t *testing.T) {
	for _, tc := range []struct {
		name, left, right             string
		overlap, sameField, wantError bool
	}{
		{"sibling categories", "category", "category", false, false, false},
		{"ancestor categories without selection", "category", "category", true, false, true},
		{"disjoint models", "model", "model", false, false, false},
		{"same model", "model", "model", true, false, true},
		{"disjoint vendors", "vendor", "vendor", false, false, false},
		{"same vendor", "vendor", "vendor", true, false, true},
		{"unrelated model vendor", "model", "vendor", false, false, false},
		{"matching model vendor", "model", "vendor", true, false, true},
		{"category model", "category", "model", false, false, true},
		{"category vendor", "category", "vendor", false, false, true},
		{"same field model vendor", "model", "vendor", true, true, false},
		{"mixed field mode", "category", "vendor", false, true, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			a, _, _ := newApp(t)
			ctx := context.Background()
			root, _, _ := verifyIDs(t, a)
			c1, err := a.schema.CreateCategory(ctx, schema.CreateCategoryInput{Code: "C1", Name: "C1", ParentID: &root})
			if err != nil {
				t.Fatal(err)
			}
			parent := root
			if tc.overlap {
				parent = c1.ID
			}
			c2, err := a.schema.CreateCategory(ctx, schema.CreateCategoryInput{Code: "C2", Name: "C2", ParentID: &parent})
			if err != nil {
				t.Fatal(err)
			}
			v1, err := a.schema.CreateVendor(ctx, "V1")
			if err != nil {
				t.Fatal(err)
			}
			v2, err := a.schema.CreateVendor(ctx, "V2")
			if err != nil {
				t.Fatal(err)
			}
			m1, err := a.schema.CreateModel(ctx, schema.CreateModelInput{Name: "M1", VendorID: v1.ID})
			if err != nil {
				t.Fatal(err)
			}
			m2, err := a.schema.CreateModel(ctx, schema.CreateModelInput{Name: "M2", VendorID: v2.ID})
			if err != nil {
				t.Fatal(err)
			}
			f1, err := a.schema.CreateField(ctx, schema.CreateFieldInput{Key: "shared", Label: "Shared", Type: model.FieldText})
			if err != nil {
				t.Fatal(err)
			}
			f2 := f1
			if !tc.sameField {
				f2, err = a.schema.CreateField(ctx, schema.CreateFieldInput{Key: "shared", Label: "Shared 2", Type: model.FieldText})
				if err != nil {
					t.Fatal(err)
				}
			}
			left := map[string]string{"category": c1.ID, "model": m1.ID, "vendor": v1.ID}
			right := map[string]string{"category": c2.ID, "model": m2.ID, "vendor": v2.ID}
			if tc.overlap {
				right["model"] = m1.ID
				right["vendor"] = v1.ID
			}
			for _, b := range []struct{ side, id, field string }{{tc.left, left[tc.left], f1.ID}, {tc.right, right[tc.right], f2.ID}} {
				verifyExec(t, a, `INSERT INTO `+b.side+`_fields(`+b.side+`_id,field_id,sort) VALUES(?,?,0)`, b.id, b.field)
			}
			err = runVerify(ctx, a)
			if (err != nil) != tc.wantError {
				t.Fatalf("verify=%v, want error=%v", err, tc.wantError)
			}
		})
	}
}

func TestVerifyWithdrawalRestoreAndOrdinaryHistory(t *testing.T) {
	a, user, holder := newApp(t)
	ctx := context.Background()
	root, field, _ := verifyIDs(t, a)
	child, err := a.schema.CreateCategory(ctx, schema.CreateCategoryInput{ParentID: &root, Code: "CHILD", Name: "Child", InheritedFieldIDs: &[]string{field}})
	if err != nil {
		t.Fatal(err)
	}
	saved, err := a.assets.Save(ctx, asset.SaveInput{CategoryID: child.ID, Status: model.StatusInStock, OwnerID: user, Holder: model.Holder{Type: model.HolderTypeEntity, ID: holder}, ActorID: user, Attrs: map[string]any{"mac": "AABBCCDDEE01"}})
	if err != nil {
		t.Fatal(err)
	}
	saved, err = a.assets.Save(ctx, asset.SaveInput{ID: saved.ID, Version: saved.Version, CategoryID: child.ID, Status: saved.Status, OwnerID: user, Holder: saved.Holder, ActorID: user, Attrs: map[string]any{"mac": "AABBCCDDEE02"}})
	if err != nil {
		t.Fatal(err)
	}
	if err := runVerify(ctx, a); err != nil {
		t.Fatalf("ordinary history: %v", err)
	}
	for _, change := range []string{"removed", "added"} {
		err = a.db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
			before, err := schema.LoadSchemaSnapshot(ctx, tx)
			if err != nil {
				return err
			}
			query := `DELETE FROM category_field_selections WHERE category_id=? AND field_id=?`
			if change == "added" {
				query = `INSERT INTO category_field_selections(category_id,field_id) VALUES (?,?)`
			}
			if _, err := tx.ExecContext(ctx, query, child.ID, field); err != nil {
				return err
			}
			after, err := schema.LoadSchemaSnapshot(ctx, tx)
			if err != nil {
				return err
			}
			plan, err := asset.NewSchemaEffects().Plan(ctx, tx, schema.SchemaChange{Before: before, After: after, Changes: []schema.FieldDelta{{CategoryID: child.ID, FieldID: field, Key: "mac", Change: change}}})
			if err != nil {
				return err
			}
			if len(plan.Issues) > 0 {
				t.Fatalf("effects: %+v", plan.Issues)
			}
			return plan.Apply(ctx, tx)
		})
		if err != nil {
			t.Fatal(err)
		}
		if err := runVerify(ctx, a); err != nil {
			t.Fatalf("%s: %v", change, err)
		}
	}
	var attrs string
	if err := a.db.ReadDB().QueryRow(`SELECT attrs FROM assets WHERE id=?`, saved.ID).Scan(&attrs); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(attrs, "AABBCCDDEE02") {
		t.Fatalf("verify changed raw attrs: %s", attrs)
	}
}
