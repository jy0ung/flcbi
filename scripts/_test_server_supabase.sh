#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SUPABASE_CONFIG_FILE="${ROOT_DIR}/supabase/config.toml"

resolve_test_server_supabase_project_id() {
  if [[ -n "${TEST_SERVER_SUPABASE_PROJECT_ID:-}" ]]; then
    printf '%s\n' "${TEST_SERVER_SUPABASE_PROJECT_ID}"
    return
  fi

  if [[ ! -f "${SUPABASE_CONFIG_FILE}" ]]; then
    echo "Missing ${SUPABASE_CONFIG_FILE}" >&2
    exit 1
  fi

  local project_id
  project_id="$(
    sed -n 's/^project_id = "\(.*\)"$/\1/p' "${SUPABASE_CONFIG_FILE}" | head -n 1
  )"

  if [[ -z "${project_id}" ]]; then
    echo "Could not resolve project_id from ${SUPABASE_CONFIG_FILE}" >&2
    exit 1
  fi

  printf '%s\n' "${project_id}"
}

TEST_SERVER_SUPABASE_PROJECT_ID="${TEST_SERVER_SUPABASE_PROJECT_ID:-$(resolve_test_server_supabase_project_id)}"
TEST_SERVER_SUPABASE_DB_CONTAINER="${TEST_SERVER_SUPABASE_DB_CONTAINER:-supabase_db_${TEST_SERVER_SUPABASE_PROJECT_ID}}"

ensure_test_server_supabase_running() {
  if ! docker inspect "${TEST_SERVER_SUPABASE_DB_CONTAINER}" >/dev/null 2>&1; then
    echo "Supabase DB container ${TEST_SERVER_SUPABASE_DB_CONTAINER} does not exist. Start the test-server Supabase stack first." >&2
    exit 1
  fi

  local running
  running="$(docker inspect -f '{{.State.Running}}' "${TEST_SERVER_SUPABASE_DB_CONTAINER}")"
  if [[ "${running}" != "true" ]]; then
    echo "Supabase DB container ${TEST_SERVER_SUPABASE_DB_CONTAINER} is not running." >&2
    exit 1
  fi
}

test_server_supabase_psql() {
  ensure_test_server_supabase_running
  docker exec -i "${TEST_SERVER_SUPABASE_DB_CONTAINER}" psql -U postgres -d postgres -v ON_ERROR_STOP=1 "$@"
}
