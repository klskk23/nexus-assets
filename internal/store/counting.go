package store

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"sync/atomic"
)

// queryCount is incremented by every statement the counting driver executes.
var queryCount atomic.Int64

// CountingDriverName is a drop-in replacement for the sqlite driver that counts
// statements. It exists so a test can assert that rendering a page of assets
// costs a constant number of queries no matter how many rows come back --
// the N+1 guard the constitution asks for is otherwise unfalsifiable.
const CountingDriverName = "sqlite-counting"

func init() {
	// The registered sqlite driver is only reachable through a *sql.DB.
	probe, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		return
	}
	inner := probe.Driver()
	_ = probe.Close()
	sql.Register(CountingDriverName, &countingDriver{inner: inner})
}

// ResetQueryCount zeroes the counter and returns a function reporting how many
// statements ran since.
func ResetQueryCount() func() int {
	queryCount.Store(0)
	return func() int { return int(queryCount.Load()) }
}

type countingDriver struct{ inner driver.Driver }

func (d *countingDriver) Open(name string) (driver.Conn, error) {
	c, err := d.inner.Open(name)
	if err != nil {
		return nil, err
	}
	return &countingConn{inner: c}, nil
}

type countingConn struct{ inner driver.Conn }

func (c *countingConn) Prepare(q string) (driver.Stmt, error) { return c.inner.Prepare(q) }
func (c *countingConn) Close() error                          { return c.inner.Close() }
func (c *countingConn) Begin() (driver.Tx, error)             { return c.inner.Begin() } //nolint:staticcheck

func (c *countingConn) BeginTx(ctx context.Context, opts driver.TxOptions) (driver.Tx, error) {
	if b, ok := c.inner.(driver.ConnBeginTx); ok {
		return b.BeginTx(ctx, opts)
	}
	return c.inner.Begin() //nolint:staticcheck
}

func (c *countingConn) QueryContext(ctx context.Context, q string, args []driver.NamedValue) (driver.Rows, error) {
	qr, ok := c.inner.(driver.QueryerContext)
	if !ok {
		return nil, driver.ErrSkip
	}
	queryCount.Add(1)
	return qr.QueryContext(ctx, q, args)
}

func (c *countingConn) ExecContext(ctx context.Context, q string, args []driver.NamedValue) (driver.Result, error) {
	ex, ok := c.inner.(driver.ExecerContext)
	if !ok {
		return nil, driver.ErrSkip
	}
	queryCount.Add(1)
	return ex.ExecContext(ctx, q, args)
}

func (c *countingConn) PrepareContext(ctx context.Context, q string) (driver.Stmt, error) {
	if p, ok := c.inner.(driver.ConnPrepareContext); ok {
		return p.PrepareContext(ctx, q)
	}
	return c.inner.Prepare(q)
}

// OpenCounting opens a store whose statements are counted. Test use only.
func OpenCounting(path string) (*Store, error) {
	return openWith(CountingDriverName, path, busyTimeoutMS)
}
