#!/usr/bin/env bash
#
# Removes every row written by the real-browser suites.
#
# The Playwright specs create flags through the public API on every run
# (`smoke_*` from smoke.spec.ts and `smoke_core_*` from core-flow.spec.ts).
# Flags cascade their rules, but audit_logs deliberately keeps working when a
# flag is gone, so both tables are cleaned explicitly. Demo seed rows never
# match the prefix and are left untouched.
#
# Usage:
#   make e2e-clean                      # against the Compose postgres container
#   E2E_PG_CONTAINER=my-pg make e2e-clean
#   E2E_USE_LOCAL=1 make e2e-clean      # against local psql (PG* env variables)
#
set -euo pipefail

CONTAINER="${E2E_PG_CONTAINER:-feature-flag-postgres}"
DB="${E2E_PG_DB:-feature_flag_db}"
USER="${E2E_PG_USER:-postgres}"

read -r -d '' CLEANUP_SQL <<'SQL' || true
\echo 'before:'
SELECT 'flags' AS table_name, count(*) FROM flags WHERE key LIKE 'smoke\_%'
UNION ALL
SELECT 'audit_logs', count(*) FROM audit_logs WHERE flag_key LIKE 'smoke\_%';

DELETE FROM audit_logs WHERE flag_key LIKE 'smoke\_%';
DELETE FROM flags WHERE key LIKE 'smoke\_%';

\echo 'after:'
SELECT 'flags' AS table_name, count(*) FROM flags WHERE key LIKE 'smoke\_%'
UNION ALL
SELECT 'audit_logs', count(*) FROM audit_logs WHERE flag_key LIKE 'smoke\_%';
SQL

if [[ "${E2E_USE_LOCAL:-0}" == "1" ]]; then
  psql -v ON_ERROR_STOP=1 -d "$DB" -U "$USER" <<<"$CLEANUP_SQL"
elif docker inspect "$CONTAINER" >/dev/null 2>&1; then
  docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -U "$USER" -d "$DB" <<<"$CLEANUP_SQL"
else
  echo "No PostgreSQL source found: container '$CONTAINER' is not running." >&2
  echo "Start the stack with 'docker compose up -d', or set E2E_USE_LOCAL=1." >&2
  exit 1
fi

echo "E2E rows removed; demo seed data is untouched."
