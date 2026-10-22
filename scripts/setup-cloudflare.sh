#!/usr/bin/env bash
# One-time Cloudflare setup for your own newsp copy (idempotent; safe to re-run).
#   CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=… RATINGS_TOKEN=… bash scripts/setup-cloudflare.sh [project-name]
# 1. creates the D1 database <project>-state (or reuses it) and writes its id into wrangler.toml
# 2. applies migrations/ to it (remote)
# 3. creates the Pages project <project> (production branch main) if missing
# 4. stores RATINGS_TOKEN (the owner passphrase for 打分 / 收藏 / 垃圾箱 / MCP admin) as a Pages secret
# Optional secrets set the same way if present in env: AGENT_WEBHOOK_URL, AGENT_WEBHOOK_KEY, AGENT_WEBHOOK_AUTH.
set -euo pipefail
cd "$(dirname "$0")/.."
PROJECT=${1:-${CF_PAGES_PROJECT:-newsp}}; DB="$PROJECT-state"
: "${CLOUDFLARE_API_TOKEN:?need CLOUDFLARE_API_TOKEN (Pages + D1 edit)}" "${CLOUDFLARE_ACCOUNT_ID:?need CLOUDFLARE_ACCOUNT_ID}"
W="npx --yes wrangler"
id=$($W d1 list --json 2>/dev/null | python3 -c "import json,sys;print(next((d['uuid'] for d in json.load(sys.stdin) if d['name']==sys.argv[1]),''))" "$DB")
if [[ -z $id ]]; then
  $W d1 create "$DB" >/dev/null
  id=$($W d1 list --json | python3 -c "import json,sys;print(next(d['uuid'] for d in json.load(sys.stdin) if d['name']==sys.argv[1]))" "$DB")
  echo "✓ D1 $DB created"
else echo "· D1 $DB exists"; fi
python3 - "$PROJECT" "$DB" "$id" <<'PY'
import re, sys
p, db, i = sys.argv[1:]
s = open("wrangler.toml", encoding="utf-8").read()
s = re.sub(r'^name = ".*"$', f'name = "{p}"', s, count=1, flags=re.M)
s = re.sub(r'^database_name = ".*"$', f'database_name = "{db}"', s, count=1, flags=re.M)
s = re.sub(r'^database_id = ".*"$', f'database_id = "{i}"', s, count=1, flags=re.M)
open("wrangler.toml", "w", encoding="utf-8").write(s)
PY
echo "✓ wrangler.toml → $PROJECT / $DB"
$W d1 migrations apply "$DB" --remote
$W pages project list 2>/dev/null | grep -qw "$PROJECT" && echo "· Pages project $PROJECT exists" || { $W pages project create "$PROJECT" --production-branch main; echo "✓ Pages project $PROJECT created"; }
for k in RATINGS_TOKEN AGENT_WEBHOOK_URL AGENT_WEBHOOK_KEY AGENT_WEBHOOK_AUTH; do
  [[ -n ${!k:-} ]] && { printf '%s' "${!k}" | $W pages secret put "$k" --project-name "$PROJECT" >/dev/null && echo "✓ secret $k"; }
done
[[ -z ${RATINGS_TOKEN:-} ]] && echo "⚠ RATINGS_TOKEN not set — the owner-only features stay locked until you add it (wrangler pages secret put RATINGS_TOKEN)"
echo "Next: commit wrangler.toml, then either connect the Pages project to your GitHub repo (NEWS_DEPLOY=git) or deploy from CI (NEWS_DEPLOY=direct)."
