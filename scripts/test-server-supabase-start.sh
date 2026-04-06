#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${ROOT_DIR}/scripts/_test_server_env.sh"
source "${ROOT_DIR}/scripts/_test_server_queue.sh"
source "${ROOT_DIR}/scripts/_supabase_cli.sh"

cd "${ROOT_DIR}"
ensure_test_server_queue "${ROOT_DIR}"
supabase_cli start
bash "${ROOT_DIR}/scripts/test-server-supabase-migrate.sh"
