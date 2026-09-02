package store

import (
	"database/sql"
	"path/filepath"
	"strings"
	"testing"
)

// TestPragmaReadBackCatchesSilentDefaults is the guard that motivates
// assertPragmas.
//
// Verified against modernc.org/sqlite v1.57.0: a connection string carrying no
// pragma parameters opens without any error and reports journal_mode=delete,
// busy_timeout=0 and foreign_keys=0. Nothing warns about it. A typo in the DSN
// therefore leaves the database in rollback-journal mode with no busy timeout,
// and the program runs normally until concurrency problems surface much later.
//
// Note: that driver version accepts both the _pragma=name(value) form and the
// mattn-style _journal_mode=WAL form, so a syntax mix-up is not itself the
// hazard. The hazard is any parameter that is missing or misspelled.
func TestPragmaReadBackCatchesSilentDefaults(t *testing.T) {
	cases := []struct {
		name string
		dsn  string
		want string
	}{
		{
			name: "no pragma parameters at all",
			dsn:  "",
			want: "journal_mode",
		},
		{
			name: "misspelled pragma value",
			dsn:  "?_pragma=journal_mode(WALL)&_pragma=busy_timeout(5000)&_pragma=foreign_keys(1)",
			want: "journal_mode",
		},
		{
			name: "busy_timeout omitted",
			dsn:  "?_pragma=journal_mode(WAL)&_pragma=foreign_keys(1)",
			want: "busy_timeout",
		},
		{
			name: "foreign_keys omitted",
			dsn:  "?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)",
			want: "foreign_keys",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "wrong.db")
			db, err := sql.Open("sqlite", "file:"+path+tc.dsn)
			if err != nil {
				// A misspelled pragma value may be rejected at connect time,
				// which is an acceptable outcome: it is not silent.
				t.Logf("driver rejected the DSN at open time: %v", err)
				return
			}
			defer func() { _ = db.Close() }()

			err = assertPragmas(db, busyTimeoutMS)
			if err == nil {
				t.Fatalf("expected the read-back to reject this DSN, got nil")
			}
			if !strings.Contains(err.Error(), tc.want) {
				t.Errorf("error should name %q, got: %v", tc.want, err)
			}
			t.Logf("correctly rejected: %v", err)
		})
	}
}

func TestOpenAppliesPragmas(t *testing.T) {
	path := filepath.Join(t.TempDir(), "ok.db")
	s, err := Open(path)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	defer func() { _ = s.Close() }()

	for name, db := range map[string]*sql.DB{"read": s.read, "write": s.write} {
		var mode string
		if err := db.QueryRow("PRAGMA journal_mode").Scan(&mode); err != nil {
			t.Fatalf("%s pool: %v", name, err)
		}
		if !strings.EqualFold(mode, "wal") {
			t.Errorf("%s pool journal_mode = %q, want wal", name, mode)
		}
	}
}
