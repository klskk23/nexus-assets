package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestParseEnvFile(t *testing.T) {
	got, err := ParseEnvFile(strings.NewReader(`
# A comment line
NEXUS_ADDR=:8080
export NEXUS_DB_PATH=./nexus.db

  NEXUS_SPACED  =  trimmed  
NEXUS_QUOTED="a value with spaces"
NEXUS_SINGLE='literal \n stays'
NEXUS_ESCAPED="line\nbreak"
NEXUS_HASH_IN_QUOTES="pa#ssword"
NEXUS_INLINE=value # trailing comment
NEXUS_EMPTY=
`))
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	want := map[string]string{
		"NEXUS_ADDR":           ":8080",
		"NEXUS_DB_PATH":        "./nexus.db",
		"NEXUS_SPACED":         "trimmed",
		"NEXUS_QUOTED":         "a value with spaces",
		"NEXUS_SINGLE":         `literal \n stays`,
		"NEXUS_ESCAPED":        "line\nbreak",
		"NEXUS_HASH_IN_QUOTES": "pa#ssword",
		"NEXUS_INLINE":         "value",
		"NEXUS_EMPTY":          "",
	}
	if len(got) != len(want) {
		t.Fatalf("got %d keys, want %d: %v", len(got), len(want), got)
	}
	for k, v := range want {
		if got[k] != v {
			t.Errorf("%s = %q, want %q", k, got[k], v)
		}
	}
}

func TestParseEnvFileRejectsMalformedLines(t *testing.T) {
	cases := map[string]string{
		"no equals sign": "NEXUS_ADDR :8080",
		"empty key":      "=value",
		"unterminated":   `NEXUS_SECRET="oops`,
	}
	for name, text := range cases {
		t.Run(name, func(t *testing.T) {
			if _, err := ParseEnvFile(strings.NewReader(text)); err == nil {
				t.Fatal("expected a parse error")
			}
		})
	}
}

func TestParseEnvFileReportsTheOffendingLine(t *testing.T) {
	_, err := ParseEnvFile(strings.NewReader("A=1\nB=2\nbroken line\n"))
	if err == nil {
		t.Fatal("expected an error")
	}
	if !strings.Contains(err.Error(), "line 3") {
		t.Errorf("the error should point at the line, got: %v", err)
	}
}

// A missing file is the normal case in CI, where everything comes from the
// environment.
func TestLoadEnvFileIgnoresAMissingFile(t *testing.T) {
	if err := LoadEnvFile(filepath.Join(t.TempDir(), "absent")); err != nil {
		t.Fatalf("a missing file must not be an error: %v", err)
	}
}

// The file is the default, not the authority: a container or a one-off
// override on the command line has to win, or the file could not be shared.
func TestExistingEnvironmentWinsOverTheFile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, ".env")
	if err := os.WriteFile(path, []byte("NEXUS_ADDR=:8080\nNEXUS_DB_PATH=./from-file.db\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	t.Setenv("NEXUS_ADDR", ":9999")
	_ = os.Unsetenv("NEXUS_DB_PATH")
	t.Cleanup(func() { _ = os.Unsetenv("NEXUS_DB_PATH") })

	if err := LoadEnvFile(path); err != nil {
		t.Fatalf("load: %v", err)
	}
	if got := os.Getenv("NEXUS_ADDR"); got != ":9999" {
		t.Errorf("the environment must win: NEXUS_ADDR = %q", got)
	}
	if got := os.Getenv("NEXUS_DB_PATH"); got != "./from-file.db" {
		t.Errorf("an unset variable should come from the file, got %q", got)
	}
}

func TestLoadEnvFileWarnsAboutWidePermissions(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, ".env")
	if err := os.WriteFile(path, []byte("NEXUS_JWT_SECRET=s3cret\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	_ = os.Unsetenv("NEXUS_JWT_SECRET")
	t.Cleanup(func() { _ = os.Unsetenv("NEXUS_JWT_SECRET") })

	// The warning goes to stderr rather than failing: a wide mode is worth
	// saying out loud but should not stop a developer working locally.
	if err := LoadEnvFile(path); err != nil {
		t.Fatalf("load: %v", err)
	}
	if os.Getenv("NEXUS_JWT_SECRET") != "s3cret" {
		t.Error("the value should still be loaded")
	}
}

// The whole point of the file: Load must find the settings without anything
// being exported first.
func TestLoadReadsConfigurationFromTheFile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "custom.env")
	body := "NEXUS_JWT_SECRET=file-secret\n" +
		"NEXUS_ALLOWED_EMAIL_DOMAINS=yourcompany.com\n" +
		"NEXUS_ADDR=:7777\n"
	if err := os.WriteFile(path, []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}

	for _, k := range []string{"NEXUS_JWT_SECRET", "NEXUS_ALLOWED_EMAIL_DOMAINS", "NEXUS_ADDR"} {
		_ = os.Unsetenv(k)
		t.Cleanup(func() { _ = os.Unsetenv(k) })
	}
	t.Setenv(EnvFileVar, path)

	c, err := Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if string(c.JWTSecret) != "file-secret" {
		t.Errorf("JWTSecret = %q", c.JWTSecret)
	}
	if c.Addr != ":7777" {
		t.Errorf("Addr = %q", c.Addr)
	}
	if !c.AllowsDomain("yourcompany.com") {
		t.Error("the domain list should come from the file")
	}
}

// A file that cannot be parsed must stop the process rather than start it with
// half its settings missing.
func TestLoadFailsOnAMalformedFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "bad.env")
	if err := os.WriteFile(path, []byte("this is not a setting\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	t.Setenv(EnvFileVar, path)
	if _, err := Load(); err == nil {
		t.Fatal("a malformed file must fail the start")
	}
}
