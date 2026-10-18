#!/usr/bin/env bash
# Runs supabase/schema.sql + its tests against a throw-away local PostgreSQL cluster.
# Requires PostgreSQL server binaries (initdb, pg_ctl, psql). Does NOT need Supabase.
#   usage: scripts/test-schema.sh
set -euo pipefail
cd "$(dirname "$0")/.."

PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
[ -x "$PGBIN/initdb" ] || { echo "PostgreSQL server binaries not found. Set PGBIN=/path/to/postgres/bin"; exit 2; }

WORK="$(mktemp -d)"
PORT="${PGPORT_TEST:-54329}"
RUN_AS=()
if [ "$(id -u)" = "0" ]; then            # postgres refuses to run as root
  chown -R postgres:postgres "$WORK"
  RUN_AS=(su postgres -c)
fi
run() { if [ ${#RUN_AS[@]} -gt 0 ]; then "${RUN_AS[@]}" "$*"; else bash -c "$*"; fi; }

cleanup() { run "$PGBIN/pg_ctl -D $WORK/data stop -m immediate >/dev/null 2>&1 || true"; rm -rf "$WORK"; }
trap cleanup EXIT

run "$PGBIN/initdb -D $WORK/data -A trust >/dev/null"
run "$PGBIN/pg_ctl -D $WORK/data -o '-p $PORT -k $WORK -c listen_addresses=' -l $WORK/log -w start >/dev/null"

PSQL=(psql -h "$WORK" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -X -q)
"${PSQL[@]}" -f supabase/tests/00-supabase-stub.sql
echo "== applying schema.sql"
"${PSQL[@]}" -f supabase/schema.sql
echo "== applying schema.sql a second time (must be re-runnable)"
"${PSQL[@]}" -f supabase/schema.sql
echo "== running tests"
"${PSQL[@]}" -f supabase/tests/10-schema-tests.sql 2>&1 \
  | sed -e 's/^psql:[^:]*:[0-9]*: //' -e 's/^NOTICE:  //' | grep -v -E '^\s*$|does not exist, skipping'
