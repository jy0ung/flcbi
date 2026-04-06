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
IMPORT_FILENAME="smoke-notifications-${STAMP}.xlsx"
NOTIFICATION_TITLE="Import published: ${IMPORT_FILENAME}"
PREFIX="NOTIFY-${STAMP}"
ALERT_NAME="Smoke alert ${STAMP}"
ALERT_TITLE="${ALERT_NAME} triggered"
WORKBOOK_PATH="$(mktemp --suffix=.xlsx)"
AUTH_JSON="$(mktemp)"
IMPORT_JSON="$(mktemp)"
PUBLISH_JSON="$(mktemp)"
ALERT_JSON="$(mktemp)"
NOTIFICATIONS_JSON="$(mktemp)"
NOTIFICATIONS_AFTER_JSON="$(mktemp)"
DUPLICATE_JSON="$(mktemp)"
ACCESS_TOKEN=""
IMPORT_ID=""
NOTIFICATION_ID=""
ALERT_ID=""
RESTORE_WORKBOOK="$(mktemp --suffix=.xlsx)"
RESTORE_READY=false

if snapshot_active_dataset_workbook "${RESTORE_WORKBOOK}" "${SUPABASE_DB_CONTAINER}"; then
  RESTORE_READY=true
else
  RESTORE_WORKBOOK=""
fi

cleanup() {
  if [[ -z "${IMPORT_ID}" ]]; then
    rm -f \
      "${WORKBOOK_PATH}" \
      "${AUTH_JSON}" \
      "${IMPORT_JSON}" \
      "${PUBLISH_JSON}" \
      "${ALERT_JSON}" \
      "${NOTIFICATIONS_JSON}" \
      "${NOTIFICATIONS_AFTER_JSON}" \
      "${DUPLICATE_JSON}" \
      "${RESTORE_WORKBOOK:-}"
    return
  fi

  if [[ "${RESTORE_READY}" == "true" && -n "${ACCESS_TOKEN}" ]]; then
    restore_dataset_from_workbook "${API_URL}" "${ACCESS_TOKEN}" "${RESTORE_WORKBOOK}" "smoke-notifications-restore.xlsx" "replace" >/dev/null
  fi

  docker exec "${SUPABASE_DB_CONTAINER}" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "
    delete from app.notifications where metadata ->> 'importId' = '${IMPORT_ID}';
    delete from app.notifications where alert_rule_id = nullif('${ALERT_ID}', '')::uuid;
    delete from app.alert_rules where id = nullif('${ALERT_ID}', '')::uuid;
    delete from app.vehicle_records where import_job_id = '${IMPORT_ID}';
    delete from app.quality_issues where import_job_id = '${IMPORT_ID}';
    delete from raw.vehicle_import_rows where import_job_id = '${IMPORT_ID}';
    delete from app.dataset_versions where import_job_id = '${IMPORT_ID}';
    delete from app.import_jobs where id = '${IMPORT_ID}';
  " >/dev/null

  rm -f \
    "${WORKBOOK_PATH}" \
    "${AUTH_JSON}" \
    "${IMPORT_JSON}" \
    "${PUBLISH_JSON}" \
    "${ALERT_JSON}" \
    "${NOTIFICATIONS_JSON}" \
    "${NOTIFICATIONS_AFTER_JSON}" \
    "${DUPLICATE_JSON}" \
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
    "",
    "",
    "",
    "",
    "KK",
    "ATIVA",
    "Loan",
    "Smoke Admin",
    "Smoke Notifications",
    "Pass 3 notifications smoke",
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
assert body["missingColumns"] == [], body
PY

curl -fsS -X POST "${API_URL}/imports/${IMPORT_ID}/publish" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"mode":"merge"}' > "${PUBLISH_JSON}"

wait_for_import_publish "${API_URL}" "${ACCESS_TOKEN}" "${IMPORT_ID}" "${PUBLISH_JSON}"

python3 - "${PUBLISH_JSON}" <<'PY'
import json
import sys

with open(sys.argv[1], "r", encoding="utf-8") as handle:
    body = json.load(handle)

assert body["item"]["status"] == "published", body
assert body["item"]["publishMode"] == "merge", body
PY

NOTIFICATION_ID="$(
  python3 - "${API_URL}" "${ACCESS_TOKEN}" "${NOTIFICATION_TITLE}" "${NOTIFICATIONS_JSON}" <<'PY'
import json
import subprocess
import sys
import time

api_url, token, title, out_path = sys.argv[1:5]
for _ in range(8):
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
            assert item.get("read") is False, item
            print(item["id"])
            raise SystemExit(0)

    time.sleep(1)

raise SystemExit(f"Notification {title!r} was not found")
PY
)"

curl -fsS -X POST "${API_URL}/notifications/${NOTIFICATION_ID}/read" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" >/dev/null

curl -fsS "${API_URL}/notifications" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" > "${NOTIFICATIONS_AFTER_JSON}"

python3 - "${NOTIFICATIONS_AFTER_JSON}" "${NOTIFICATION_ID}" <<'PY'
import json
import sys

with open(sys.argv[1], "r", encoding="utf-8") as handle:
    body = json.load(handle)

notification_id = sys.argv[2]
item = next(candidate for candidate in body["items"] if candidate["id"] == notification_id)
assert item["read"] is True, item
PY

DUPLICATE_STATUS="$(
  curl -sS -o "${DUPLICATE_JSON}" -w '%{http_code}' -X POST "${API_URL}/imports/${IMPORT_ID}/publish" \
    -H "Authorization: Bearer ${ACCESS_TOKEN}" \
    -H "Content-Type: application/json" \
    -d '{"mode":"merge"}'
)"

python3 - "${DUPLICATE_JSON}" "${DUPLICATE_STATUS}" <<'PY'
import json
import sys

with open(sys.argv[1], "r", encoding="utf-8") as handle:
    body = json.load(handle)

status = sys.argv[2]
assert status == "400", (status, body)
assert "already been published" in body["message"], body
PY

curl -fsS -X POST "${API_URL}/alerts" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"${ALERT_NAME}\",\"metricId\":\"tracked_units\",\"threshold\":1,\"comparator\":\"gte\",\"frequency\":\"hourly\",\"enabled\":true,\"channel\":\"in_app\"}" > "${ALERT_JSON}"

ALERT_ID="$(
  python3 - "${ALERT_JSON}" "${ALERT_NAME}" <<'PY'
import json
import sys

with open(sys.argv[1], "r", encoding="utf-8") as handle:
    body = json.load(handle)

alert_name = sys.argv[2]
alert = next(item for item in body["items"] if item["name"] == alert_name)
print(alert["id"])
PY
)"

python3 - "${API_URL}" "${ACCESS_TOKEN}" "${ALERT_TITLE}" "${NOTIFICATIONS_JSON}" <<'PY'
import json
import subprocess
import sys
import time

api_url, token, title, out_path = sys.argv[1:5]
for _ in range(12):
    response = subprocess.run(
        ["curl", "-fsS", "-H", f"Authorization: Bearer {token}", f"{api_url}/notifications"],
        capture_output=True,
        text=True,
        check=True,
    )
    payload = json.loads(response.stdout)
    with open(out_path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle)

    if any(item.get("title") == title for item in payload.get("items", [])):
        raise SystemExit(0)

    time.sleep(1)

raise SystemExit(f"Alert notification {title!r} was not found")
PY

echo "Notifications smoke test succeeded"
echo "Import notification title: ${NOTIFICATION_TITLE}"
echo "Alert notification title: ${ALERT_TITLE}"
