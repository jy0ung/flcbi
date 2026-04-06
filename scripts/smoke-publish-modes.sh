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

RUN_ID="$(date +%s)"
PREFIX="MODE-${RUN_ID}"
AUTH_JSON="$(mktemp)"
QUERY_JSON="$(mktemp)"
RESTORE_WORKBOOK="$(mktemp --suffix=.xlsx)"
RESTORE_READY=false

if snapshot_active_dataset_workbook "${RESTORE_WORKBOOK}" "${SUPABASE_DB_CONTAINER}"; then
  RESTORE_READY=true
else
  RESTORE_WORKBOOK=""
fi

create_workbook() {
  local path="$1"
  local spec="$2"
  node --input-type=module - "${path}" "${PREFIX}" "${spec}" <<'NODE'
import XLSX from "xlsx";

const [, , workbookPath, prefix, spec] = process.argv;
const workbook = XLSX.utils.book_new();
const rowsBySpec = {
  replace_a: [
    ["CHASSIS NO.", "BG DATE", "SHIPMENT ETD PKG", "DATE RECEIVED BY OUTLET", "REG DATE", "DELIVERY DATE", "DISB. DATE", "BRCH", "MODEL", "PAYMENT METHOD", "SA NAME", "CUST NAME", "REMARKS"],
    [`${prefix}-A`, 45740, "", "", "", "", "", "KK", "ATIVA", "Loan", "Smoke Admin", "Customer A", "Pending shipment"],
    [`${prefix}-B`, 45741, 45745, "", "", "", "", "KK", "MYVI", "Cash", "Smoke Admin", "Customer B", "In transit"],
    [`${prefix}-C`, 45742, 45746, 45753, "", "", "", "MYY", "BEZZA", "Loan", "Smoke Admin", "Customer C", "At outlet"],
  ],
  replace_b: [
    ["CHASSIS NO.", "BG DATE", "SHIPMENT ETD PKG", "DATE RECEIVED BY OUTLET", "REG DATE", "DELIVERY DATE", "DISB. DATE", "BRCH", "MODEL", "PAYMENT METHOD", "SA NAME", "CUST NAME", "REMARKS"],
    [`${prefix}-B`, 45741, 45745, 45755, "", "", "", "KK", "MYVI", "Cash", "Smoke Admin", "Customer B Updated", "Moved to outlet"],
    [`${prefix}-D`, 45744, 45748, "", "", "", "", "SDK", "ALZA", "Loan", "Smoke Admin", "Customer D", "Fresh transit"],
  ],
  merge_c: [
    ["CHASSIS NO.", "BG DATE", "SHIPMENT ETD PKG", "DATE RECEIVED BY OUTLET", "REG DATE", "DELIVERY DATE", "DISB. DATE", "BRCH", "MODEL", "PAYMENT METHOD", "SA NAME", "CUST NAME", "REMARKS"],
    [`${prefix}-D`, 45744, 45748, 45758, 45761, "", "", "SDK", "ALZA", "Loan", "Smoke Admin", "Customer D Updated", "Reached registration"],
    [`${prefix}-E`, 45745, "", "", "", "", "", "KK", "AXIA", "Cash", "Smoke Admin", "Customer E", "New unit"],
  ],
};

const rows = rowsBySpec[spec];
if (!rows) {
  throw new Error(`Unknown workbook spec: ${spec}`);
}

const sheet = XLSX.utils.aoa_to_sheet(rows);
XLSX.utils.book_append_sheet(workbook, sheet, "Combine Data");
XLSX.writeFile(workbook, workbookPath);
NODE
}

WORKBOOK_ONE="$(mktemp --suffix=.xlsx)"
WORKBOOK_TWO="$(mktemp --suffix=.xlsx)"
WORKBOOK_THREE="$(mktemp --suffix=.xlsx)"

create_workbook "${WORKBOOK_ONE}" "replace_a"
create_workbook "${WORKBOOK_TWO}" "replace_b"
create_workbook "${WORKBOOK_THREE}" "merge_c"

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

IMPORT_IDS=()

upload_and_publish() {
  local workbook_path="$1"
  local mode="$2"
  local import_json publish_json
  import_json="$(mktemp)"
  publish_json="$(mktemp)"

  curl -fsS -X POST "${API_URL}/imports" \
    -H "Authorization: Bearer ${ACCESS_TOKEN}" \
    -F "file=@${workbook_path};type=application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;filename=smoke-${mode}.xlsx" > "${import_json}"

  local import_id
  import_id="$(
    python3 - "${import_json}" <<'PY'
import json
import sys

with open(sys.argv[1], "r", encoding="utf-8") as handle:
    body = json.load(handle)

print(body["item"]["id"])
PY
  )"

  wait_for_import_validation "${API_URL}" "${ACCESS_TOKEN}" "${import_id}" "${import_json}"

  python3 - "${import_json}" <<'PY'
import json
import sys

with open(sys.argv[1], "r", encoding="utf-8") as handle:
    body = json.load(handle)

assert body["missingColumns"] == [], body
assert body["item"]["status"] == "validated", body
PY

  curl -fsS -X POST "${API_URL}/imports/${import_id}/publish" \
    -H "Authorization: Bearer ${ACCESS_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{\"mode\":\"${mode}\"}" > "${publish_json}"

  wait_for_import_publish "${API_URL}" "${ACCESS_TOKEN}" "${import_id}" "${publish_json}"

  python3 - "${publish_json}" "${mode}" <<'PY'
import json
import sys

with open(sys.argv[1], "r", encoding="utf-8") as handle:
    body = json.load(handle)

assert body["item"]["status"] == "published", body
assert body["item"]["publishMode"] == sys.argv[2], body
PY

  IMPORT_IDS+=("${import_id}")
  rm -f "${import_json}" "${publish_json}"
}

query_total() {
  curl -fsS -X POST "${API_URL}/aging/explorer/query" \
    -H "Authorization: Bearer ${ACCESS_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{\"search\":\"${PREFIX}\",\"branch\":\"all\",\"model\":\"all\",\"payment\":\"all\",\"page\":1,\"pageSize\":100,\"sortField\":\"bg_to_delivery\",\"sortDirection\":\"desc\"}" > "${QUERY_JSON}"

  python3 - "${QUERY_JSON}" <<'PY'
import json
import sys

with open(sys.argv[1], "r", encoding="utf-8") as handle:
    body = json.load(handle)

print(body["result"]["total"])
PY
}

cleanup() {
  if [[ "${#IMPORT_IDS[@]}" -eq 0 ]]; then
    return
  fi

  if [[ "${RESTORE_READY}" == "true" && -n "${ACCESS_TOKEN}" ]]; then
    restore_dataset_from_workbook "${API_URL}" "${ACCESS_TOKEN}" "${RESTORE_WORKBOOK}" "smoke-publish-restore.xlsx" "replace" >/dev/null
  fi

  local joined
  joined="$(printf "'%s'," "${IMPORT_IDS[@]}")"
  joined="${joined%,}"
  docker exec "${SUPABASE_DB_CONTAINER}" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "
    delete from app.vehicle_records where chassis_no like '${PREFIX}%';
    delete from app.quality_issues where chassis_no like '${PREFIX}%';
    delete from raw.vehicle_import_rows where chassis_no like '${PREFIX}%';
    delete from app.dataset_versions where import_job_id in (${joined});
    delete from app.import_jobs where id in (${joined});
  " >/dev/null
}

trap 'cleanup; rm -f "${AUTH_JSON}" "${QUERY_JSON}" "${WORKBOOK_ONE:-}" "${WORKBOOK_TWO:-}" "${WORKBOOK_THREE:-}" "${RESTORE_WORKBOOK:-}"' EXIT

upload_and_publish "${WORKBOOK_ONE}" "replace"
TOTAL_AFTER_REPLACE_ONE="$(query_total)"
if [[ "${TOTAL_AFTER_REPLACE_ONE}" != "3" ]]; then
  echo "Expected 3 prefixed vehicles after first replace publish, got ${TOTAL_AFTER_REPLACE_ONE}" >&2
  exit 1
fi

upload_and_publish "${WORKBOOK_TWO}" "replace"
TOTAL_AFTER_REPLACE_TWO="$(query_total)"
if [[ "${TOTAL_AFTER_REPLACE_TWO}" != "2" ]]; then
  echo "Expected 2 prefixed vehicles after second replace publish, got ${TOTAL_AFTER_REPLACE_TWO}" >&2
  exit 1
fi

upload_and_publish "${WORKBOOK_THREE}" "merge"
TOTAL_AFTER_MERGE="$(query_total)"
if [[ "${TOTAL_AFTER_MERGE}" != "3" ]]; then
  echo "Expected 3 prefixed vehicles after merge publish, got ${TOTAL_AFTER_MERGE}" >&2
  exit 1
fi

echo "Publish-mode smoke test succeeded"
echo "Prefix: ${PREFIX}"
echo "Replace->Replace->Merge counts: 3 -> 2 -> 3"
