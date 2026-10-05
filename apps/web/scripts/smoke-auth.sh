#!/usr/bin/env bash
# Signs in through the test provider and checks the session and route protection.
# Needs: dev stack up, API running, web running with AUTH_TEST_MODE=1.
set -euo pipefail
base=${1:-http://localhost:3000}
jar=$(mktemp)
trap 'rm -f "$jar"' EXIT

anon=$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' "$base/dashboard")
[[ $anon == 307* && $anon == *"/signin?callbackUrl=%2Fdashboard"* ]] || { echo "FAIL anonymous /dashboard -> $anon"; exit 1; }
echo "ok   anonymous /dashboard redirects to /signin"

csrf=$(curl -s -c "$jar" "$base/api/auth/csrf" \
  | node -e 'let s="";process.stdin.on("data",(d)=>(s+=d)).on("end",()=>console.log(JSON.parse(s).csrfToken))')
curl -s -b "$jar" -c "$jar" -o /dev/null -X POST "$base/api/auth/callback/test" \
  --data-urlencode "csrfToken=$csrf" --data-urlencode "login=smoke-user" --data-urlencode "callbackUrl=$base/dashboard"

session=$(curl -s -b "$jar" "$base/api/auth/session")
echo "$session" | grep -q '"login":"smoke-user"' || { echo "FAIL session: $session"; exit 1; }
echo "$session" | grep -q '"id":"c' || { echo "FAIL session has no API user id: $session"; exit 1; }
echo "ok   session contains the synced API user"

page=$(curl -s -b "$jar" "$base/dashboard")
echo "$page" | grep -q 'data-testid="current-user">smoke-user<' || { echo "FAIL dashboard did not render for the user"; exit 1; }
echo "ok   dashboard renders for the signed-in user"
