package main

import (
	"context"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/klskk23/nexus-assets/internal/config"
	"github.com/klskk23/nexus-assets/internal/store"
)

func verifyCLIEnvironment(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	dbPath := filepath.Join(dir, "cli.db")
	for key, value := range map[string]string{
		config.EnvFileVar: filepath.Join(dir, "absent.env"), "NEXUS_DB_PATH": dbPath,
		"NEXUS_JWT_SECRET": "test-only-not-a-deployment-secret", "NEXUS_ALLOWED_EMAIL_DOMAINS": "example.com",
		"NEXUS_ADMIN_EMAIL": "admin@example.com", "NEXUS_ADMIN_PASSWORD": "test-password-only", "NEXUS_ADMIN_API_KEY": "",
		"NEXUS_JWT_TTL": "15m", "NEXUS_REFRESH_TTL": "720h", "NEXUS_OIDC_REQUIRE_HD": "true",
		"NEXUS_OIDC_ISSUER": "", "NEXUS_OIDC_CLIENT_ID": "", "NEXUS_OIDC_CLIENT_SECRET": "", "NEXUS_OIDC_REDIRECT_URL": "",
	} {
		t.Setenv(key, value)
	}
	return dbPath
}

// A real seed catches missing explicit child inheritance, while the subsequent
// CLI verify checks that production assembly and dispatch reach reconciliation.
func TestVerifyCLISeedReconciles(t *testing.T) {
	dbPath := verifyCLIEnvironment(t)
	if err := run([]string{"seed", "10"}); err != nil {
		t.Fatalf("seed command: %v", err)
	}
	if err := run([]string{"verify"}); err != nil {
		t.Fatalf("verify command: %v", err)
	}
	db, err := store.Open(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		if err := db.Close(); err != nil {
			t.Error(err)
		}
	}()
	var assets, events, claims, childCount int
	for query, dest := range map[string]*int{
		`SELECT count(*) FROM assets`:                                                                 &assets,
		`SELECT count(*) FROM asset_transfers WHERE kind='create'`:                                    &events,
		`SELECT count(*) FROM asset_unique_values WHERE archived_at IS NULL`:                          &claims,
		`SELECT count(*) FROM assets a JOIN categories c ON c.id=a.category_id WHERE c.code='SEEDRT'`: &childCount,
	} {
		if err := db.ReadDB().QueryRow(query).Scan(dest); err != nil {
			t.Fatal(err)
		}
	}
	if assets != 10 || events != 10 || claims != 20 || childCount != 4 {
		t.Fatalf("seed assets/events/claims/child=%d/%d/%d/%d", assets, events, claims, childCount)
	}
	if _, err := db.WriteDBForTest().Exec(`DELETE FROM asset_search_values`); err != nil {
		t.Fatal(err)
	}
	if err := run([]string{"verify"}); err == nil {
		t.Fatal("CLI verify swallowed index corruption")
	}
}

func TestVerifyCLIRejectsBadCommands(t *testing.T) {
	for _, tc := range []struct {
		name string
		args []string
		want string
	}{
		{"unknown", []string{"unknown"}, "unknown subcommand"},
		{"bad count", []string{"seed", "invalid"}, "seed count"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			verifyCLIEnvironment(t)
			if err := run(tc.args); err == nil || !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("command=%v", err)
			}
		})
	}
}

func TestVerifyCLIConfigurationFailure(t *testing.T) {
	verifyCLIEnvironment(t)
	t.Setenv("NEXUS_JWT_SECRET", "")
	if err := run([]string{"verify"}); err == nil {
		t.Fatal("verify opened with missing JWT configuration")
	}
}

// Version and healthcheck must not open, create or migrate a database.
func TestVerifyCLIHealthcheckWithoutDatabase(t *testing.T) {
	dbPath := verifyCLIEnvironment(t)
	t.Setenv("NEXUS_JWT_SECRET", "")
	calls := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if r.Method != "GET" || r.URL.Path != "/api/health" {
			t.Errorf("health request=%s %s", r.Method, r.URL.Path)
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()
	addr := strings.TrimPrefix(srv.URL, "http://")
	_, port, err := net.SplitHostPort(addr)
	if err != nil {
		t.Fatal(err)
	}
	for _, host := range []string{"", "0.0.0.0", "::", "127.0.0.1"} {
		if err := run([]string{"healthcheck", net.JoinHostPort(host, port)}); err != nil {
			t.Fatalf("host %q: %v", host, err)
		}
	}
	t.Setenv("NEXUS_ADDR", addr)
	if err := run([]string{"healthcheck"}); err != nil {
		t.Fatal(err)
	}
	if err := run([]string{"version"}); err != nil {
		t.Fatal(err)
	}
	if calls != 5 {
		t.Fatalf("health requests=%d", calls)
	}
	if _, err := os.Stat(dbPath); !os.IsNotExist(err) {
		t.Fatalf("read-only commands created database: %v", err)
	}
}

func TestVerifyCLIHealthcheckFailures(t *testing.T) {
	verifyCLIEnvironment(t)
	if err := run([]string{"healthcheck", "invalid"}); err == nil {
		t.Fatal("invalid health address accepted")
	}
	for _, scenario := range []string{"unavailable", "closed"} {
		t.Run(scenario, func(t *testing.T) {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusServiceUnavailable) }))
			defer srv.Close()
			if scenario == "closed" {
				srv.Close()
			}
			err := run([]string{"healthcheck", strings.TrimPrefix(srv.URL, "http://")})
			if err == nil || !strings.Contains(err.Error(), "health:") {
				t.Fatalf("unhealthy service=%v", err)
			}
		})
	}
}

func TestVerifyCLISeedFailureDoesNotHideStorageError(t *testing.T) {
	a, _, _ := newApp(t)
	verifyExec(t, a, `CREATE TRIGGER refuse_seed_location BEFORE INSERT ON holder_entities BEGIN SELECT RAISE(ABORT,'seed storage failure'); END`)
	if err := runSeed(context.Background(), a, 1); err == nil || !strings.Contains(err.Error(), "seed storage failure") {
		t.Fatalf("seed storage failure=%v", err)
	}
}
