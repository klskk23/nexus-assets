package main

import (
	"fmt"
	"net"
	"net/http"
	"os"
	"strings"
	"time"
)

// runHealthcheck asks the running server whether it is well, and says so
// through the exit status.
//
// It exists because the deployment image has no shell and no curl -- a static
// binary on `scratch` is the whole filesystem -- so the container's own health
// check has to be something already in the image. This binary is.
//
// It deliberately runs before setup(): opening the database and running
// migrations every thirty seconds, in a second process, is not a health check
// but a second writer.
func runHealthcheck(args []string) error {
	addr := os.Getenv("NEXUS_ADDR")
	if addr == "" {
		addr = ":8080"
	}
	if len(args) > 0 {
		addr = args[0]
	}
	// A listen address may name no host at all (":8080") or all of them
	// ("0.0.0.0:8080"); neither is somewhere to send a request.
	host, port, err := net.SplitHostPort(addr)
	if err != nil {
		return fmt.Errorf("NEXUS_ADDR %q: %w", addr, err)
	}
	if host == "" || host == "0.0.0.0" || host == "::" {
		host = "127.0.0.1"
	}

	url := fmt.Sprintf("http://%s/api/health", net.JoinHostPort(host, port))
	client := &http.Client{Timeout: 3 * time.Second}
	res, err := client.Get(url)
	if err != nil {
		return fmt.Errorf("health: %w", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("health: %s answered %s", url, strings.TrimSpace(res.Status))
	}
	return nil
}
