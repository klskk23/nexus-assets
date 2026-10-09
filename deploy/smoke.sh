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
# Python's standard library checks nested JSON without depending on key order.
command -v python3 >/dev/null || { printf 'python3 is required for JSON smoke checks\n' >&2; exit 1; }
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

# Keep response bodies for structural checks, including expected non-2xx replies.
category_request() {
  local expected="$1" method="$2" path="$3" body="$4" status
  local -a headers=(-H 'Content-Type: application/json') payload=()
  if [[ -n "$body" ]]; then
    payload=(-d "$body")
  fi
  if [[ "${5:-authenticated}" != anonymous ]]; then
    headers+=(-H "Authorization: Bearer $TOKEN")
  fi
  status=$(curl -sS -o "$DATA/category-response.json" -w '%{http_code}' \
    -X "$method" "http://127.0.0.1:$PORT/api/$path" "${headers[@]}" "${payload[@]}")
  if [[ "$status" != "$expected" ]]; then
    printf '%s %s: expected %s, got %s\n' "$method" "$path" "$expected" "$status" >&2
    return 1
  fi
}

category_json() {
  python3 - "$DATA/category-response.json" "$@" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as response:
    data = json.load(response)
mode, *args = sys.argv[2:]

def text(value):
    assert isinstance(value, str) and value

def page(value, limit, total):
    assert isinstance(value["items"], list)
    assert value["total"] == total and value["offset"] == 0 and value["limit"] == limit
    assert len(value["items"]) == min(total, limit)

if mode == "error":
    error = data["error"]
    assert error["code"] == args[0]
    text(error["message"])
    if len(args) > 1:
        text(error["fields"][args[1]])
elif mode == "id":
    text(data["id"])
    print(data["id"])
elif mode == "category":
    text(data["id"])
    assert data["code"] == "SMOKE_CHILD" and data["name"] == "Smoke Child"
    assert data["parent_id"] == args[0] and data["display_key"] == ""
    assert data["print_preset_ids"] == ["smoke-label"]
    text(data["path"])
    text(data["created_at"])
    text(data["updated_at"])
    print(data["id"])
elif mode == "withdrawal":
    category, field = args
    assert data["category"]["id"] == category and data["fields"] == []
    assert data["inheritance"]["selected_field_ids"] == []
    impact = data["impact"]
    page(impact, 2, 1)
    assert impact["removed_count"] == impact["category_count"] == 1
    assert impact["added_count"] == impact["source_changed_count"] == impact["asset_count"] == 0
    assert impact["items"][0]["field_id"] == field and impact["items"][0]["change"] == "removed"
    page(data["issues"], 3, 0)
    assert data["requires_confirmation"] is True
    text(data["confirmation_token"])
    print(data["confirmation_token"])
elif mode == "count":
    assert data == {"count": int(args[0])}
elif mode == "schema":
    category, field, selected = args
    assert data["category"]["id"] == category
    assert [item["id"] for item in data["fields"]] == ([field] if selected == "yes" else [])
elif mode == "unbind":
    parent, child, field = args
    assert data["category"]["id"] == parent and data["fields"] == []
    inheritance = data["inheritance"]
    assert inheritance["parent_id"] is None and inheritance["selected_field_ids"] == []
    page(inheritance["candidates"], 1, 0)
    impact = data["impact"]
    page(impact, 2, 2)
    assert impact["removed_count"] == impact["category_count"] == 2
    assert impact["added_count"] == impact["source_changed_count"] == 0
    assert impact["asset_count"] == 1
    assert {item["category_id"] for item in impact["items"]} == {parent, child}
    assert all(item["field_id"] == field and item["change"] == "removed" for item in impact["items"])
    page(data["issues"], 3, 0)
    assert data["requires_confirmation"] is True
    text(data["confirmation_token"])
    print(data["confirmation_token"])
elif mode == "preview":
    parent, field, selected, issue, target = args
    selected = selected == "yes"
    issue = issue == "yes"
    category = data["category"]
    text(category["id"])
    if target:
        assert category["id"] == target
    assert category["parent_id"] == parent
    assert category["print_preset_ids"] == ["smoke-label"]
    inheritance = data["inheritance"]
    assert inheritance["parent_id"] == parent
    assert inheritance["selected_field_ids"] == ([field] if selected else [])
    page(inheritance["candidates"], 1, 1)
    candidate = inheritance["candidates"]["items"][0]
    assert candidate["field"]["id"] == field and candidate["field"]["key"] == "smoke_inherited"
    assert candidate["source_category_id"] == parent and candidate["selected"] is selected
    assert isinstance(data["fields"], list) and len(data["fields"]) == int(selected)
    impact = data["impact"]
    page(impact, 2, int(selected))
    assert impact["added_count"] == int(selected) and impact["category_count"] == int(selected)
    assert impact["removed_count"] == impact["source_changed_count"] == impact["asset_count"] == 0
    if selected:
        assert data["fields"][0]["id"] == field and data["fields"][0]["inherited_from"] == parent
        delta = impact["items"][0]
        assert delta["category_id"] == category["id"] and delta["field_id"] == field
        assert delta["key"] == "smoke_inherited" and delta["change"] == "added"
        assert delta["after_source_category_id"] == parent
    page(data["issues"], 3, int(issue))
    if issue:
        problem = data["issues"]["items"][0]
        assert problem["code"] == "display_key_unbound" and problem["field_key"] == "missing"
        assert problem["category_id"] == category["id"]
        text(problem["message"])
    assert data["requires_confirmation"] is False and data["confirmation_token"] == ""
else:
    raise AssertionError("unknown JSON check")
PY
}

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

# Only the disposable container database is changed. A parent with a real field
# distinguishes an empty inheritance choice from a fixture with no candidates.
say "category creation preserves print presets and an empty selection"
category_request 201 POST categories '{"code":"SMOKE_PARENT","name":"Smoke Parent"}'
PARENT=$(category_json id)
category_request 201 POST fields \
  "{\"key\":\"smoke_inherited\",\"label\":\"Smoke inherited\",\"type\":\"text\",\"category_ids\":[\"$PARENT\"]}"
FIELD=$(category_json id)
category_request 201 POST categories \
  "{\"code\":\"SMOKE_CHILD\",\"name\":\"Smoke Child\",\"parent_id\":\"$PARENT\",\"print_preset_ids\":[\"smoke-label\"],\"inherited_field_ids\":[]}"
CHILD=$(category_json category "$PARENT")
PAGING='candidates_limit=1&impact_limit=2&issues_limit=3'

say "both preview routes enforce authentication and return structured errors"
for route in categories/preview "categories/$CHILD/preview"; do
  category_request 401 POST "$route" '{}' anonymous
  category_json error unauthenticated
  category_request 400 POST "$route" '{"inherited_field_ids":null}'
  category_json error validation_failed inherited_field_ids
  category_request 404 POST "$route" '{"parent_id":"no-such-category"}'
  category_json error not_found
done
category_request 404 POST categories/no-such-category/preview '{}'
category_json error not_found

say "non-destructive previews return independent pages without confirmation tokens"
category_request 200 POST "categories/preview?$PAGING" \
  "{\"code\":\"SMOKE_DRAFT\",\"name\":\"Smoke Draft\",\"parent_id\":\"$PARENT\",\"print_preset_ids\":[\"smoke-label\"],\"inherited_field_ids\":[\"$FIELD\"]}"
category_json preview "$PARENT" "$FIELD" yes no ''
category_request 200 POST "categories/$CHILD/preview?$PAGING" '{}'
category_json preview "$PARENT" "$FIELD" no no "$CHILD"

# A syntactically valid but unusable numbering field is an issue, not a failed
# preview. Saving it is rejected; a later empty draft still reads the old state.
say "preview issues remain editable while invalid writes are rejected"
for route in categories/preview "categories/$CHILD/preview"; do
  category_request 200 POST "$route?$PAGING" \
    "{\"parent_id\":\"$PARENT\",\"print_preset_ids\":[\"smoke-label\"],\"display_key\":\"missing\"}"
  category_json preview "$PARENT" "$FIELD" no yes ''
done
category_request 422 PATCH "categories/$CHILD" '{"display_key":"missing"}'
category_json error validation_failed display_key
category_request 200 POST "categories/$CHILD/preview?$PAGING" '{}'
category_json preview "$PARENT" "$FIELD" no no "$CHILD"

# Even an asset-free withdrawal requires a server-signed confirmation. A changed
# draft or forged token cannot authorize it, and failed saves leave it unchanged.
say "withdrawals require a token bound to the exact draft"
category_request 201 POST categories \
  "{\"code\":\"SMOKE_SELECTED\",\"name\":\"Smoke Selected\",\"parent_id\":\"$PARENT\",\"inherited_field_ids\":[\"$FIELD\"]}"
SELECTED=$(category_json id)
category_request 200 POST "categories/$SELECTED/preview?$PAGING" '{"inherited_field_ids":[]}'
CONFIRMATION=$(category_json withdrawal "$SELECTED" "$FIELD")
category_request 409 PATCH "categories/$SELECTED" '{"inherited_field_ids":[]}'
category_json error confirmation_required
category_request 409 PATCH "categories/$SELECTED" '{"inherited_field_ids":[],"confirmation_token":"not-a-token"}'
category_json error impact_stale
category_request 409 PATCH "categories/$SELECTED" \
  "{\"name\":\"Changed draft\",\"inherited_field_ids\":[],\"confirmation_token\":\"$CONFIRMATION\"}"
category_json error impact_stale
category_request 200 GET "categories/$SELECTED/schema" ''
category_json schema "$SELECTED" "$FIELD" yes
category_request 200 PATCH "categories/$SELECTED" \
  "{\"inherited_field_ids\":[],\"confirmation_token\":\"$CONFIRMATION\"}"
category_request 200 GET "categories/$SELECTED/schema" ''
category_json schema "$SELECTED" "$FIELD" no

# Count a real asset, not merely an empty fixture; an unselected sibling must not
# enter the field's reach. All data stays in the disposable container database.
say "field asset-count follows actual selection and requires authentication"
category_request 401 GET "fields/$FIELD/asset-count" '' anonymous
category_json error unauthenticated
category_request 404 GET fields/no-such-field/asset-count ''
category_json error not_found
category_request 200 GET me ''
OWNER=$(category_json id)
category_request 201 POST holders '{"type":"location","name":"Smoke Stock"}'
STOCK=$(category_json id)
for category in "$SELECTED" "$CHILD"; do
  category_request 201 POST assets \
    "{\"category_id\":\"$category\",\"owner_id\":\"$OWNER\",\"holder_type\":\"entity\",\"holder_id\":\"$STOCK\",\"status\":\"in_stock\",\"attrs\":{}}"
done
category_request 200 GET "fields/$FIELD/asset-count" ''
category_json count 0
category_request 200 PATCH "categories/$SELECTED" "{\"inherited_field_ids\":[\"$FIELD\"]}"
category_request 200 GET "fields/$FIELD/asset-count" ''
category_json count 1

say "direct unbind previews and confirms downstream withdrawal"
UNBIND="categories/$PARENT/bindings/$FIELD"
category_request 401 POST "$UNBIND/unbind-preview" '{}' anonymous
category_json error unauthenticated
category_request 404 POST "categories/no-such-category/bindings/$FIELD/unbind-preview" '{}'
category_json error not_found
category_request 200 POST "$UNBIND/unbind-preview?$PAGING" '{}'
UNBIND_TOKEN=$(category_json unbind "$PARENT" "$SELECTED" "$FIELD")
category_request 409 DELETE "$UNBIND" ''
category_json error confirmation_required
category_request 409 DELETE "$UNBIND" '{"confirmation_token":"not-a-token"}'
category_json error impact_stale
# An edit token cannot be replayed as a direct-unbind token.
category_request 409 DELETE "$UNBIND" "{\"confirmation_token\":\"$CONFIRMATION\"}"
category_json error impact_stale
category_request 200 GET "fields/$FIELD/asset-count" ''
category_json count 1
category_request 204 DELETE "$UNBIND" "{\"confirmation_token\":\"$UNBIND_TOKEN\"}"
category_request 200 GET "categories/$SELECTED/schema" ''
category_json schema "$SELECTED" "$FIELD" no
category_request 200 GET "fields/$FIELD/asset-count" ''
category_json count 0

# These are the four schema_stale entry points. Exercise their authentication
# and deterministic refusal envelopes without timing a concurrent schema edit.
# The 409 itself and zero-write rollback are covered by the write-barrier tests
# TestAssetSaveSchemaStaleHTTP and TestImportSchemaStaleHTTP, not this smoke.
say "asset save and import entry points enforce authentication"
category_request 401 POST assets '{}' anonymous
category_json error unauthenticated
category_request 401 PATCH assets/no-such-asset '{}' anonymous
category_json error unauthenticated
for route in import/preview import/commit; do
  category_request 401 POST "$route" '{}' anonymous
  category_json error unauthenticated
done

say "asset save and singular import routes return structured validation errors"
category_request 400 POST assets '{'
category_json error validation_failed
# Supply the required write members so binding succeeds and the missing-version
# guard, rather than the generic malformed-request guard, is actually exercised.
category_request 400 PATCH assets/no-such-asset \
  "{\"category_id\":\"$SELECTED\",\"owner_id\":\"$OWNER\",\"holder_type\":\"entity\",\"holder_id\":\"$STOCK\"}"
category_json error validation_failed version
for route in import/preview import/commit; do
  category_request 400 POST "$route" '{}'
  category_json error validation_failed category_id
done
say "schema_stale 409 races are not exercised here; run the deterministic HTTP tests"

# The categories page puts one of these beside every node, and the overview
# reads the same map. A JSON object is what it must be -- an array here would
# render as blanks where the counts go, which reads as "not loaded".
say "the count endpoints answer as objects"
for ep in models/counts; do
  curl -fsS "http://127.0.0.1:$PORT/api/$ep" -H "Authorization: Bearer $TOKEN" | grep -q '^{'
done
say "category counts answer as an object"
curl -fsS "http://127.0.0.1:$PORT/api/categories/counts" -H "Authorization: Bearer $TOKEN" \
  | grep -q '^{' 

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

# Field bindings can hang on a model as well as a category (015). Asked for a
# model that does not exist, the endpoint must say so rather than 500 or
# silently accept -- which is also proof the route is in this binary at all.
say "binding a field to a missing model is refused"
test "$(curl -s -o /dev/null -w '%{http_code}' -X POST \
  "http://127.0.0.1:$PORT/api/models/no-such-model/bindings" -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"field_id":"no-such-field"}')" = 404

# The two binding modes are exclusive, and creating a field is a door into both
# (015, decision 96). Asking for both at once must be refused -- with no field
# left behind, which the next line checks by key.
say "a field cannot be created bound to a category and a model at once"
test "$(curl -s -o /dev/null -w '%{http_code}' -X POST \
  "http://127.0.0.1:$PORT/api/fields" -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"key":"smoke_both","label":"both","type":"text","category_ids":["no-such-category"],"model_ids":["no-such-model"]}')" != 201
curl -fsS "http://127.0.0.1:$PORT/api/fields" -H "Authorization: Bearer $TOKEN" \
  | grep -qv smoke_both

# Vendors and field groups are their own collections (016). A round trip
# through the vendor endpoints proves those routes are in this binary, and that
# migration 019 built the tables they read.
say "a vendor can be created, listed and deleted"
VENDOR=$(curl -fsS -X POST "http://127.0.0.1:$PORT/api/vendors" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"Smoke Vendor"}' | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')
test -n "$VENDOR"
# The movement log is its own endpoint with its own permission -- the operations
# audit next to it reads a different table. Admin holds both, so this only
# proves the route is wired; the split itself is covered by the Go tests.
curl -fsS "http://127.0.0.1:$PORT/api/transfers?limit=1" -H "Authorization: Bearer $TOKEN" \
  | grep -q '"items"'

curl -fsS "http://127.0.0.1:$PORT/api/vendors" -H "Authorization: Bearer $TOKEN" \
  | grep -q 'Smoke Vendor'
curl -fsS "http://127.0.0.1:$PORT/api/vendors/$VENDOR/required-impact" \
  -H "Authorization: Bearer $TOKEN" | grep -q '"total"'
curl -fsS -X DELETE "http://127.0.0.1:$PORT/api/vendors/$VENDOR" \
  -H "Authorization: Bearer $TOKEN"

# A binding endpoint takes a field or a group, never both and never neither.
say "a binding request naming neither a field nor a group is refused"
test "$(curl -s -o /dev/null -w '%{http_code}' -X POST \
  "http://127.0.0.1:$PORT/api/categories/no-such-category/bindings" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{}')" = 400

say "a field group can be created and deleted"
GROUP=$(curl -fsS -X POST "http://127.0.0.1:$PORT/api/field-groups" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"Smoke Group"}' | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')
test -n "$GROUP"
curl -fsS -X DELETE "http://127.0.0.1:$PORT/api/field-groups/$GROUP" \
  -H "Authorization: Bearer $TOKEN"

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
