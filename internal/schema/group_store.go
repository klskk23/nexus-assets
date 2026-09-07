package schema

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/klskk23/nexus-assets/internal/i18n"
	"github.com/klskk23/nexus-assets/internal/model"
	"github.com/klskk23/nexus-assets/internal/store"
)

// ErrGroupInvalid reports a field group that cannot be saved as asked.
var ErrGroupInvalid = errors.New("field group invalid")

// BindTarget names what a group is being bound to.
//
// The three targets are the three binding tables. A group has no table of its
// own: binding one writes the rows its members would have written individually,
// and nothing downstream ever learns a group was involved (016, decision 105).
type BindTarget string

// The three things a field -- and therefore a group -- can bind to.
const (
	BindToCategory BindTarget = "category"
	BindToModel    BindTarget = "model"
	BindToVendor   BindTarget = "vendor"
)

// ListGroups returns every group with its members, ordered by name.
//
// Members travel with the row because the only two things anyone does with a
// group -- bind it, or edit which fields are in it -- both need the whole list.
// Groups number in the dozens; a lookup per row would be an N+1 for nothing.
func (s *Store) ListGroups(ctx context.Context) ([]model.FieldGroup, error) {
	rows, err := s.db.ReadDB().QueryContext(ctx,
		`SELECT id, name, created_at, updated_at FROM field_groups ORDER BY name`)
	if err != nil {
		return nil, fmt.Errorf("list field groups: %w", err)
	}
	defer rows.Close()
	out := []model.FieldGroup{}
	byID := map[string]int{}
	for rows.Next() {
		var g model.FieldGroup
		var created, updated string
		if err := rows.Scan(&g.ID, &g.Name, &created, &updated); err != nil {
			return nil, err
		}
		if g.CreatedAt, err = store.ParseTime(created); err != nil {
			return nil, err
		}
		if g.UpdatedAt, err = store.ParseTime(updated); err != nil {
			return nil, err
		}
		g.FieldIDs = []string{}
		byID[g.ID] = len(out)
		out = append(out, g)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	members, err := s.membersByGroup(ctx)
	if err != nil {
		return nil, err
	}
	for id, fields := range members {
		if i, ok := byID[id]; ok {
			out[i].FieldIDs = fields
		}
	}
	return out, nil
}

// membersByGroup loads every membership row at once, in bind order.
func (s *Store) membersByGroup(ctx context.Context) (map[string][]string, error) {
	rows, err := s.db.ReadDB().QueryContext(ctx,
		`SELECT group_id, field_id FROM field_group_members ORDER BY group_id, sort, field_id`)
	if err != nil {
		return nil, fmt.Errorf("load group members: %w", err)
	}
	defer rows.Close()
	out := map[string][]string{}
	for rows.Next() {
		var groupID, fieldID string
		if err := rows.Scan(&groupID, &fieldID); err != nil {
			return nil, err
		}
		out[groupID] = append(out[groupID], fieldID)
	}
	return out, rows.Err()
}

// GroupsOfField maps each field to the groups it belongs to, for the field
// page's group filter. A field may be in several groups: the groups are just
// names for handfuls, and one field is useful in more than one handful.
func (s *Store) GroupsOfField(ctx context.Context) (map[string][]string, error) {
	rows, err := s.db.ReadDB().QueryContext(ctx,
		`SELECT field_id, group_id FROM field_group_members ORDER BY field_id, group_id`)
	if err != nil {
		return nil, fmt.Errorf("load field groups: %w", err)
	}
	defer rows.Close()
	out := map[string][]string{}
	for rows.Next() {
		var fieldID, groupID string
		if err := rows.Scan(&fieldID, &groupID); err != nil {
			return nil, err
		}
		out[fieldID] = append(out[fieldID], groupID)
	}
	return out, rows.Err()
}

// GetGroup loads one group with its members.
func (s *Store) GetGroup(ctx context.Context, id string) (model.FieldGroup, error) {
	var g model.FieldGroup
	var created, updated string
	err := s.db.ReadDB().QueryRowContext(ctx,
		`SELECT id, name, created_at, updated_at FROM field_groups WHERE id = ?`, id).
		Scan(&g.ID, &g.Name, &created, &updated)
	if errors.Is(err, sql.ErrNoRows) {
		return g, ErrNotFound
	}
	if err != nil {
		return g, err
	}
	if g.CreatedAt, err = store.ParseTime(created); err != nil {
		return g, err
	}
	if g.UpdatedAt, err = store.ParseTime(updated); err != nil {
		return g, err
	}
	members, err := s.membersByGroup(ctx)
	if err != nil {
		return g, err
	}
	g.FieldIDs = members[g.ID]
	if g.FieldIDs == nil {
		g.FieldIDs = []string{}
	}
	return g, nil
}

// CreateGroupInput describes a new group, and optionally where to bind it.
type CreateGroupInput struct {
	Name     string
	FieldIDs []string
	// GroupTargets binds the group as it is created, in the same transaction
	// and with the same three lists creating a field uses. All empty means
	// "just make the group", which is a perfectly good outcome: unlike a
	// field, a group bound nowhere is still a named handful somebody can bind
	// later.
	GroupTargets
}

// CreateGroup registers a group, its members, and optionally its first binding,
// all in one transaction.
//
// A refused binding leaves no group behind, the same as creating a field with
// categories chosen (decision 72). The request said "make this and put it
// there"; half of that done is a state whoever asked has to go and work out.
func (s *Store) CreateGroup(ctx context.Context, in CreateGroupInput) (model.FieldGroup, error) {
	name := strings.TrimSpace(in.Name)
	if name == "" {
		return model.FieldGroup{}, i18n.Wrap(ErrGroupInvalid, i18n.KeyGroupNeedsName)
	}
	now := time.Now().UTC()
	g := model.FieldGroup{
		ID: store.NewID(), Name: name, FieldIDs: dedupeKeepingOrder(in.FieldIDs),
		CreatedAt: now, UpdatedAt: now,
	}
	err := s.db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO field_groups (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)`,
			g.ID, g.Name, store.FormatTime(now), store.FormatTime(now)); err != nil {
			return err
		}
		if err := replaceMembers(ctx, tx, g.ID, g.FieldIDs); err != nil {
			return err
		}
		if in.Empty() {
			return nil
		}
		return bindGroupTx(ctx, tx, in.GroupTargets, g)
	})
	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE constraint failed") {
			return g, i18n.Wrap(ErrGroupInvalid, i18n.KeyGroupDuplicate, name)
		}
		if strings.Contains(err.Error(), "FOREIGN KEY constraint failed") {
			return g, ErrNotFound
		}
		// A refused binding is written for a person and carries its own
		// catalogue key; wrapping it would hide that behind "create field
		// group:".
		if i18n.HasText(err) || errors.Is(err, ErrNotFound) {
			return g, err
		}
		return g, fmt.Errorf("create field group: %w", err)
	}
	return g, nil
}

// UpdateGroup renames a group, replaces its members, or both.
//
// Members are replaced wholesale rather than diffed: the row carries nothing
// but the pair, so there is no state a diff would preserve. Replacing them does
// not touch anything the group was already bound to -- the expansion left no
// trace to revisit (decision 105's accepted cost).
func (s *Store) UpdateGroup(ctx context.Context, id string, name *string, fieldIDs *[]string) (model.FieldGroup, error) {
	cur, err := s.GetGroup(ctx, id)
	if err != nil {
		return cur, err
	}
	if name != nil {
		trimmed := strings.TrimSpace(*name)
		if trimmed == "" {
			return cur, i18n.Wrap(ErrGroupInvalid, i18n.KeyGroupNeedsName)
		}
		cur.Name = trimmed
	}
	if fieldIDs != nil {
		cur.FieldIDs = dedupeKeepingOrder(*fieldIDs)
	}
	now := time.Now().UTC()
	err = s.db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		if _, err := tx.ExecContext(ctx,
			`UPDATE field_groups SET name = ?, updated_at = ? WHERE id = ?`,
			cur.Name, store.FormatTime(now), id); err != nil {
			return err
		}
		if fieldIDs == nil {
			return nil
		}
		return replaceMembers(ctx, tx, id, cur.FieldIDs)
	})
	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE constraint failed") {
			return cur, i18n.Wrap(ErrGroupInvalid, i18n.KeyGroupDuplicate, cur.Name)
		}
		if strings.Contains(err.Error(), "FOREIGN KEY constraint failed") {
			return cur, ErrNotFound
		}
		return cur, fmt.Errorf("update field group: %w", err)
	}
	cur.UpdatedAt = now
	return cur, nil
}

// dedupeKeepingOrder is dedupe without the sort.
//
// A group's members keep the order they were listed in: that order becomes the
// sort of the bindings the group writes, and it is the order somebody arranged
// the fields in on the form. dedupe sorts by id, which is the right answer for
// a set of category ids and the wrong one here.
func dedupeKeepingOrder(in []string) []string {
	seen := map[string]bool{}
	out := []string{}
	for _, v := range in {
		if v == "" || seen[v] {
			continue
		}
		seen[v] = true
		out = append(out, v)
	}
	return out
}

func replaceMembers(ctx context.Context, tx *sql.Tx, groupID string, fieldIDs []string) error {
	if _, err := tx.ExecContext(ctx,
		`DELETE FROM field_group_members WHERE group_id = ?`, groupID); err != nil {
		return err
	}
	for i, fieldID := range fieldIDs {
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO field_group_members (group_id, field_id, sort) VALUES (?, ?, ?)`,
			groupID, fieldID, (i+1)*10); err != nil {
			return err
		}
	}
	return nil
}

// DeleteGroup removes a group. Bindings it produced stay exactly as they are.
//
// There is nothing to undo: a bound group left no row saying where it came
// from, so "unbind the group" has no definition. The confirmation says so; the
// alternative -- keeping a record just so deletion could reverse it -- would
// make the group a structure, which is the thing decision 105 declined.
func (s *Store) DeleteGroup(ctx context.Context, id string) error {
	return s.db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		res, err := tx.ExecContext(ctx, `DELETE FROM field_groups WHERE id = ?`, id)
		if err != nil {
			return err
		}
		if n, _ := res.RowsAffected(); n == 0 {
			return ErrNotFound
		}
		return nil
	})
}

// BindGroup binds every field of a group to one target, all or nothing.
//
// Each member goes through the same check a single binding would, in one
// transaction: if any of them is refused, none of them is written and the
// refusal names the field and where it is stuck (016, decision 106). A group
// that lands half-way would be worse than one refused outright -- the person
// who bound it would have to work out which half.
func (s *Store) BindGroup(ctx context.Context, target BindTarget, targetID, groupID string) error {
	var t GroupTargets
	switch target {
	case BindToCategory:
		t.CategoryIDs = []string{targetID}
	case BindToModel:
		t.ModelIDs = []string{targetID}
	case BindToVendor:
		t.VendorIDs = []string{targetID}
	default:
		return fmt.Errorf("unknown bind target %q", target)
	}
	return s.BindGroupTo(ctx, groupID, t)
}

// BindGroupTo binds an existing group to any number of targets at once.
//
// One transaction over every (member, target) pair, so a refusal anywhere
// leaves nothing written -- the same promise the create makes, and the reason
// the ticks on the editor accumulate rather than firing one request each.
func (s *Store) BindGroupTo(ctx context.Context, groupID string, t GroupTargets) error {
	g, err := s.GetGroup(ctx, groupID)
	if err != nil {
		return err
	}
	if t.Empty() {
		return nil
	}
	return s.db.Write(ctx, func(ctx context.Context, tx *sql.Tx) error {
		return bindGroupTx(ctx, tx, t, g)
	})
}

// GroupTargets is where a group is being bound: the same three lists a field
// carries when it is created, and the same rule about them -- categories on one
// side, devices on the other, which each member enforces for itself.
//
// A group binds to many targets for the same reason a field does. It is a
// shorthand for binding its members, and binding a member to five categories
// was always allowed; there is nothing about wrapping them in a name that makes
// one target the limit.
type GroupTargets struct {
	CategoryIDs []string
	ModelIDs    []string
	VendorIDs   []string
}

// Empty reports whether nothing was asked for.
func (t GroupTargets) Empty() bool {
	return len(t.CategoryIDs)+len(t.ModelIDs)+len(t.VendorIDs) == 0
}

// bindGroupTx is BindGroup inside a transaction the caller owns, so creating a
// group and binding it can be one act (see CreateGroup).
//
// Every (member, target) pair goes through the check a single binding would,
// and one refusal rolls back the lot -- across targets as well as across
// members. Half of a "bind these five fields to these three categories" is a
// state whoever asked has to go and work out.
func bindGroupTx(ctx context.Context, tx *sql.Tx, t GroupTargets, g model.FieldGroup) error {
	for i, fieldID := range g.FieldIDs {
		sort := (i + 1) * 10
		for _, target := range []struct {
			ids  []string
			bind func(context.Context, *sql.Tx, string, string, int) error
		}{
			{t.CategoryIDs, bindTx},
			{t.ModelIDs, bindModelTx},
			{t.VendorIDs, bindVendorTx},
		} {
			for _, targetID := range target.ids {
				if err := target.bind(ctx, tx, targetID, fieldID, sort); err != nil {
					return groupBindError(ctx, tx, err, fieldID, g.Name)
				}
			}
		}
	}
	return nil
}

// groupBindError says which member of the group was refused and why.
//
// The underlying refusal is kept as the cause, so the HTTP layer still maps it
// to the right status; what is added is the part a person needs to act on --
// binding "网络参数" failed is not something anybody can fix without being told
// it was "mac" that was in the way.
func groupBindError(ctx context.Context, tx *sql.Tx, cause error, fieldID, groupName string) error {
	var label string
	if err := tx.QueryRowContext(ctx,
		`SELECT label FROM field_definitions WHERE id = ?`, fieldID).Scan(&label); err != nil {
		label = fieldID
	}
	return i18n.Wrap(cause, i18n.KeyGroupBindRefused, groupName, label, causeMessage(cause))
}

// causeMessage pulls the user-facing message out of an error so it can be an
// argument of another one, still unrendered. Passing cause.Error() here would
// pick the default language and paste Chinese into an English refusal.
func causeMessage(err error) any {
	for e := err; e != nil; e = errors.Unwrap(e) {
		if m, ok := e.(i18n.Message); ok {
			return m
		}
		if m, ok := e.(interface{ Msg() i18n.Message }); ok {
			return m.Msg()
		}
	}
	return ""
}
