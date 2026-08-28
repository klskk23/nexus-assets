package store

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"time"
)

// TimeFormat is the on-disk representation for every timestamp: RFC3339 in UTC.
//
// Nanosecond precision is not cosmetic. Transfer events are ordered by
// created_at, and at whole-second resolution two events written in the same
// second have no defined order -- which scrambles the timeline, the tail-event
// check and the replay inside verify. Queries additionally tie-break on rowid
// so the ordering is total even if two writes land on the same nanosecond.
const TimeFormat = time.RFC3339Nano

// FormatTime renders a timestamp for storage.
func FormatTime(t time.Time) string { return t.UTC().Format(TimeFormat) }

// ParseTime reads a stored timestamp. The RFC3339 layout also accepts the
// fractional seconds written by FormatTime.
func ParseTime(s string) (time.Time, error) {
	t, err := time.Parse(time.RFC3339, s)
	if err != nil {
		return time.Time{}, fmt.Errorf("parse timestamp %q: %w", s, err)
	}
	return t.UTC(), nil
}

// NullTime converts an optional timestamp for storage.
func NullTime(t *time.Time) any {
	if t == nil {
		return nil
	}
	return FormatTime(*t)
}

// ScanTime reads an optional timestamp column.
func ScanTime(ns sql.NullString) (*time.Time, error) {
	if !ns.Valid || ns.String == "" {
		return nil, nil
	}
	t, err := ParseTime(ns.String)
	if err != nil {
		return nil, err
	}
	return &t, nil
}

// NullString converts an optional string for storage.
func NullString(s *string) any {
	if s == nil || *s == "" {
		return nil
	}
	return *s
}

// StrPtr reads an optional string column.
func StrPtr(ns sql.NullString) *string {
	if !ns.Valid || ns.String == "" {
		return nil
	}
	v := ns.String
	return &v
}

// MarshalJSONMap serialises an attribute map for storage, never producing NULL.
func MarshalJSONMap(m map[string]any) (string, error) {
	if m == nil {
		return "{}", nil
	}
	b, err := json.Marshal(m)
	if err != nil {
		return "", fmt.Errorf("encode json column: %w", err)
	}
	return string(b), nil
}

// UnmarshalJSONMap reads a JSON column into a map.
func UnmarshalJSONMap(s string) (map[string]any, error) {
	if s == "" {
		return map[string]any{}, nil
	}
	var m map[string]any
	if err := json.Unmarshal([]byte(s), &m); err != nil {
		return nil, fmt.Errorf("decode json column: %w", err)
	}
	if m == nil {
		m = map[string]any{}
	}
	return m, nil
}
