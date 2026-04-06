#!/usr/bin/env bash

set -euo pipefail

snapshot_active_dataset_workbook() {
  local workbook_path="$1"
  local db_container="$2"
  local csv_path
  csv_path="$(mktemp --suffix=.csv)"

  docker exec "${db_container}" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "
    copy (
      select
        vehicle_records.chassis_no as \"CHASSIS NO.\",
        coalesce(to_char(vehicle_records.bg_date, 'YYYY-MM-DD'), '') as \"BG DATE\",
        coalesce(to_char(vehicle_records.shipment_etd_pkg, 'YYYY-MM-DD'), '') as \"SHIPMENT ETD PKG\",
        coalesce(to_char(vehicle_records.shipment_eta, 'YYYY-MM-DD'), '') as \"SHIPMENT ETA KK/TWU/SDK\",
        coalesce(to_char(vehicle_records.date_received_by_outlet, 'YYYY-MM-DD'), '') as \"DATE RECEIVED BY OUTLET\",
        coalesce(to_char(vehicle_records.reg_date, 'YYYY-MM-DD'), '') as \"REG DATE\",
        coalesce(to_char(vehicle_records.delivery_date, 'YYYY-MM-DD'), '') as \"DELIVERY DATE\",
        coalesce(to_char(vehicle_records.disb_date, 'YYYY-MM-DD'), '') as \"DISB. DATE\",
        coalesce(branches.code, '') as \"BRCH\",
        coalesce(vehicle_records.model, '') as \"MODEL\",
        coalesce(vehicle_records.payment_method, '') as \"PAYMENT METHOD\",
        coalesce(vehicle_records.salesman_name, '') as \"SA NAME\",
        coalesce(vehicle_records.customer_name, '') as \"CUST NAME\",
        case when vehicle_records.is_d2d then 'D2D transfer' else '' end as \"REMARKS\"
      from app.vehicle_records as vehicle_records
      left join app.branches as branches on branches.id = vehicle_records.branch_id
      order by vehicle_records.chassis_no
    ) to stdout with csv header;
  " > "${csv_path}"

  if [[ "$(wc -l < "${csv_path}")" -le 1 ]]; then
    rm -f "${csv_path}" "${workbook_path}"
    return 1
  fi

  node --input-type=module - "${csv_path}" "${workbook_path}" <<'NODE'
import XLSX from "xlsx";

const [, , csvPath, workbookPath] = process.argv;
const sourceWorkbook = XLSX.readFile(csvPath, { raw: false, cellDates: false });
const sourceSheet = sourceWorkbook.Sheets[sourceWorkbook.SheetNames[0]];
const workbook = XLSX.utils.book_new();

XLSX.utils.book_append_sheet(workbook, sourceSheet, "Combine Data");
XLSX.writeFile(workbook, workbookPath);
NODE

  rm -f "${csv_path}"
}

restore_dataset_from_workbook() {
  local api_url="$1"
  local access_token="$2"
  local workbook_path="$3"
  local filename="${4:-smoke-restore.xlsx}"
  local mode="${5:-replace}"
  local import_json
  local publish_json
  local import_id

  import_json="$(mktemp)"
  publish_json="$(mktemp)"

  curl -fsS -X POST "${api_url}/imports" \
    -H "Authorization: Bearer ${access_token}" \
    -F "file=@${workbook_path};type=application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;filename=${filename}" > "${import_json}"

  import_id="$(
    python3 - "${import_json}" <<'PY'
import json
import sys

with open(sys.argv[1], "r", encoding="utf-8") as handle:
    body = json.load(handle)

assert body["missingColumns"] == [], body
assert body["item"]["status"] == "validated", body
print(body["item"]["id"])
PY
  )"

  curl -fsS -X POST "${api_url}/imports/${import_id}/publish" \
    -H "Authorization: Bearer ${access_token}" \
    -H "Content-Type: application/json" \
    -d "{\"mode\":\"${mode}\"}" > "${publish_json}"

  python3 - "${publish_json}" "${mode}" <<'PY'
import json
import sys

with open(sys.argv[1], "r", encoding="utf-8") as handle:
    body = json.load(handle)

assert body["item"]["status"] == "published", body
assert body["item"]["publishMode"] == sys.argv[2], body
PY

  rm -f "${import_json}" "${publish_json}"
  printf '%s\n' "${import_id}"
}
