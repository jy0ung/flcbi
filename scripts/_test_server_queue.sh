#!/usr/bin/env bash

set -euo pipefail

ensure_test_server_queue() {
  local root_dir="$1"

  if [[ -z "${REDIS_URL:-}" ]]; then
    return
  fi

  (
    cd "${root_dir}"
    docker compose up -d redis >/dev/null
  )
}

stop_test_server_queue() {
  local root_dir="$1"

  if [[ -z "${REDIS_URL:-}" ]]; then
    return
  fi

  (
    cd "${root_dir}"
    docker compose stop redis >/dev/null || true
  )
}
