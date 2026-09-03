// Package audit records who changed the configuration, when, and to what.
//
// Asset movement already has its own immutable trail in asset_transfers. This
// is for everything around it: the categories, information items, models,
// holder entities and accounts. Those changes are rarer but far wider-reaching
// -- editing one serial-number rule can renumber a whole warehouse -- so when
// something looks wrong the first question is who changed the configuration.
package audit

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/klskk23/nexus-assets/internal/store"
)

// Action is what happened to the target.
type Action string

const (
	ActionCreate    Action = "create"
	ActionUpdate    Action = "update"
	ActionArchive   Action = "archive"
	ActionDelete    Action = "delete"
	ActionRecompute Action = "recompute"
)

// TargetType names the kind of object that changed.
type TargetType string

const (
	TargetCategory TargetType = "category"
	TargetField    TargetType = "field"
	TargetBinding  TargetType = "binding"
	TargetModel    TargetType = "model"
	TargetHolder   TargetType = "holder"
	TargetUser     TargetType = "user"
	TargetRole     TargetType = "role"
	TargetStatus   TargetType = "status"
)

// Entry is one recorded change.
type Entry struct {
	ID int64 `json:"id"`
	// ActorID ships alongside the name so the screen can offer "only this
	// person" -- names repeat and get renamed, the id is what the filter needs.
	ActorID    string     `json:"actor_id"`
	ActorName  string     `json:"actor_name"`
	Action     Action     `json:"action"`
	TargetType TargetType `json:"target_type"`
	TargetID   string     `json:"target_id"`
	// TargetLabel is resolved at read time so a deleted object still reads
	// as something a person recognises.
	TargetLabel string          `json:"target_label,omitempty"`
	Before      json.RawMessage `json:"before,omitempty"`
	After       json.RawMessage `json:"after,omitempty"`
	CreatedAt   time.Time       `json:"created_at"`
}

// Store writes and reads audit entries.
type Store struct{ db *store.Store }

// New builds the audit store.
func New(db *store.Store) *Store { return &Store{db: db} }

// Record writes one entry.
//
// A failure here is returned rather than swallowed: an audit trail with silent
// gaps is worse than none, because it invites trust it has not earned.
func (s *Store) Record(ctx context.Context, actorID string, action Action,
	targetType TargetType, targetID string, before, after any) error {

	beforeJSON, err := encode(before)
	if err != nil {
		return fmt.Errorf("encode audit before-state: %w", err)
	}
	afterJSON, err := encode(after)
	if err != nil {
		return fmt.Errorf("encode audit after-state: %w", err)
	}

	return s.db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx,
			`INSERT INTO audit_log (actor_id, action, target_type, target_id, before, after, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?)`,
			actorID, string(action), string(targetType), targetID,
			beforeJSON, afterJSON, store.FormatTime(time.Now().UTC()))
		return err
	})
}

func encode(v any) (any, error) {
	if v == nil {
		return nil, nil
	}
	b, err := json.Marshal(v)
	if err != nil {
		return nil, err
	}
	return string(b), nil
}

// Filter narrows an audit query.
type Filter struct {
	TargetType string
	TargetID   string
	// ActorID answers "what did this person change", which is a question an
	// audit log exists for and could not be asked until now.
	ActorID string
	// Action narrows to one kind of change. Deletions are the ones people come
	// looking for, and they are the rarest rows in the table.
	Action string
	// Q searches the actor's name and the object's id. Not the object's name:
	// audit_log records what was changed, not what it was called, and the
	// label a row shows is resolved elsewhere -- searching it would mean
	// joining six tables to answer "find me the word I remember".
	Q      string
	From   *time.Time
	To     *time.Time
	Offset int
	Limit  int
}

// Page is one page of entries plus the total.
type Page struct {
	Items  []Entry `json:"items"`
	Total  int     `json:"total"`
	Offset int     `json:"offset"`
	Limit  int     `json:"limit"`
}

// List returns audit entries newest first.
func (s *Store) List(ctx context.Context, f Filter) (Page, error) {
	page := Page{Items: []Entry{}, Offset: f.Offset, Limit: f.Limit}

	clause, args := narrow(f)

	if err := s.db.ReadDB().QueryRowContext(ctx,
		`SELECT count(*) FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id
		 WHERE `+clause, args...).Scan(&page.Total); err != nil {
		return page, fmt.Errorf("count audit entries: %w", err)
	}

	// The actor is joined so the list reads as names rather than ids; a deleted
	// account still leaves its id behind, which is the point of an audit trail.
	q := `SELECT a.id, a.actor_id, coalesce(u.name, a.actor_id), a.action, a.target_type,
	             a.target_id, a.before, a.after, a.created_at
	      FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id
	      WHERE ` + clause + `
	      ORDER BY a.created_at DESC, a.id DESC LIMIT ? OFFSET ?`
	rows, err := s.db.ReadDB().QueryContext(ctx, q, append(args, f.Limit, f.Offset)...)
	if err != nil {
		return page, fmt.Errorf("list audit entries: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var e Entry
		var before, after sql.NullString
		var created string
		if err := rows.Scan(&e.ID, &e.ActorID, &e.ActorName, &e.Action, &e.TargetType,
			&e.TargetID, &before, &after, &created); err != nil {
			return page, err
		}
		if before.Valid && before.String != "" {
			e.Before = json.RawMessage(before.String)
		}
		if after.Valid && after.String != "" {
			e.After = json.RawMessage(after.String)
		}
		if e.CreatedAt, err = store.ParseTime(created); err != nil {
			return page, err
		}
		page.Items = append(page.Items, e)
	}
	return page, rows.Err()
}

// narrow turns a filter into the WHERE clause and its arguments. Its own
// function so List stays one thing: read a page, scan it, return it.
func narrow(f Filter) (string, []any) {
	where := []string{"1 = 1"}
	args := []any{}
	if f.TargetType != "" {
		where = append(where, "a.target_type = ?")
		args = append(args, f.TargetType)
	}
	if f.TargetID != "" {
		where = append(where, "a.target_id = ?")
		args = append(args, f.TargetID)
	}
	if f.ActorID != "" {
		where = append(where, "a.actor_id = ?")
		args = append(args, f.ActorID)
	}
	if f.Action != "" {
		where = append(where, "a.action = ?")
		args = append(args, f.Action)
	}
	if q := strings.TrimSpace(f.Q); q != "" {
		where = append(where, "(lower(coalesce(u.name, '')) LIKE ? OR lower(a.target_id) LIKE ?)")
		like := "%" + strings.ToLower(q) + "%"
		args = append(args, like, like)
	}
	if f.From != nil {
		where = append(where, "a.created_at >= ?")
		args = append(args, store.FormatTime(*f.From))
	}
	if f.To != nil {
		where = append(where, "a.created_at <= ?")
		args = append(args, store.FormatTime(*f.To))
	}
	return strings.Join(where, " AND "), args
}
