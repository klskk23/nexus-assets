package store

import (
	"context"
	"database/sql"
	"fmt"
)

// Querier is the common read-only query surface shared by a database and a
// transaction. Schema loaders can therefore use one snapshot without knowing
// whether the caller is preparing a read or already owns a write transaction.
type Querier interface {
	QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error)
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
}

// Read runs fn against the read pool. Reads are concurrent; WAL keeps them from
// blocking on an in-flight write.
func (s *Store) Read(ctx context.Context, fn func(ctx context.Context, db *sql.DB) error) error {
	return fn(ctx, s.read)
}

// ReadTx runs fn in a single read transaction. The transaction gives all
// queries the same snapshot, while the *sql.Tx surface prevents callbacks from
// accidentally writing through the read pool.
func (s *Store) ReadTx(ctx context.Context, fn func(ctx context.Context, q Querier) error) error {
	tx, err := s.read.BeginTx(ctx, &sql.TxOptions{ReadOnly: true})
	if err != nil {
		return fmt.Errorf("begin read tx: %w", err)
	}
	if err := fn(ctx, tx); err != nil {
		if rbErr := tx.Rollback(); rbErr != nil && rbErr != sql.ErrTxDone {
			return fmt.Errorf("%w (rollback also failed: %v)", err, rbErr)
		}
		return err
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit read tx: %w", err)
	}
	return nil
}

// ReadDB exposes the read pool for query helpers that need *sql.DB directly.
func (s *Store) ReadDB() *sql.DB { return s.read }

// Write runs fn inside a single write transaction. The transaction is BEGIN
// IMMEDIATE (see dsn), so the exclusive lock is taken before fn runs any
// statement. That is what makes a SELECT-then-INSERT uniqueness check safe.
func (s *Store) Write(ctx context.Context, fn func(ctx context.Context, tx *sql.Tx) error) error {
	tx, err := s.write.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin write tx: %w", err)
	}
	if err := fn(ctx, tx); err != nil {
		if rbErr := tx.Rollback(); rbErr != nil && rbErr != sql.ErrTxDone {
			return fmt.Errorf("%w (rollback also failed: %v)", err, rbErr)
		}
		return err
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit write tx: %w", err)
	}
	return nil
}
