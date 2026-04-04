#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SUPABASE_NPM_CACHE_DIR="${ROOT_DIR}/.cache/npm-supabase-cli"
SUPABASE_CLI_HOME="${ROOT_DIR}/.cache/supabase-cli-runtime"
SUPABASE_CLI_BIN="${SUPABASE_CLI_HOME}/node_modules/.bin/supabase"

ensure_supabase_cli() {
  mkdir -p "${SUPABASE_NPM_CACHE_DIR}"

  if [[ -x "${SUPABASE_CLI_BIN}" ]]; then
    return
  fi

  rm -rf "${SUPABASE_CLI_HOME}"
  mkdir -p "${SUPABASE_CLI_HOME}"

  npm_config_cache="${SUPABASE_NPM_CACHE_DIR}" \
    npm install --no-save --prefix "${SUPABASE_CLI_HOME}" supabase@latest
}

supabase_cli() {
  ensure_supabase_cli
  "${SUPABASE_CLI_BIN}" "$@"
}
