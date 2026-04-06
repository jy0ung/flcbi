#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_ENV_FILE="${ROOT_DIR}/.env.test-server"
LOCAL_ENV_FILE="${ROOT_DIR}/.env.test-server.local"

if [[ ! -f "${BASE_ENV_FILE}" ]]; then
  echo "Missing ${BASE_ENV_FILE}" >&2
  exit 1
fi

set -a
source "${BASE_ENV_FILE}"
if [[ -f "${LOCAL_ENV_FILE}" ]]; then
  source "${LOCAL_ENV_FILE}"
fi

if [[ -z "${REDIS_URL:-}" && -n "${REDIS_PORT:-}" ]]; then
  REDIS_URL="redis://127.0.0.1:${REDIS_PORT}"
  export REDIS_URL
fi

set +a
