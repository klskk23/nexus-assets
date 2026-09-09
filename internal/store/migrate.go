package store

import (
	"context"
	"fmt"

	"github.com/pressly/goose/v3"

	"github.com/klskk23/nexus-assets/migrations"
)

// Migrate brings the database up to the latest revision. Migrations travel
// inside the binary, so deployment stays a single executable plus a database
// file.
func (s *Store) Migrate(ctx context.Context) error {
	goose.SetBaseFS(migrations.FS)
	goose.SetLogger(goose.NopLogger())
	if err := goose.SetDialect("sqlite3"); err != nil {
		return fmt.Errorf("set goose dialect: %w", err)
	}
	// Migrations write, so they run on the single-connection write pool.
	if err := goose.UpContext(ctx, s.write, "."); err != nil {
		return fmt.Errorf("run migrations: %w", err)
	}
	return nil
}

// MigrateDown rolls back one revision. Used by tests only.
func (s *Store) MigrateDown(ctx context.Context) error {
	goose.SetBaseFS(migrations.FS)
	goose.SetLogger(goose.NopLogger())
	if err := goose.SetDialect("sqlite3"); err != nil {
		return err
	}
	return goose.DownContext(ctx, s.write, ".")
}

// MigrateDownTo rolls back until the schema is at the named version.
//
// Tests that need "the shape a deployment had before migration N" should name
// N rather than count steps down from the top. Counting has broken four times
// now: every new migration pushes the target one further away, and the failure
// reads as the migration under test having regressed rather than as the test
// having aimed one short.
func (s *Store) MigrateDownTo(ctx context.Context, version int64) error {
	goose.SetBaseFS(migrations.FS)
	goose.SetLogger(goose.NopLogger())
	if err := goose.SetDialect("sqlite3"); err != nil {
		return err
	}
	return goose.DownToContext(ctx, s.write, ".", version)
}
