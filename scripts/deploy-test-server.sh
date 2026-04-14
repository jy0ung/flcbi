#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${ROOT_DIR}/scripts/_test_server_env.sh"
cd "${ROOT_DIR}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this deployment as root: sudo bash scripts/deploy-test-server.sh" >&2
  exit 1
fi

SYSTEMD_DIR="/etc/systemd/system"
TEMPLATES_DIR="${ROOT_DIR}/ops/systemd"
DOCKER_BIN="$(command -v docker)"

if [[ -z "${DOCKER_BIN}" ]]; then
  echo "Missing docker binary in PATH." >&2
  exit 1
fi

if [[ ! -f "${ROOT_DIR}/.env.test-server.local" ]]; then
  echo "Missing ${ROOT_DIR}/.env.test-server.local. Run npm run test-server:bootstrap first." >&2
  exit 1
fi

render_template() {
  local template_path="$1"
  local output_path="$2"

  python3 - "${template_path}" "${output_path}" "${ROOT_DIR}" "${DOCKER_BIN}" "${VITE_PORT}" <<'PY'
import pathlib
import sys

template_path, output_path, root_dir, docker_bin, web_port = sys.argv[1:6]
content = pathlib.Path(template_path).read_text(encoding="utf-8")
content = content.replace("__ROOT_DIR__", root_dir)
content = content.replace("__DOCKER_BIN__", docker_bin)
content = content.replace("__WEB_PORT__", web_port)
pathlib.Path(output_path).write_text(content, encoding="utf-8")
PY
}

install_unit() {
  local service_name="$1"
  local template_path="${TEMPLATES_DIR}/${service_name}.service.template"
  local target_path="${SYSTEMD_DIR}/${service_name}.service"
  local rendered_path
  rendered_path="$(mktemp)"

  if [[ ! -f "${template_path}" ]]; then
    echo "Missing systemd template at ${template_path}" >&2
    exit 1
  fi

  render_template "${template_path}" "${rendered_path}"
  install -m 644 "${rendered_path}" "${target_path}"
  rm -f "${rendered_path}"
}

echo "Building platform..."
npm run build:platform

echo "Installing nginx site..."
bash "${ROOT_DIR}/scripts/install-nginx-flcbi.sh"

echo "Installing systemd units..."
install_unit "bi-api"
install_unit "bi-web"
install_unit "bi-worker"
install_unit "bi-scheduler"
install_unit "bi-redis"

systemctl daemon-reload
systemctl enable bi-redis.service bi-api.service bi-web.service bi-worker.service bi-scheduler.service

echo "Starting Redis..."
systemctl restart bi-redis.service

echo "Restarting application services..."
systemctl restart bi-api.service bi-worker.service bi-scheduler.service bi-web.service

echo "Waiting for API readiness..."
ready=false
for _ in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:${API_PORT}/v1/health/ready" >/dev/null; then
    ready=true
    break
  fi
  sleep 1
done

if [[ "${ready}" != "true" ]]; then
  echo "API did not become ready in time." >&2
  exit 1
fi

echo "Checking web preview..."
for _ in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:${VITE_PORT}" >/dev/null; then
    break
  fi
  sleep 1
done

if ! curl -fsS "http://127.0.0.1:${VITE_PORT}" >/dev/null; then
  echo "Web preview did not become reachable in time." >&2
  exit 1
fi

echo
echo "Test server deployment is installed."
bash "${ROOT_DIR}/scripts/test-server-links.sh"
