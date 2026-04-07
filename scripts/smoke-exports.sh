#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${ROOT_DIR}/scripts/_test_server_env.sh"

API_URL="${SMOKE_API_URL:-http://127.0.0.1:${API_PORT}/v1}"
SUPABASE_AUTH_URL="${SMOKE_SUPABASE_AUTH_URL:-http://127.0.0.1:${SUPABASE_API_PORT}/auth/v1}"
SUPABASE_DB_CONTAINER="${SUPABASE_DB_CONTAINER:-supabase_db_flcbi}"
ADMIN_EMAIL="${SMOKE_ADMIN_EMAIL:-${BOOTSTRAP_ADMIN_EMAIL}}"
ADMIN_PASSWORD="${SMOKE_ADMIN_PASSWORD:-${BOOTSTRAP_ADMIN_PASSWORD:-}}"
ANON_KEY="${VITE_SUPABASE_ANON_KEY:-${SUPABASE_ANON_KEY:-}}"

if [[ -z "${ADMIN_PASSWORD}" ]]; then
  echo "Missing bootstrap admin password in environment." >&2
  exit 1
fi

if [[ -z "${ANON_KEY}" ]]; then
  echo "Missing Supabase anon key in environment." >&2
  exit 1
fi

AUTH_JSON="$(mktemp)"
CREATE_JSON="$(mktemp)"
EXPORTS_JSON="$(mktemp)"
DOWNLOAD_PATH="$(mktemp --suffix=.csv)"
EXPORT_ID=""
ACCESS_TOKEN=""

cleanup() {
  if [[ -n "${EXPORT_ID}" ]]; then
    docker exec "${SUPABASE_DB_CONTAINER}" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "
      delete from app.notifications where metadata ->> 'exportId' = '${EXPORT_ID}';
      delete from app.export_jobs where id = '${EXPORT_ID}';
    " >/dev/null
  fi

  rm -f "${AUTH_JSON}" "${CREATE_JSON}" "${EXPORTS_JSON}" "${DOWNLOAD_PATH}"
}

trap cleanup EXIT

curl -fsS -X POST "${SUPABASE_AUTH_URL}/token?grant_type=password" \
  -H "apikey: ${ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${ADMIN_EMAIL}\",\"password\":\"${ADMIN_PASSWORD}\"}" > "${AUTH_JSON}"

ACCESS_TOKEN="$(
  python3 - "${AUTH_JSON}" <<'PY'
import json
import sys

with open(sys.argv[1], "r", encoding="utf-8") as handle:
    body = json.load(handle)

print(body["access_token"])
PY
)"

curl -fsS -X POST "${API_URL}/exports" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"query":{"search":"","branch":"all","model":"all","payment":"all","page":1,"pageSize":50,"sortField":"bg_date","sortDirection":"desc"}}' > "${CREATE_JSON}"

EXPORT_ID="$(
  python3 - "${CREATE_JSON}" <<'PY'
import json
import sys

with open(sys.argv[1], "r", encoding="utf-8") as handle:
    body = json.load(handle)

print(body["item"]["id"])
PY
)"

python3 - "${API_URL}" "${ACCESS_TOKEN}" "${EXPORT_ID}" "${EXPORTS_JSON}" <<'PY'
import json
import subprocess
import sys
import time

api_url, token, export_id, out_path = sys.argv[1:5]
deadline = time.time() + 30

while time.time() < deadline:
    response = subprocess.run(
        ["curl", "-fsS", "-H", f"Authorization: Bearer {token}", f"{api_url}/exports"],
        capture_output=True,
        text=True,
        check=True,
    )
    payload = json.loads(response.stdout)
    with open(out_path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle)

    for item in payload.get("items", []):
        if item.get("id") != export_id:
            continue
        status = item.get("status")
        if status == "completed":
            if item.get("totalRows", 0) <= 0:
                raise SystemExit(f"Export {export_id} completed without rows: {item}")
            raise SystemExit(0)
        if status == "failed":
            raise SystemExit(f"Export {export_id} failed: {item.get('errorMessage')}")
    time.sleep(1)

raise SystemExit(f"Export {export_id} did not complete in time")
PY

curl -fsS "${API_URL}/exports/${EXPORT_ID}/download" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" > "${DOWNLOAD_PATH}"

python3 - "${DOWNLOAD_PATH}" <<'PY'
import csv
import sys

with open(sys.argv[1], "r", encoding="utf-8") as handle:
    rows = list(csv.reader(handle))

assert len(rows) >= 2, rows
assert rows[0][0] == "Chassis No", rows[0]

print("Smoke export succeeded")
print(f"Header columns: {len(rows[0])}")
print(f"Exported rows: {len(rows) - 1}")
PY
