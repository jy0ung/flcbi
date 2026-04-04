#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${ROOT_DIR}/scripts/_test_server_env.sh"

PUBLIC_BASE_URL="${TEST_SERVER_PUBLIC_BASE_URL:-${VITE_PUBLIC_APP_URL}}"
PUBLIC_API_URL="${PUBLIC_BASE_URL}/v1"
DIRECT_APP_URL="http://${TEST_SERVER_HOST}:${VITE_PORT}"
DIRECT_API_URL="http://${TEST_SERVER_HOST}:${API_PORT}/v1"
SUPABASE_DIRECT_URL="http://${TEST_SERVER_HOST}:${SUPABASE_API_PORT}"

cat <<EOF
FLC BI test server links

Public App:      ${PUBLIC_BASE_URL}
Public API:      ${PUBLIC_API_URL}
Public Swagger:  ${PUBLIC_BASE_URL}/docs
Public Health:   ${PUBLIC_API_URL}/health
Direct App:      ${DIRECT_APP_URL}
Direct API:      ${DIRECT_API_URL}
Supabase API:    ${SUPABASE_DIRECT_URL}
Supabase Studio: http://${TEST_SERVER_HOST}:${SUPABASE_STUDIO_PORT}
Mailpit:         http://${TEST_SERVER_HOST}:${SUPABASE_INBUCKET_PORT}
Legacy Postgres: postgresql://flcbi:flcbi@${TEST_SERVER_HOST}:${POSTGRES_PORT}/flcbi
Redis:           redis://${TEST_SERVER_HOST}:${REDIS_PORT}
MinIO:           http://${TEST_SERVER_HOST}:${MINIO_API_PORT}
MinIO Console:   http://${TEST_SERVER_HOST}:${MINIO_CONSOLE_PORT}
EOF
