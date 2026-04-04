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
KEEP_DATA="${SMOKE_IMPORT_KEEP_DATA:-false}"
PREVIOUS_IMPORT_ID="$(
  docker exec "${SUPABASE_DB_CONTAINER}" psql -U postgres -d postgres -At -c \
    "select import_job_id from app.vehicle_records limit 1;" 2>/dev/null | head -n 1
)"

if [[ -z "${ADMIN_PASSWORD}" ]]; then
  echo "Missing bootstrap admin password in environment." >&2
  exit 1
fi

if [[ -z "${ANON_KEY}" ]]; then
  echo "Missing Supabase anon key in environment." >&2
  exit 1
fi

WORKBOOK_PATH="$(mktemp --suffix=.xlsx)"
AUTH_JSON="$(mktemp)"
IMPORT_JSON="$(mktemp)"
PUBLISH_JSON="$(mktemp)"
SUMMARY_JSON="$(mktemp)"
trap 'rm -f "${WORKBOOK_PATH}" "${AUTH_JSON}" "${IMPORT_JSON}" "${PUBLISH_JSON}" "${SUMMARY_JSON}"' EXIT

IMPORT_STAMP="$(date +%s)"

node --input-type=module - "${WORKBOOK_PATH}" "${IMPORT_STAMP}" <<'NODE'
import XLSX from "xlsx";

const [, , workbookPath, importStamp] = process.argv;
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
    `SMOKE-${importStamp}-A`,
    45748,
    45755,
    45767,
    45770,
    45774,
    45780,
    "KK",
    "ATIVA",
    "Loan",
    "Smoke Admin",
    "Smoke Customer A",
    "Normal flow",
  ],
  [
    `SMOKE-${importStamp}-B`,
    45749,
    45756,
    45768,
    45771,
    45775,
    45781,
    "MYY",
    "MYVI",
    "Cash",
    "Smoke Admin",
    "Smoke Customer B",
    "D2D transfer",
  ],
];

const sheet = XLSX.utils.aoa_to_sheet(rows);
XLSX.utils.book_append_sheet(workbook, sheet, "Combine Data");
XLSX.writeFile(workbook, workbookPath);
NODE

curl -sS -X POST "${SUPABASE_AUTH_URL}/token?grant_type=password" \
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

curl -sS -X POST "${API_URL}/imports" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -F "file=@${WORKBOOK_PATH};type=application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;filename=smoke-import.xlsx" > "${IMPORT_JSON}"

IMPORT_ID="$(
  python3 - "${IMPORT_JSON}" <<'PY'
import json
import sys

with open(sys.argv[1], "r", encoding="utf-8") as handle:
    body = json.load(handle)

assert body["item"]["status"] in {"validated", "failed"}
assert body["item"]["totalRows"] == 2
assert body["missingColumns"] == []
print(body["item"]["id"])
PY
)"

curl -sS -X POST "${API_URL}/imports/${IMPORT_ID}/publish" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" > "${PUBLISH_JSON}"

curl -sS "${API_URL}/aging/summary" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" > "${SUMMARY_JSON}"

python3 - "${IMPORT_JSON}" "${PUBLISH_JSON}" "${SUMMARY_JSON}" <<'PY'
import json
import sys

with open(sys.argv[1], "r", encoding="utf-8") as handle:
    preview = json.load(handle)
with open(sys.argv[2], "r", encoding="utf-8") as handle:
    published = json.load(handle)
with open(sys.argv[3], "r", encoding="utf-8") as handle:
    summary = json.load(handle)

assert preview["item"]["status"] == "validated", preview
assert published["item"]["status"] == "published", published
assert summary["summary"]["totalVehicles"] >= 2, summary

print("Smoke import succeeded")
print(f"Import ID: {published['item']['id']}")
print(f"Total vehicles after publish: {summary['summary']['totalVehicles']}")
PY

if [[ "${KEEP_DATA}" != "true" ]]; then
  docker exec "${SUPABASE_DB_CONTAINER}" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "
    delete from app.vehicle_records where import_job_id = '${IMPORT_ID}';
    delete from app.quality_issues where import_job_id = '${IMPORT_ID}';
    delete from raw.vehicle_import_rows where import_job_id = '${IMPORT_ID}';
    delete from app.dataset_versions where import_job_id = '${IMPORT_ID}';
    delete from app.import_jobs where id = '${IMPORT_ID}';
  " >/dev/null

  if [[ -n "${PREVIOUS_IMPORT_ID}" ]]; then
    curl -fsS -X POST "${API_URL}/imports/${PREVIOUS_IMPORT_ID}/publish" \
      -H "Authorization: Bearer ${ACCESS_TOKEN}" \
      -H "Content-Type: application/json" \
      -d '{"mode":"replace"}' >/dev/null
  fi

  echo "Smoke import data cleaned up"
fi
