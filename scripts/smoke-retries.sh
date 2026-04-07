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
PREFIX="RETRY-${STAMP}"
WORKBOOK_PATH="$(mktemp --suffix=.xlsx)"
AUTH_JSON="$(mktemp)"
IMPORT_JSON="$(mktemp)"
PUBLISH_JSON="$(mktemp)"
EXPORT_CREATE_JSON="$(mktemp)"
EXPORT_RETRY_JSON="$(mktemp)"
EXPORT_DOWNLOAD_PATH="$(mktemp --suffix=.csv)"
RESTORE_WORKBOOK="$(mktemp --suffix=.xlsx)"
RESTORE_READY=false
ACCESS_TOKEN=""
IMPORT_ID=""
EXPORT_ID=""

if snapshot_active_dataset_workbook "${RESTORE_WORKBOOK}" "${SUPABASE_DB_CONTAINER}"; then
  RESTORE_READY=true
else
  RESTORE_WORKBOOK=""
fi

cleanup() {
  if [[ "${RESTORE_READY}" == "true" && -n "${ACCESS_TOKEN}" ]]; then
    restore_dataset_from_workbook "${API_URL}" "${ACCESS_TOKEN}" "${RESTORE_WORKBOOK}" "smoke-retries-restore.xlsx" "replace" >/dev/null
  fi

  if [[ -n "${EXPORT_ID}" ]]; then
    docker exec "${SUPABASE_DB_CONTAINER}" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "
      delete from app.notifications where metadata ->> 'exportId' = '${EXPORT_ID}';
      delete from app.export_jobs where id = '${EXPORT_ID}';
    " >/dev/null
  fi

  if [[ -n "${IMPORT_ID}" ]]; then
    docker exec "${SUPABASE_DB_CONTAINER}" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "
      delete from app.notifications where metadata ->> 'importId' = '${IMPORT_ID}';
      delete from app.vehicle_records where import_job_id = '${IMPORT_ID}';
      delete from app.quality_issues where import_job_id = '${IMPORT_ID}';
      delete from raw.vehicle_import_rows where import_job_id = '${IMPORT_ID}';
      delete from app.dataset_versions where import_job_id = '${IMPORT_ID}';
      delete from app.import_jobs where id = '${IMPORT_ID}';
    " >/dev/null
  fi

  rm -f \
    "${WORKBOOK_PATH}" \
    "${AUTH_JSON}" \
    "${IMPORT_JSON}" \
    "${PUBLISH_JSON}" \
    "${EXPORT_CREATE_JSON}" \
    "${EXPORT_RETRY_JSON}" \
    "${EXPORT_DOWNLOAD_PATH}" \
    "${RESTORE_WORKBOOK:-}"
}

trap cleanup EXIT

node --input-type=module - "${WORKBOOK_PATH}" "${PREFIX}" <<'NODE'
import XLSX from "xlsx";

const [, , workbookPath, prefix] = process.argv;
const workbook = XLSX.utils.book_new();
const rows = [
  [
    "CHASSIS NO.",
    "BG DATE",
    "SHIPMENT ETD PKG",
    "DATE RECEIVED BY OUTLET",
    "REG DATE",
    "DELIVERY DATE",
    "DISB. DATE",
    "BRCH",
    "MODEL",
    "PAYMENT METHOD",
    "SA NAME",
    "CUST NAME",
    "REMARKS",
  ],
  [
    `${prefix}-A`,
    45748,
    45755,
    45767,
    45770,
    45774,
    45780,
    "KK",
    "ATIVA",
    "Loan",
    "Retry Admin",
    "Retry Customer A",
    "Retry smoke row",
  ],
  [
    `${prefix}-B`,
    45749,
    45756,
    45768,
    45771,
    45775,
    45781,
    "MYY",
    "MYVI",
    "Cash",
    "Retry Admin",
    "Retry Customer B",
    "Retry smoke row",
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
  -F "file=@${WORKBOOK_PATH};type=application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;filename=smoke-retries.xlsx" > "${IMPORT_JSON}"

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

docker exec "${SUPABASE_DB_CONTAINER}" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "
  update app.import_jobs
  set
    status = 'failed',
    preview_available = true,
    publish_mode = 'replace',
    error_message = 'simulated publish failure',
    last_error_at = timezone('utc', now()),
    attempt_count = 3,
    max_attempts = 3
  where id = '${IMPORT_ID}';
" >/dev/null

curl -fsS -X POST "${API_URL}/imports/${IMPORT_ID}/publish" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"mode":"replace"}' > "${PUBLISH_JSON}"

wait_for_import_publish "${API_URL}" "${ACCESS_TOKEN}" "${IMPORT_ID}" "${PUBLISH_JSON}"

python3 - "${PUBLISH_JSON}" <<'PY'
import json
import sys

with open(sys.argv[1], "r", encoding="utf-8") as handle:
    body = json.load(handle)

assert body["item"]["status"] == "published", body
assert body["item"]["publishMode"] == "replace", body
assert body["item"].get("canRetryPublish") is False, body
PY

curl -fsS -X POST "${API_URL}/exports" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"query\":{\"search\":\"${PREFIX}\",\"branch\":\"all\",\"model\":\"all\",\"payment\":\"all\",\"page\":1,\"pageSize\":50,\"sortField\":\"bg_date\",\"sortDirection\":\"desc\"}}" > "${EXPORT_CREATE_JSON}"

EXPORT_ID="$(
  python3 - "${EXPORT_CREATE_JSON}" <<'PY'
import json
import sys

with open(sys.argv[1], "r", encoding="utf-8") as handle:
    body = json.load(handle)

print(body["item"]["id"])
PY
)"

python3 - "${API_URL}" "${ACCESS_TOKEN}" "${EXPORT_ID}" <<'PY'
import json
import subprocess
import sys
import time

api_url, token, export_id = sys.argv[1:4]
deadline = time.time() + 30

while time.time() < deadline:
    response = subprocess.run(
        ["curl", "-fsS", "-H", f"Authorization: Bearer {token}", f"{api_url}/exports"],
        capture_output=True,
        text=True,
        check=True,
    )
    payload = json.loads(response.stdout)
    for item in payload.get("items", []):
      if item.get("id") != export_id:
        continue
      if item.get("status") == "completed":
        raise SystemExit(0)
      if item.get("status") == "failed":
        raise SystemExit(f"Export {export_id} failed before retry smoke")
    time.sleep(1)

raise SystemExit(f"Timed out waiting for export {export_id} to complete")
PY

docker exec "${SUPABASE_DB_CONTAINER}" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "
  update app.export_jobs
  set
    status = 'failed',
    completed_at = null,
    storage_path = null,
    total_rows = 0,
    error_message = 'simulated export failure',
    last_error_at = timezone('utc', now()),
    attempt_count = 3,
    max_attempts = 3
  where id = '${EXPORT_ID}';
" >/dev/null

curl -fsS -X POST "${API_URL}/exports/${EXPORT_ID}/retry" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" > "${EXPORT_RETRY_JSON}"

python3 - "${API_URL}" "${ACCESS_TOKEN}" "${EXPORT_ID}" "${EXPORT_RETRY_JSON}" <<'PY'
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
        if item.get("status") == "completed":
            if item.get("totalRows") != 2:
                raise SystemExit(f"Unexpected export row count after retry: {item}")
            if item.get("canRetry") is not False:
                raise SystemExit(f"Export retry flag not cleared: {item}")
            raise SystemExit(0)
        if item.get("status") == "failed":
            raise SystemExit(f"Export {export_id} stayed failed after retry")
    time.sleep(1)

raise SystemExit(f"Timed out waiting for export {export_id} to complete after retry")
PY

curl -fsS "${API_URL}/exports/${EXPORT_ID}/download" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" > "${EXPORT_DOWNLOAD_PATH}"

python3 - "${EXPORT_DOWNLOAD_PATH}" <<'PY'
import csv
import sys

with open(sys.argv[1], "r", encoding="utf-8") as handle:
    rows = list(csv.reader(handle))

assert len(rows) == 3, rows
assert rows[0][0] == "Chassis No", rows[0]
print("Retry smoke test succeeded")
print(f"Retried export rows: {len(rows) - 1}")
PY
