#!/usr/bin/env bash
# Verifies PRD SEC-INF-3/4 on the dev stack: role separation and Redis auth.
set -uo pipefail
cd "$(dirname "$0")/.."
dc() { docker compose -f compose.dev.yml "$@"; }
as() { local user=$1 pass=$2 db=$3; shift 3; dc exec -T -e PGPASSWORD="$pass" postgres psql -h localhost -U "$user" -d "$db" -v ON_ERROR_STOP=1 -tAc "$*"; }
fail=0
expect_ok()   { if out=$("$@" 2>&1); then echo "ok      $*"; else echo "FAIL    $* -> $out"; fail=1; fi; }
expect_fail() { if out=$("$@" 2>&1); then echo "FAIL (should be denied) $*"; fail=1; else echo "ok      denied: ${out##*ERROR:  }"; fi; }

for db in mos mos_test; do
  expect_fail as mos_app app-dev "$db" "CREATE TABLE probe_app (x int)"
  expect_ok   as mos_migrator migrator-dev "$db" "CREATE TABLE probe (x int)"
  expect_ok   as mos_app app-dev "$db" "INSERT INTO probe VALUES (1); SELECT count(*) FROM probe"
  expect_fail as mos_app app-dev "$db" "DROP TABLE probe"
  expect_fail as mos_app app-dev "$db" "TRUNCATE probe"
  expect_ok   as mos_migrator migrator-dev "$db" "DROP TABLE probe"
done
expect_fail as mos_app wrong-password mos "SELECT 1"
expect_ok   dc exec -T redis redis-cli -a redis-dev --no-auth-warning ping
if dc exec -T redis redis-cli ping 2>&1 | grep -q NOAUTH; then echo "ok      redis rejects unauthenticated clients"; else echo "FAIL    redis accepted a client without a password"; fail=1; fi
exit $fail
