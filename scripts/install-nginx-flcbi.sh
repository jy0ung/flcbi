#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${ROOT_DIR}/scripts/_test_server_env.sh"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this installer as root: sudo bash scripts/install-nginx-flcbi.sh" >&2
  exit 1
fi

SITE_NAME="${NGINX_SITE_NAME:-flcbi-test}"
SERVER_NAME="${TEST_SERVER_PUBLIC_HOST:-flcbi.192.168.1.133.sslip.io}"
WEB_PORT="${VITE_PORT:-18133}"
API_PORT_VALUE="${API_PORT:-18134}"
SUPABASE_API_PORT_VALUE="${SUPABASE_API_PORT:-55431}"
TEMPLATE_PATH="${ROOT_DIR}/ops/nginx/flcbi-test.conf.template"
TARGET_PATH="/etc/nginx/sites-available/${SITE_NAME}"
ENABLED_PATH="/etc/nginx/sites-enabled/${SITE_NAME}"

if [[ ! -f "${TEMPLATE_PATH}" ]]; then
  echo "Missing nginx template at ${TEMPLATE_PATH}" >&2
  exit 1
fi

tmp_config="$(mktemp)"
trap 'rm -f "${tmp_config}"' EXIT

sed \
  -e "s/__SERVER_NAME__/${SERVER_NAME}/g" \
  -e "s/__WEB_PORT__/${WEB_PORT}/g" \
  -e "s/__API_PORT__/${API_PORT_VALUE}/g" \
  -e "s/__SUPABASE_API_PORT__/${SUPABASE_API_PORT_VALUE}/g" \
  "${TEMPLATE_PATH}" > "${tmp_config}"

install -m 644 "${tmp_config}" "${TARGET_PATH}"
ln -sfn "${TARGET_PATH}" "${ENABLED_PATH}"

nginx -t
systemctl reload nginx

cat <<EOF
nginx site installed.

Public App:     ${TEST_SERVER_PUBLIC_BASE_URL}
Public API:     ${TEST_SERVER_PUBLIC_BASE_URL}/v1
Public Swagger: ${TEST_SERVER_PUBLIC_BASE_URL}/docs
EOF
