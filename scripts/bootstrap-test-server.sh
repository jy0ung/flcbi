#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${ROOT_DIR}/scripts/_test_server_env.sh"
source "${ROOT_DIR}/scripts/_supabase_cli.sh"

cd "${ROOT_DIR}"

echo "Starting Supabase on dedicated FLC BI ports..."
supabase_cli start

STATUS_ENV="$(mktemp)"
trap 'rm -f "${STATUS_ENV}"' EXIT
supabase_cli status -o env > "${STATUS_ENV}"

ANON_KEY="$(grep '^ANON_KEY=' "${STATUS_ENV}" | cut -d= -f2-)"
SERVICE_ROLE_KEY="$(grep '^SERVICE_ROLE_KEY=' "${STATUS_ENV}" | cut -d= -f2-)"
JWT_SECRET="$(grep '^JWT_SECRET=' "${STATUS_ENV}" | cut -d= -f2-)"

if [[ -z "${ANON_KEY}" || -z "${SERVICE_ROLE_KEY}" ]]; then
  echo "Failed to read Supabase keys from status output." >&2
  exit 1
fi

BOOTSTRAP_PASSWORD="${BOOTSTRAP_ADMIN_PASSWORD:-$(node -e "console.log(require('node:crypto').randomBytes(18).toString('base64url'))")}"

cat > "${ROOT_DIR}/.env.test-server.local" <<EOF
VITE_SUPABASE_ANON_KEY=${ANON_KEY}
SUPABASE_URL=http://127.0.0.1:${SUPABASE_API_PORT}
SUPABASE_PUBLISHABLE_KEY=${ANON_KEY}
SUPABASE_ANON_KEY=${ANON_KEY}
SUPABASE_SERVICE_ROLE_KEY=${SERVICE_ROLE_KEY}
JWT_SECRET=${JWT_SECRET}
BOOTSTRAP_COMPANY_NAME="${BOOTSTRAP_COMPANY_NAME:-FLC BI}"
BOOTSTRAP_COMPANY_CODE="${BOOTSTRAP_COMPANY_CODE:-FLCBI}"
BOOTSTRAP_ADMIN_EMAIL="${BOOTSTRAP_ADMIN_EMAIL:-admin@flcbi.local}"
BOOTSTRAP_ADMIN_NAME="${BOOTSTRAP_ADMIN_NAME:-FLC BI Administrator}"
BOOTSTRAP_ADMIN_ROLE="${BOOTSTRAP_ADMIN_ROLE:-company_admin}"
BOOTSTRAP_ADMIN_PASSWORD="${BOOTSTRAP_PASSWORD}"
BOOTSTRAP_BRANCHES="${BOOTSTRAP_BRANCHES:-KK:Kota Kinabalu,TWU:Tawau,SDK:Sandakan,LDU:Lahad Datu,BTU:Bintulu,MYY:Miri,SBW:Sibu}"
EOF

source "${ROOT_DIR}/scripts/_test_server_env.sh"

echo "Bootstrapping company and admin account..."
npm run bootstrap:supabase

echo
echo "Admin login: ${BOOTSTRAP_ADMIN_EMAIL}"
echo "Admin password: ${BOOTSTRAP_ADMIN_PASSWORD}"

echo
bash "${ROOT_DIR}/scripts/test-server-links.sh"
