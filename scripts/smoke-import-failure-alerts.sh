#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${ROOT_DIR}/scripts/_test_server_env.sh"
source "${ROOT_DIR}/scripts/_smoke_restore.sh"

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

STAMP="$(date +%s)"
IMPORT_FILENAME="smoke-import-failure-${STAMP}.xlsx"
NOTIFICATION_TITLE="Import validation failed: ${IMPORT_FILENAME}"
WORKBOOK_PATH="$(mktemp --suffix=.xlsx)"
AUTH_JSON="$(mktemp)"
IMPORT_JSON="$(mktemp)"
NOTIFICATIONS_JSON="$(mktemp)"
METRICS_JSON="$(mktemp)"
ACCESS_TOKEN=""
IMPORT_ID=""

cleanup() {
  if [[ -n "${IMPORT_ID}" ]]; then
    docker exec "${SUPABASE_DB_CONTAINER}" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "
      delete from app.notifications where metadata ->> 'importId' = '${IMPORT_ID}';
      delete from app.quality_issues where import_job_id = '${IMPORT_ID}';
      delete from raw.vehicle_import_rows where import_job_id = '${IMPORT_ID}';
      delete from app.import_jobs where id = '${IMPORT_ID}';
    " >/dev/null
  fi

  rm -f "${WORKBOOK_PATH}" "${AUTH_JSON}" "${IMPORT_JSON}" "${NOTIFICATIONS_JSON}" "${METRICS_JSON}"
}

trap cleanup EXIT

node --input-type=module - "${WORKBOOK_PATH}" <<'NODE'
import XLSX from "xlsx";

const [, , workbookPath] = process.argv;
const workbook = XLSX.utils.book_new();
const rows = [
  [
    "BG DATE",
    "SHIPMENT ETD PKG",
    "DATE RECEIVED BY OUTLET",
    "REG DATE",
    "DELIVERY DATE",
    "DISB. DATE",
    "BRCH",
    "MODEL",
    "PAYMENT METHOD",
  ],
  [
    45748,
    45755,
    45767,
    45770,
    45774,
    45780,
    "KK",
    "ATIVA",
    "Loan",
  ],
];

const sheet = XLSX.utils.aoa_to_sheet(rows);
XLSX.utils.book_append_sheet(workbook, sheet, "Combine Data");
XLSX.writeFile(workbook, workbookPath);
NODE

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

curl -fsS -X POST "${API_URL}/imports" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -F "file=@${WORKBOOK_PATH};type=application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;filename=${IMPORT_FILENAME}" > "${IMPORT_JSON}"

IMPORT_ID="$(
  python3 - "${IMPORT_JSON}" <<'PY'
import json
import sys

with open(sys.argv[1], "r", encoding="utf-8") as handle:
    body = json.load(handle)

print(body["item"]["id"])
PY
)"

wait_for_import_validation "${API_URL}" "${ACCESS_TOKEN}" "${IMPORT_ID}" "${IMPORT_JSON}"

python3 - "${IMPORT_JSON}" <<'PY'
import json
import sys

with open(sys.argv[1], "r", encoding="utf-8") as handle:
    body = json.load(handle)

assert body["item"]["status"] == "failed", body
assert "chassis_no" in body["missingColumns"], body
PY

python3 - "${API_URL}" "${ACCESS_TOKEN}" "${NOTIFICATION_TITLE}" "${NOTIFICATIONS_JSON}" <<'PY'
import json
import subprocess
import sys
import time

api_url, token, title, out_path = sys.argv[1:5]
for _ in range(10):
    response = subprocess.run(
        ["curl", "-fsS", "-H", f"Authorization: Bearer {token}", f"{api_url}/notifications"],
        capture_output=True,
        text=True,
        check=True,
    )
    payload = json.loads(response.stdout)
    with open(out_path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle)

    for item in payload.get("items", []):
        if item.get("title") == title:
            assert item.get("type") in {"warning", "error"}, item
            assert item.get("read") is False, item
            raise SystemExit(0)

    time.sleep(1)

raise SystemExit(f"Notification {title!r} was not found")
PY

python3 - "${API_URL}" "${ACCESS_TOKEN}" "${METRICS_JSON}" <<'PY'
import json
import subprocess
import sys
import time

api_url, token, out_path = sys.argv[1:4]
for _ in range(10):
    response = subprocess.run(
        ["curl", "-fsS", "-H", f"Authorization: Bearer {token}", f"{api_url}/metrics/summary"],
        capture_output=True,
        text=True,
        check=True,
    )
    payload = json.loads(response.stdout)
    with open(out_path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle)

    if any(item.get("code") == "failed_import_jobs" for item in payload.get("operationalAlerts", [])):
        raise SystemExit(0)

    time.sleep(1)

raise SystemExit("Operational alert for failed import jobs was not found")
PY

echo "Smoke import failure alerting succeeded"
echo "Import ID: ${IMPORT_ID}"
echo "Notification title: ${NOTIFICATION_TITLE}"
