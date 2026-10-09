package main

import (
	"context"
	"fmt"
	"log"

	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/schema"
	"github.com/klskk23/nexus-assets/internal/store"
)

func verifySchema(sch *schema.SchemaSnapshot) int {
	problems := 0
	for _, cat := range sch.Categories() {
		expected := "/" + cat.ID + "/"
		if cat.ParentID != nil {
			parent, err := sch.Category(*cat.ParentID)
			if err != nil {
				problems++
				log.Printf("category %s: missing parent %s", cat.ID, *cat.ParentID)
			}
			expected = parent.Path + cat.ID + "/"
		}
		if cat.Path != expected {
			problems++
			log.Printf("category %s: path %q, expected %q", cat.ID, cat.Path, expected)
		}
		fields, err := sch.EffectiveFields(cat.ID)
		if err != nil {
			problems++
			log.Printf("category %s: invalid tree or inheritance selection: %v", cat.ID, err)
			continue
		}
		if !verifyDisplayKey(cat.DisplayKey, fields) {
			problems++
			log.Printf("category %s: display key %q is not effective", cat.ID, cat.DisplayKey)
		}
		problems += verifyDependencies(cat.ID, "", fields)
		for _, m := range sch.Models() {
			deviceFields, err := sch.FieldsForAsset(cat.Path, m.ID)
			if err != nil {
				problems++
				log.Printf("category %s model %s: cannot resolve fields: %v", cat.ID, m.ID, err)
				continue
			}
			problems += verifyDependencies(cat.ID, m.ID, deviceFields)
		}
	}
	return problems
}

func verifyDisplayKey(key string, fields []model.BoundField) bool {
	if key == "" {
		return true
	}
	for _, f := range fields {
		if f.Key == key {
			return true
		}
	}
	return false
}

func verifyDependencies(categoryID, modelID string, fields []model.BoundField) int {
	byKey := make(map[string]model.FieldDefinition, len(fields))
	for _, f := range fields {
		def := f.FieldDefinition
		def.Required = f.Required
		byKey[f.Key] = def
	}
	problems := 0
	for _, f := range fields {
		if f.Type != model.FieldComputed {
			continue
		}
		deps, err := schema.DependencyClosure(f.Key, byKey)
		if err != nil {
			problems++
			log.Printf("category %s model %s field %s: invalid computation: %v", categoryID, modelID, f.Key, err)
			continue
		}
		for _, key := range deps {
			dep, ok := byKey[key]
			if !ok || (dep.Type != model.FieldComputed && !dep.Required) {
				problems++
				log.Printf("category %s model %s field %s: dependency %s is missing or optional", categoryID, modelID, f.Key, key)
			}
		}
	}
	return problems
}

// Foreign-key checks catch orphan selections and bindings hidden by definition
// joins, including damage introduced by external connections with checks off.
func verifyReferences(ctx context.Context, q store.Querier) (int, error) {
	rows, err := q.QueryContext(ctx, `PRAGMA foreign_key_check`)
	if err != nil {
		return 0, fmt.Errorf("check references: %w", err)
	}
	defer rows.Close()
	problems := 0
	for rows.Next() {
		var table, parent string
		var rowID *int64
		var constraint int
		if err := rows.Scan(&table, &rowID, &parent, &constraint); err != nil {
			return 0, fmt.Errorf("scan invalid reference: %w", err)
		}
		problems++
		log.Printf("verify: table %s has a dangling reference to %s (constraint %d)", table, parent, constraint)
	}
	return problems, rows.Err()
}

// Compare actual binding intersections, not global key equality. Category
// chains deliberately ignore selections; a model can occur in every category.
// An identical field may overlap model/vendor bindings, but not binding modes.
func verifyKeyConflicts(ctx context.Context, q store.Querier) (int, error) {
	rows, err := q.QueryContext(ctx, `
 WITH RECURSIVE ancestry(descendant,ancestor) AS (
  SELECT id,id FROM categories
  UNION
  SELECT a.descendant,c.parent_id FROM ancestry a JOIN categories c ON c.id=a.ancestor WHERE c.parent_id IS NOT NULL
 ), bound AS (
  SELECT f.id,f.key,'category' AS side,b.category_id AS target FROM category_fields b JOIN field_definitions f ON f.id=b.field_id
  UNION ALL
  SELECT f.id,f.key,'model',b.model_id FROM model_fields b JOIN field_definitions f ON f.id=b.field_id
  UNION ALL
  SELECT f.id,f.key,'vendor',b.vendor_id FROM vendor_fields b JOIN field_definitions f ON f.id=b.field_id
 )
 SELECT DISTINCT a.key,a.id,b.id FROM bound a JOIN bound b ON a.key=b.key AND a.id<=b.id
 WHERE
  ((a.side='category') != (b.side='category'))
  OR (a.id!=b.id AND (
   (a.side='category' AND b.side='category' AND EXISTS(SELECT 1 FROM ancestry x WHERE (x.descendant=a.target AND x.ancestor=b.target) OR (x.descendant=b.target AND x.ancestor=a.target)))
   OR (a.side=b.side AND a.side!='category' AND a.target=b.target)
   OR (a.side='model' AND b.side='vendor' AND EXISTS(SELECT 1 FROM product_models m WHERE m.id=a.target AND m.vendor_id=b.target))
   OR (a.side='vendor' AND b.side='model' AND EXISTS(SELECT 1 FROM product_models m WHERE m.id=b.target AND m.vendor_id=a.target))
  ))`)
	if err != nil {
		return 0, fmt.Errorf("key conflicts: %w", err)
	}
	defer rows.Close()
	n := 0
	for rows.Next() {
		var key, left, right string
		if err := rows.Scan(&key, &left, &right); err != nil {
			return 0, fmt.Errorf("scan key conflict: %w", err)
		}
		n++
		log.Printf("verify: key %q has incompatible bindings for fields %s and %s", key, left, right)
	}
	return n, rows.Err()
}
