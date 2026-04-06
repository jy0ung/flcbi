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
STAMP="$(date +%s)"
PREFIX="ROLLBACK-${STAMP}"
IMPORT_FILENAME="smoke-rollback-${STAMP}.xlsx"
WORKBOOK_PATH="$(mktemp --suffix=.xlsx)"
AUTH_JSON="$(mktemp)"
IMPORT_JSON="$(mktemp)"
IMPORT_ID=""

cleanup() {
  rm -f "${WORKBOOK_PATH}" "${AUTH_JSON}" "${IMPORT_JSON}"

  if [[ -z "${IMPORT_ID}" ]]; then
    return
  fi

  docker exec "${SUPABASE_DB_CONTAINER}" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "
    delete from app.notifications where metadata ->> 'importId' = '${IMPORT_ID}';
    delete from app.vehicle_records where import_job_id = '${IMPORT_ID}';
    delete from app.quality_issues where import_job_id = '${IMPORT_ID}';
    delete from raw.vehicle_import_rows where import_job_id = '${IMPORT_ID}';
    delete from app.dataset_versions where import_job_id = '${IMPORT_ID}';
    delete from app.import_jobs where id = '${IMPORT_ID}';
  " >/dev/null
}

trap cleanup EXIT

if [[ -z "${ADMIN_PASSWORD}" ]]; then
  echo "Missing bootstrap admin password in environment." >&2
  exit 1
fi

if [[ -z "${ANON_KEY}" ]]; then
  echo "Missing Supabase anon key in environment." >&2
  exit 1
fi

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
    "",
    "",
    "",
    "",
    "KK",
    "ATIVA",
    "Loan",
    "Smoke Admin",
    "Smoke Rollback",
    "Pass 3 rollback smoke",
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

assert body["item"]["status"] == "validated", body
PY

read -r COMPANY_ID UPLOADED_BY < <(
  docker exec "${SUPABASE_DB_CONTAINER}" psql -U postgres -d postgres -At -F $'\t' -c \
    "select company_id, uploaded_by from app.import_jobs where id = '${IMPORT_ID}';"
)

if docker exec "${SUPABASE_DB_CONTAINER}" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c \
  "select app.publish_import_atomic('${COMPANY_ID}'::uuid, '${IMPORT_ID}'::uuid, '${UPLOADED_BY}'::uuid, timezone('utc', now()), 'replace', '[]'::jsonb, '[]'::jsonb);" >/dev/null 2>&1; then
  echo "Expected publish_import_atomic to fail with an empty vehicle payload" >&2
  exit 1
fi

python3 - "${SUPABASE_DB_CONTAINER}" "${IMPORT_ID}" <<'PY'
import json
import subprocess
import sys

container, import_id = sys.argv[1:3]
sql = f"""
select json_build_object(
  'status', (select status from app.import_jobs where id = '{import_id}'),
  'datasetVersionId', (select dataset_version_id from app.import_jobs where id = '{import_id}'),
  'vehicleRecords', (select count(*) from app.vehicle_records where import_job_id = '{import_id}'),
  'datasetVersions', (select count(*) from app.dataset_versions where import_job_id = '{import_id}'),
  'qualityIssues', (select count(*) from app.quality_issues where import_job_id = '{import_id}')
);
"""
result = subprocess.run(
    ["docker", "exec", container, "psql", "-U", "postgres", "-d", "postgres", "-At", "-c", sql],
    capture_output=True,
    text=True,
    check=True,
)
payload = json.loads(result.stdout.strip())
assert payload["status"] == "validated", payload
assert payload["datasetVersionId"] is None, payload
assert payload["vehicleRecords"] == 0, payload
assert payload["datasetVersions"] == 0, payload
assert payload["qualityIssues"] == 0, payload
PY

echo "Publish rollback smoke test succeeded"
echo "Import ID: ${IMPORT_ID}"
