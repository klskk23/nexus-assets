package store

import (
	"database/sql"
	"fmt"
	"strings"
)

// assertPragmas reads the pragmas back from a live connection and fails when
// they do not hold.
//
// This exists because an unrecognised DSN parameter is silently ignored by the
// driver. Without a read-back a typo in the pragma syntax leaves the database
// in rollback-journal mode with no busy timeout, and the program starts and
// runs normally until concurrency problems appear much later.
func assertPragmas(db *sql.DB, wantBusyMS int) error {
	var mode string
	if err := db.QueryRow("PRAGMA journal_mode").Scan(&mode); err != nil {
		return fmt.Errorf("read journal_mode: %w", err)
	}
	if !strings.EqualFold(mode, journalMode) {
		return fmt.Errorf("journal_mode is %q, want %q: check the DSN _pragma syntax", mode, journalMode)
	}

	var busy int
	if err := db.QueryRow("PRAGMA busy_timeout").Scan(&busy); err != nil {
		return fmt.Errorf("read busy_timeout: %w", err)
	}
	if busy != wantBusyMS {
		return fmt.Errorf("busy_timeout is %d, want %d: check the DSN _pragma syntax", busy, wantBusyMS)
	}

	var fk int
	if err := db.QueryRow("PRAGMA foreign_keys").Scan(&fk); err != nil {
		return fmt.Errorf("read foreign_keys: %w", err)
	}
	if fk != 1 {
		return fmt.Errorf("foreign_keys is %d, want 1", fk)
	}
	return nil
}
