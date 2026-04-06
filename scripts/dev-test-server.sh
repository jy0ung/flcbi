#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ ! -f "${ROOT_DIR}/.env.test-server.local" ]]; then
  echo "No .env.test-server.local found. Starting without configured Supabase auth on test-server ports." >&2
fi

source "${ROOT_DIR}/scripts/_test_server_env.sh"
source "${ROOT_DIR}/scripts/_test_server_queue.sh"

cd "${ROOT_DIR}"
ensure_test_server_queue "${ROOT_DIR}"
npm run dev:platform
