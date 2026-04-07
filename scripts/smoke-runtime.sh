#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${ROOT_DIR}/scripts/_test_server_env.sh"

API_URL="${SMOKE_API_URL:-http://127.0.0.1:${API_PORT}/v1}"
HEALTH_JSON="$(mktemp)"
READY_JSON="$(mktemp)"
METRICS_TXT="$(mktemp)"

cleanup() {
  rm -f "${HEALTH_JSON}" "${READY_JSON}" "${METRICS_TXT}"
}

trap cleanup EXIT

curl -fsS "${API_URL}/health" > "${HEALTH_JSON}"
curl -fsS "${API_URL}/health/ready" > "${READY_JSON}"
curl -fsS "${API_URL}/metrics" > "${METRICS_TXT}"

python3 - "${HEALTH_JSON}" "${READY_JSON}" "${METRICS_TXT}" <<'PY'
import json
import sys

with open(sys.argv[1], "r", encoding="utf-8") as handle:
    health = json.load(handle)

with open(sys.argv[2], "r", encoding="utf-8") as handle:
    ready = json.load(handle)

with open(sys.argv[3], "r", encoding="utf-8") as handle:
    metrics = handle.read()

assert health["services"]["api"] == "up", health
assert ready["ready"] is True, ready
for key in ("supabase", "objectStorage", "queue", "queueImports", "queueAlerts", "queueExports"):
    assert key in ready["services"], ready

for metric_name in (
    "flcbi_health_ready",
    "flcbi_dependency_up",
    "flcbi_queue_jobs",
    "flcbi_queue_workers",
    "flcbi_vehicle_records_total",
):
    assert metric_name in metrics, metric_name

print("Runtime health and metrics endpoint checks passed")
PY

bash "${ROOT_DIR}/scripts/smoke-notifications.sh"
bash "${ROOT_DIR}/scripts/smoke-import-failure-alerts.sh"
bash "${ROOT_DIR}/scripts/smoke-scheduled-exports.sh"
node "${ROOT_DIR}/scripts/smoke-dashboard.mjs"

echo "Runtime smoke suite succeeded"
