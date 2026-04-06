#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${ROOT_DIR}/scripts/_test_server_env.sh"
source "${ROOT_DIR}/scripts/_test_server_supabase.sh"

cd "${ROOT_DIR}"

test_server_supabase_psql -c "
  create schema if not exists supabase_migrations;
  create table if not exists supabase_migrations.schema_migrations (
    version text primary key,
    statements text[],
    name text
  );
" >/dev/null

mapfile -t applied_versions < <(
  test_server_supabase_psql -At -c "select version from supabase_migrations.schema_migrations order by version;"
)

declare -A applied_version_map=()
for version in "${applied_versions[@]}"; do
  applied_version_map["${version}"]=1
done

shopt -s nullglob
migration_files=("${ROOT_DIR}"/supabase/migrations/*.sql)
shopt -u nullglob

if [[ "${#migration_files[@]}" -eq 0 ]]; then
  echo "No migration files found under supabase/migrations" >&2
  exit 1
fi

mapfile -t sorted_migration_files < <(printf '%s\n' "${migration_files[@]}" | sort)

applied_count=0
latest_version=""

for migration_file in "${sorted_migration_files[@]}"; do
  filename="$(basename "${migration_file}")"
  version="${filename%%_*}"
  name="${filename#*_}"
  name="${name%.sql}"
  latest_version="${version}"

  if [[ -n "${applied_version_map[${version}]:-}" ]]; then
    continue
  fi

  echo "Applying ${filename} to ${TEST_SERVER_SUPABASE_DB_CONTAINER}..."
  test_server_supabase_psql < "${migration_file}" >/dev/null
  test_server_supabase_psql -c "
    insert into supabase_migrations.schema_migrations(version, statements, name)
    values ('${version}', '{}'::text[], '${name}')
    on conflict (version) do nothing;
  " >/dev/null
  applied_count=$((applied_count + 1))
done

db_latest_version="$(
  test_server_supabase_psql -At -c "
    select version
    from supabase_migrations.schema_migrations
    order by version desc
    limit 1;
  "
)"

echo "Test-server Supabase migrations are up to date for project ${TEST_SERVER_SUPABASE_PROJECT_ID}."
echo "Database container: ${TEST_SERVER_SUPABASE_DB_CONTAINER}"
echo "Applied this run: ${applied_count}"
echo "Latest repo migration: ${latest_version}"
echo "Latest database migration: ${db_latest_version}"
