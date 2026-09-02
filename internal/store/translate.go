package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/klskk23/nexus-assets/internal/compute"
)

// TranslateExpressions rewrites stored computed-field rules from the old
// text/template syntax into expressions.
//
// It runs once, guarded by a marker row, because it is not idempotent in the
// useful sense: a rule already translated would fail to parse as a template
// and be reported as an error on every start.
//
// Why here and not in the migration: the two engines order pipe arguments
// differently, so `pad 16` becomes `pad(x, 16)`. That inversion needs the
// syntax tree, and SQL has none.
//
// Rules it cannot carry over exactly are left alone and reported. A serial
// number is a unique index; a guessed translation would produce a different
// number for the same device, and the collision would surface on the next
// save rather than here.
func (s *Store) TranslateExpressions(ctx context.Context) error {
	var done int
	err := s.read.QueryRowContext(ctx,
		`SELECT count(*) FROM expression_syntax_migration WHERE id = 1`).Scan(&done)
	if err != nil {
		return fmt.Errorf("check expression migration: %w", err)
	}
	if done > 0 {
		return nil
	}

	rules, err := s.computedRules(ctx)
	if err != nil {
		return err
	}

	translated, failed := 0, 0
	err = s.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		for _, r := range rules {
			options, old, next, err := translateRule(r)
			switch {
			case err != nil:
				return err
			case next == "":
				// Nothing to carry over, or nothing that could be: a rule that
				// cannot be translated is left as it was and named in the log.
				// Someone has to look at it, and a silent half-migration is how
				// that stops happening.
				if old != "" {
					failed++
				}
				continue
			}
			if _, err := tx.ExecContext(ctx,
				`UPDATE field_definitions SET options = ? WHERE id = ?`, options, r.id); err != nil {
				return err
			}
			log.Printf("expression migration: %q  %s  ->  %s", r.key, old, next)
			translated++
		}

		_, err := tx.ExecContext(ctx,
			`INSERT INTO expression_syntax_migration (id, migrated_at, translated, failed)
			 VALUES (1, ?, ?, ?)`,
			FormatTime(time.Now().UTC()), translated, failed)
		return err
	})
	if err != nil {
		return fmt.Errorf("translate expressions: %w", err)
	}
	if translated > 0 || failed > 0 {
		log.Printf("expression migration: %d rule(s) translated, %d need a hand", translated, failed)
	}
	return nil
}

// rule is one stored computed field, as it is on disk.
type rule struct{ id, key, options string }

// computedRules reads every computed field's stored expression.
func (s *Store) computedRules(ctx context.Context) ([]rule, error) {
	rows, err := s.read.QueryContext(ctx,
		`SELECT id, key, options FROM field_definitions WHERE type = 'computed'`)
	if err != nil {
		return nil, fmt.Errorf("list computed fields: %w", err)
	}
	defer rows.Close()

	var rules []rule
	for rows.Next() {
		var r rule
		if err := rows.Scan(&r.id, &r.key, &r.options); err != nil {
			return nil, err
		}
		rules = append(rules, r)
	}
	return rules, rows.Err()
}

// translateRule rewrites one rule into the new syntax.
//
// It returns the encoded options to store, the expression as it was, and the
// expression it became. An empty `next` means nothing was written: either the
// field carries no expression at all, or the translation could not be trusted
// -- which is reported here, because the caller only counts.
//
// Not trusting a doubtful translation is the point. A serial number is a unique
// index, and a guess that produced a different number for the same device would
// surface as a collision on the next save rather than here.
func translateRule(r rule) (options, old, next string, err error) {
	var opts map[string]any
	if err := json.Unmarshal([]byte(r.options), &opts); err != nil {
		return "", "", "", fmt.Errorf("read options of %q: %w", r.key, err)
	}
	old, _ = opts["template"].(string)
	if old == "" {
		return "", "", "", nil
	}

	next, err = compute.Translate(old)
	if err == nil {
		_, err = compute.Parse(r.key, next)
	}
	if err != nil {
		log.Printf("expression migration: %q needs rewriting by hand (%v): %s", r.key, err, old)
		return "", old, "", nil
	}

	opts["template"] = next
	encoded, err := json.Marshal(opts)
	if err != nil {
		return "", old, "", err
	}
	return string(encoded), old, next, nil
}
