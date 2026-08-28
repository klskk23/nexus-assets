package config

import (
	"bufio"
	"fmt"
	"io"
	"os"
	"strings"
)

// DefaultEnvFile is read from the working directory when present.
const DefaultEnvFile = ".env"

// EnvFileVar names an alternative file, for running several instances side by
// side without juggling working directories.
const EnvFileVar = "NEXUS_ENV_FILE"

// LoadEnvFile reads a .env file into the process environment.
//
// Values already present in the environment win. That ordering is what lets a
// container, a CI job or a one-off `NEXUS_ADDR=:9000 ./nexus` override the file
// without editing it -- the file is the default, not the authority.
//
// A missing file is not an error: the environment alone is a perfectly good way
// to configure the process, and that is what CI does.
func LoadEnvFile(path string) error {
	if path == "" {
		path = DefaultEnvFile
	}

	info, err := os.Stat(path)
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("read %s: %w", path, err)
	}

	// The file holds the JWT signing key and the bootstrap password. Anyone who
	// can read it can mint sessions, so a wide mode is worth saying out loud.
	if mode := info.Mode().Perm(); mode&0o077 != 0 {
		fmt.Fprintf(os.Stderr,
			"warning: %s is mode %04o and holds secrets; consider chmod 600 %s\n",
			path, mode, path)
	}

	f, err := os.Open(path)
	if err != nil {
		return fmt.Errorf("open %s: %w", path, err)
	}
	defer f.Close()

	vars, err := ParseEnvFile(f)
	if err != nil {
		return fmt.Errorf("%s: %w", path, err)
	}
	for k, v := range vars {
		if _, set := os.LookupEnv(k); set {
			continue
		}
		if err := os.Setenv(k, v); err != nil {
			return fmt.Errorf("set %s: %w", k, err)
		}
	}
	return nil
}

// ParseEnvFile reads KEY=value lines.
//
// Supported: blank lines, # comments, an optional `export` prefix, single or
// double quoted values, and escape sequences inside double quotes. An unquoted
// value stops at an inline comment, which is why a value containing a # has to
// be quoted.
func ParseEnvFile(r io.Reader) (map[string]string, error) {
	out := map[string]string{}
	sc := bufio.NewScanner(r)

	for line := 1; sc.Scan(); line++ {
		text := strings.TrimSpace(sc.Text())
		if text == "" || strings.HasPrefix(text, "#") {
			continue
		}
		text = strings.TrimPrefix(text, "export ")

		key, rawValue, found := strings.Cut(text, "=")
		if !found {
			return nil, fmt.Errorf("line %d: expected KEY=value, got %q", line, text)
		}
		key = strings.TrimSpace(key)
		if key == "" {
			return nil, fmt.Errorf("line %d: empty key", line)
		}

		value, err := parseValue(strings.TrimSpace(rawValue))
		if err != nil {
			return nil, fmt.Errorf("line %d: %w", line, err)
		}
		out[key] = value
	}
	if err := sc.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

func parseValue(raw string) (string, error) {
	if raw == "" {
		return "", nil
	}

	switch quote := raw[0]; quote {
	case '"', '\'':
		end := strings.LastIndexByte(raw, quote)
		if end == 0 {
			return "", fmt.Errorf("unterminated %c quote", quote)
		}
		inner := raw[1:end]
		if quote == '\'' {
			// Single quotes are literal, which is what a value full of
			// backslashes needs.
			return inner, nil
		}
		return strings.NewReplacer(
			`\n`, "\n", `\r`, "\r", `\t`, "\t", `\"`, `"`, `\\`, `\`,
		).Replace(inner), nil
	}

	// Unquoted: an inline comment ends the value.
	if i := strings.Index(raw, " #"); i >= 0 {
		raw = raw[:i]
	}
	return strings.TrimSpace(raw), nil
}
