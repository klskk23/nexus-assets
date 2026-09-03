#!/usr/bin/env bash
#
# Start the image, prove it serves, restart it, prove it still serves.
#
#   bash deploy/smoke.sh nexus-assets:smoke
#
# What this catches that a green test suite cannot: a frontend that was never
# embedded, a binary that needs a libc the runtime stage does not have, a
# database that cannot be created in the mounted directory, and state that does
# not survive a restart. Every one of those has a passing unit test behind it.
set -euo pipefail

IMAGE="${1:-nexus-assets:smoke}"
NAME="nexus-smoke-$$"
PORT="${PORT:-18080}"
DATA="$(mktemp -d)"

cleanup() {
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  rm -rf "$DATA"
}
trap cleanup EXIT

# The secret is a throwaway, and the admin password with it. Both are required:
# the process refuses to start without a signing key rather than inventing one
# that changes on every restart.
run() {
  docker run -d --name "$NAME" \
    -p "127.0.0.1:$PORT:8080" \
    -v "$DATA:/data" \
    -e NEXUS_JWT_SECRET=smoke-test-secret-not-for-any-real-deployment \
    -e NEXUS_ADMIN_EMAIL=admin@example.com \
    -e NEXUS_ADMIN_PASSWORD=smoke-test-password \
    -e NEXUS_ALLOWED_EMAIL_DOMAINS=example.com \
    "$IMAGE" >/dev/null
}

wait_healthy() {
  for _ in $(seq 1 60); do
    case "$(docker inspect -f '{{.State.Health.Status}}' "$NAME" 2>/dev/null || echo starting)" in
      healthy) return 0 ;;
      unhealthy) break ;;
    esac
    sleep 1
  done
  echo "container never became healthy:"
  docker logs "$NAME" 2>&1 | tail -30
  return 1
}

say() { printf '\n== %s\n' "$1"; }

say "starting $IMAGE"
run
wait_healthy

# The health endpoint is what the container's own check reads; asking it from
# outside as well proves the port mapping, not just the process.
say "health"
curl -fsS "http://127.0.0.1:$PORT/api/health" | tee /dev/stderr | grep -q '"status":"ok"'

# The frontend is embedded in the binary. If the web stage was skipped this is
# where it shows: the API would be perfectly fine and the page blank.
say "the interface is served"
curl -fsS "http://127.0.0.1:$PORT/" | grep -qi '<div id="root"'

# A client-side route must fall back to index.html, or a refresh anywhere but
# the root is a 404.
say "a deep link falls back to the app"
curl -fsS "http://127.0.0.1:$PORT/assets" | grep -qi '<div id="root"'

# Signing in exercises the database: bootstrap wrote the admin account during
# start-up, and this reads it back through a real write transaction.
say "signing in"
TOKEN="$(curl -fsS -X POST "http://127.0.0.1:$PORT/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"smoke-test-password"}' \
  | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')"
test -n "$TOKEN"

say "an authenticated request"
curl -fsS "http://127.0.0.1:$PORT/api/categories" -H "Authorization: Bearer $TOKEN" >/dev/null

# Printing is off unless an address is configured, and the interface asks this
# endpoint whether to show anything printing-related at all. A deployment that
# answered "true" here with no service behind it would put dead buttons on the
# asset page.
say "printing is absent without a print service"
curl -fsS "http://127.0.0.1:$PORT/api/capabilities" -H "Authorization: Bearer $TOKEN" \
  | tee /dev/stderr | grep -q '"printing":false'
test "$(curl -s -o /dev/null -w '%{http_code}' -X POST \
  "http://127.0.0.1:$PORT/api/print/refresh-source" -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"category_id":"x"}')" = 404

# Migrations ran once on a fresh directory; now they have to be a no-op against
# a database that already has them, and the account has to still be there.
say "restarting"
docker restart "$NAME" >/dev/null
wait_healthy
curl -fsS -X POST "http://127.0.0.1:$PORT/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"smoke-test-password"}' \
  | grep -q '"token"'

# State belongs to the host directory, not to the container's own layer.
say "the database is on the mounted directory"
test -f "$DATA/nexus.db"

printf '\nsmoke passed: %s\n' "$IMAGE"
