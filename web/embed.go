// Package web carries the built frontend, embedded into the binary.
package web

import "embed"

// Dist holds the Vite build output. The embed lives here rather than in
// cmd/nexus because Go forbids an embed pattern that reaches into a parent
// directory.
//
// web/dist/.gitkeep is committed so a clean checkout compiles before anyone has
// run the frontend build.
//
//go:embed all:dist
var Dist embed.FS
