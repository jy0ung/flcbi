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
PREFIX="SCHED-${STAMP}"
WORKBOOK_PATH="$(mktemp --suffix=.xlsx)"
AUTH_JSON="$(mktemp)"
IMPORT_JSON="$(mktemp)"
PUBLISH_JSON="$(mktemp)"
SUBSCRIPTION_JSON="$(mktemp)"
SUBSCRIPTIONS_JSON="$(mktemp)"
EXPORTS_JSON="$(mktemp)"
DOWNLOAD_PATH="$(mktemp --suffix=.csv)"
ACCESS_TOKEN=""
IMPORT_ID=""
SUBSCRIPTION_ID=""
EXPORT_ID=""
RESTORE_WORKBOOK="$(mktemp --suffix=.xlsx)"
RESTORE_READY=false

if snapshot_active_dataset_workbook "${RESTORE_WORKBOOK}" "${SUPABASE_DB_CONTAINER}"; then
  RESTORE_READY=true
else
  RESTORE_WORKBOOK=""
fi

cleanup() {
  if [[ "${RESTORE_READY}" == "true" && -n "${ACCESS_TOKEN}" ]]; then
    restore_dataset_from_workbook "${API_URL}" "${ACCESS_TOKEN}" "${RESTORE_WORKBOOK}" "smoke-scheduled-exports-restore.xlsx" "replace" >/dev/null
  fi

  if [[ -n "${EXPORT_ID}" ]]; then
    docker exec "${SUPABASE_DB_CONTAINER}" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "
      delete from app.notifications where metadata ->> 'exportId' = '${EXPORT_ID}';
      delete from app.export_jobs where id = '${EXPORT_ID}';
    " >/dev/null
  fi

  if [[ -n "${SUBSCRIPTION_ID}" ]]; then
    docker exec "${SUPABASE_DB_CONTAINER}" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "
      delete from app.export_subscriptions where id = '${SUBSCRIPTION_ID}';
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
    "${SUBSCRIPTION_JSON}" \
    "${SUBSCRIPTIONS_JSON}" \
    "${EXPORTS_JSON}" \
    "${DOWNLOAD_PATH}" \
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
    "Scheduled Admin",
    "Scheduled Customer A",
    "Scheduled smoke row",
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
    "Scheduled Admin",
    "Scheduled Customer B",
    "Scheduled smoke row",
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
  -F "file=@${WORKBOOK_PATH};type=application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;filename=smoke-scheduled-exports.xlsx" > "${IMPORT_JSON}"

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

curl -fsS -X POST "${API_URL}/imports/${IMPORT_ID}/publish" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"mode":"replace"}' > "${PUBLISH_JSON}"

wait_for_import_publish "${API_URL}" "${ACCESS_TOKEN}" "${IMPORT_ID}" "${PUBLISH_JSON}"

curl -fsS -X POST "${API_URL}/exports/subscriptions" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"query\":{\"search\":\"${PREFIX}\",\"branch\":\"all\",\"model\":\"all\",\"payment\":\"all\",\"page\":1,\"pageSize\":50,\"sortField\":\"bg_date\",\"sortDirection\":\"desc\"},\"schedule\":\"daily\"}" > "${SUBSCRIPTION_JSON}"

SUBSCRIPTION_ID="$(
  python3 - "${SUBSCRIPTION_JSON}" <<'PY'
import json
import sys

with open(sys.argv[1], "r", encoding="utf-8") as handle:
    body = json.load(handle)

print(body["item"]["id"])
PY
)"

node --input-type=commonjs - "${REDIS_URL}" "$(date --iso-8601=seconds)" <<'NODE'
const { Queue } = require("bullmq");

const [, , redisUrl, triggeredAt] = process.argv;

(async () => {
  const queue = new Queue("exports", { connection: { url: redisUrl } });
  await queue.add("daily-subscriptions", { triggeredAt }, {
    jobId: `smoke-daily-subscriptions-${Date.now()}`,
    removeOnComplete: {
      count: 100,
    },
    removeOnFail: {
      count: 500,
    },
  });
  await queue.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
NODE

python3 - "${API_URL}" "${ACCESS_TOKEN}" "${SUBSCRIPTION_ID}" "${SUBSCRIPTIONS_JSON}" <<'PY'
import json
import subprocess
import sys
import time

api_url, token, subscription_id, out_path = sys.argv[1:5]
deadline = time.time() + 45

while time.time() < deadline:
    response = subprocess.run(
        ["curl", "-fsS", "-H", f"Authorization: Bearer {token}", f"{api_url}/exports/subscriptions"],
        capture_output=True,
        text=True,
        check=True,
    )
    payload = json.loads(response.stdout)
    with open(out_path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle)
    for item in payload.get("items", []):
        if item.get("id") != subscription_id:
            continue
        if item.get("lastTriggeredAt"):
            raise SystemExit(0)
    time.sleep(1)

raise SystemExit(f"Subscription {subscription_id} did not trigger in time")
PY

EXPORT_ID="$(
  python3 - "${SUBSCRIPTIONS_JSON}" "${SUBSCRIPTION_ID}" <<'PY'
import json
import sys

with open(sys.argv[1], "r", encoding="utf-8") as handle:
    payload = json.load(handle)

for item in payload.get("items", []):
    if item.get("id") == sys.argv[2]:
        print(item.get("lastExportJobId", ""))
        raise SystemExit(0)

raise SystemExit("subscription not found")
PY
)"

if [[ -z "${EXPORT_ID}" ]]; then
  echo "Scheduled subscription did not produce an export job id." >&2
  exit 1
fi

python3 - "${API_URL}" "${ACCESS_TOKEN}" "${EXPORT_ID}" "${EXPORTS_JSON}" <<'PY'
import json
import subprocess
import sys
import time

api_url, token, export_id, out_path = sys.argv[1:5]
deadline = time.time() + 45

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
                raise SystemExit(f"Unexpected scheduled export row count: {item}")
            raise SystemExit(0)
        if item.get("status") == "failed":
            raise SystemExit(f"Scheduled export failed: {item.get('errorMessage')}")
    time.sleep(1)

raise SystemExit(f"Scheduled export {export_id} did not complete in time")
PY

curl -fsS "${API_URL}/exports/${EXPORT_ID}/download" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" > "${DOWNLOAD_PATH}"

python3 - "${DOWNLOAD_PATH}" <<'PY'
import csv
import sys

with open(sys.argv[1], "r", encoding="utf-8") as handle:
    rows = list(csv.reader(handle))

assert len(rows) == 3, rows
expected_headers = [
    "Chassis No.",
    "Branch",
    "Model",
    "Payment Method",
    "Salesman",
    "Customer",
    "Remark",
    "BG Date",
    "Shipment ETD",
    "Shipment ETA",
    "Outlet Received",
    "Registration Date",
    "Delivery Date",
    "Disbursement Date",
    "D2D",
    "No.",
    "VAA Date",
    "Full Payment Date",
    "Variant",
    "Dealer Transfer Price",
    "Full Payment Type",
    "Shipment Name",
    "LOU",
    "Contra Sola",
    "Reg No.",
    "Invoice No.",
    "OBR",
]
assert rows[0] == expected_headers, rows[0]

print("Smoke scheduled export succeeded")
print(f"Scheduled export rows: {len(rows) - 1}")
PY
