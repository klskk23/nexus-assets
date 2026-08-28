// Package migrations carries the SQL migration files embedded into the binary.
package migrations

import "embed"

// FS holds every migration. Keeping the embed in this package avoids an
// embed pattern that reaches into a parent directory, which Go forbids.
//
//go:embed *.sql
var FS embed.FS
