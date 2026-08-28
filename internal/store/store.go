// Package store owns the SQLite connection pools and transaction helpers.
//
// The database is opened twice against the same file:
//
//   - a write pool limited to a single connection, with _txlock=immediate so
//     every transaction takes the exclusive lock at BEGIN;
//   - a read pool with unrestricted concurrency.
//
// The split is not an optimisation. The constitution fixes the write pool at
// one connection because application-level uniqueness checks rely on writes
// being serialised. Sharing that single pool with reads would serialise reads
// too and put the list-page latency target out of reach, so WAL plus two pools
// is the only shape that satisfies both.
package store

import (
	"database/sql"
	"fmt"

	_ "modernc.org/sqlite" // pure-Go driver, no CGO
)

// Store holds the read and write pools. Callers never touch *sql.DB directly;
// they go through Read and Write so nobody can accidentally write on the read
// pool.
type Store struct {
	read  *sql.DB
	write *sql.DB
	path  string
}

const (
	busyTimeoutMS = 5000
	journalMode   = "wal"
)

// Open prepares both pools and asserts that the pragmas actually took effect.
func Open(path string) (*Store, error) {
	return open(path, busyTimeoutMS)
}

func open(path string, busyMS int) (*Store, error) {
	return openWith("sqlite", path, busyMS)
}

func openWith(driverName, path string, busyMS int) (*Store, error) {
	write, err := sql.Open(driverName, dsn(path, busyMS, true))
	if err != nil {
		return nil, fmt.Errorf("open write pool: %w", err)
	}
	// Constitution: the write pool is exactly one connection.
	write.SetMaxOpenConns(1)

	read, err := sql.Open(driverName, dsn(path, busyMS, false))
	if err != nil {
		_ = write.Close()
		return nil, fmt.Errorf("open read pool: %w", err)
	}

	s := &Store{read: read, write: write, path: path}

	for name, db := range map[string]*sql.DB{"write": write, "read": read} {
		if err := assertPragmas(db, busyMS); err != nil {
			_ = s.Close()
			return nil, fmt.Errorf("%s pool: %w", name, err)
		}
	}
	return s, nil
}

// dsn builds a connection string for modernc.org/sqlite.
//
// The _pragma=name(value) form is specific to this driver; mattn/go-sqlite3
// uses _journal_mode=WAL instead. Getting it wrong produces no error at all,
// the pragma is simply ignored, which is why assertPragmas reads the values
// back rather than trusting the string.
func dsn(path string, busyMS int, immediate bool) string {
	s := fmt.Sprintf(
		"file:%s?_pragma=journal_mode(WAL)&_pragma=busy_timeout(%d)&_pragma=foreign_keys(1)",
		path, busyMS,
	)
	if immediate {
		s += "&_txlock=immediate"
	}
	return s
}

// Close releases both pools.
func (s *Store) Close() error {
	var first error
	if s.write != nil {
		if err := s.write.Close(); err != nil {
			first = err
		}
	}
	if s.read != nil {
		if err := s.read.Close(); err != nil && first == nil {
			first = err
		}
	}
	return first
}

// Path returns the database file path.
func (s *Store) Path() string { return s.path }

// WriteDBForTest exposes the write pool so tests can seed rows directly.
// Production code goes through Write, which wraps every change in a
// transaction.
func (s *Store) WriteDBForTest() *sql.DB { return s.write }
