#!/usr/bin/env bash
set -euo pipefail

BE=${BE_BASE_URL:-http://74.226.48.15:8002}
MONTH=${MONTH:-4}

red() { printf "\033[31m%s\033[0m\n" "$*"; }
grn() { printf "\033[32m%s\033[0m\n" "$*"; }
yel() { printf "\033[33m%s\033[0m\n" "$*"; }

req() {
  local method=$1; shift
  local path=$1; shift
  local data=${1:-}
  local auth=${AUTH:-}

  local url="$BE$path"
  local code
  if [[ -n "$data" ]]; then
    code=$(curl -sS -o /tmp/resp.json -w "%{http_code}" -X "$method" "$url" \
      -H 'Content-Type: application/json' \
      ${auth:+-H "Authorization: Bearer $auth"} \
      -d "$data" || true)
  else
    code=$(curl -sS -o /tmp/resp.json -w "%{http_code}" -X "$method" "$url" \
      ${auth:+-H "Authorization: Bearer $auth"} || true)
  fi
  echo "$code" >/tmp/last_code
}

json() { cat /tmp/resp.json 2>/dev/null || true; }

extract_token() {
  python3 - <<'PY'
import json
p='/tmp/resp.json'
try:
  d=json.load(open(p))
except Exception:
  print('')
  raise SystemExit(0)
for k in ['access_token','token','jwt']:
  if k in d and isinstance(d[k], str) and d[k]:
    print(d[k]); raise SystemExit(0)
# sometimes nested
for k in ['data']:
  if k in d and isinstance(d[k], dict):
    for kk in ['access_token','token','jwt']:
      v=d[k].get(kk)
      if isinstance(v,str) and v:
        print(v); raise SystemExit(0)
print('')
PY
}

step() { echo; echo "== $*"; }

# 12 /health (no auth)
step "12. GET /health"
req GET /health
CODE=$(cat /tmp/last_code)
echo "HTTP $CODE"

# 1 admin login
step "1. POST /api/auth/login (admin)"
req POST /api/auth/login '{"username":"admin","password":"admin123"}'
CODE=$(cat /tmp/last_code)
echo "HTTP $CODE"
ADMIN_TOKEN=$(extract_token || true)
if [[ -n "${ADMIN_TOKEN:-}" ]]; then grn "admin token ok"; else yel "admin token missing (check response)"; fi

# 2 test user login
step "2. POST /api/auth/test-login (uid_001)"
req POST /api/auth/test-login '{"username":"uid_001","password":"test123"}'
CODE=$(cat /tmp/last_code)
echo "HTTP $CODE"
USER_TOKEN=$(extract_token || true)
if [[ -n "${USER_TOKEN:-}" ]]; then grn "user token ok"; else yel "user token missing (check response)"; fi

# 3 wrong password
step "3. POST /api/auth/login wrong password"
req POST /api/auth/login '{"username":"admin","password":"wrong"}'
CODE=$(cat /tmp/last_code)
echo "HTTP $CODE"

# 18 unauthorized personal
step "18. GET /api/metrics/summary (no token)"
unset AUTH || true
req GET /api/metrics/summary
CODE=$(cat /tmp/last_code)
echo "HTTP $CODE"

# personal endpoints
AUTH=${USER_TOKEN:-}
step "4. GET /api/metrics/summary (uid_001 token)"
req GET /api/metrics/summary
CODE=$(cat /tmp/last_code)
echo "HTTP $CODE"

step "5. GET /api/metrics/trend?range=7d"
req GET "/api/metrics/trend?range=7d"
CODE=$(cat /tmp/last_code)
echo "HTTP $CODE"

step "6. GET /api/metrics/detail"
req GET /api/metrics/detail
CODE=$(cat /tmp/last_code)
echo "HTTP $CODE"

step "7. GET /api/metrics/model-distribution"
req GET /api/metrics/model-distribution
CODE=$(cat /tmp/last_code)
echo "HTTP $CODE"

# admin endpoints
AUTH=${ADMIN_TOKEN:-}
step "8. GET /api/admin/users?month=$MONTH"
req GET "/api/admin/users?month=$MONTH"
CODE=$(cat /tmp/last_code)
echo "HTTP $CODE"

step "9. GET /api/admin/departments?month=$MONTH"
req GET "/api/admin/departments?month=$MONTH"
CODE=$(cat /tmp/last_code)
echo "HTTP $CODE"

step "10. GET /api/admin/quota-levels"
req GET /api/admin/quota-levels
CODE=$(cat /tmp/last_code)
echo "HTTP $CODE"

step "11. GET /api/admin/leaderboard"
req GET /api/admin/leaderboard
CODE=$(cat /tmp/last_code)
echo "HTTP $CODE"

# email template endpoints
step "13. GET /api/admin/email-template"
req GET /api/admin/email-template
CODE=$(cat /tmp/last_code)
echo "HTTP $CODE"

step "14. GET /api/admin/email-template/variables"
req GET /api/admin/email-template/variables
CODE=$(cat /tmp/last_code)
echo "HTTP $CODE"

step "15. POST /api/admin/email-template/preview"
req POST /api/admin/email-template/preview '{"subject":"Hello {{username}}","body_html":"<p>Dear {{username}}, your token usage is {{monthly_token}}.</p>","sample":true}'
CODE=$(cat /tmp/last_code)
echo "HTTP $CODE"

step "16. PUT /api/admin/email-template"
req PUT /api/admin/email-template '{"subject":"QA Test {{username}}","body_html":"<p>Hello {{username}}, token: {{monthly_token}}</p>"}'
CODE=$(cat /tmp/last_code)
echo "HTTP $CODE"

# permission check
AUTH=${USER_TOKEN:-}
step "17. uid_001 token access /api/admin/users should be 403"
req GET "/api/admin/users?month=$MONTH"
CODE=$(cat /tmp/last_code)
echo "HTTP $CODE"

step "DONE"
