#!/usr/bin/env bash
# Command-line alternative to the README "Deploy to Cloudflare" button (idempotent; safe to re-run).
#   CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=… RATINGS_TOKEN=… bash scripts/setup-cloudflare.sh [worker-name]
# 1. sets the Worker name (and D1 name <worker>-state) in wrangler.toml when you pass a different name
# 2. builds dist/ and runs `npm run deploy`: wrangler deploy (creates the Worker, provisions the D1 database automatically)
#    + applies migrations/ to it (remote)
# 3. stores RATINGS_TOKEN (the owner passphrase for 打分 / 收藏 / 垃圾箱 / MCP admin) as a Worker secret
# Optional secrets set the same way if present in env: AGENT_WEBHOOK_URL, AGENT_WEBHOOK_KEY, AGENT_WEBHOOK_AUTH.
set -euo pipefail
cd "$(dirname "$0")/.."
NAME=${1:-${NEWSP_WORKER:-newsp}}; DB="$NAME-state"
: "${CLOUDFLARE_API_TOKEN:?need CLOUDFLARE_API_TOKEN (Workers Scripts + D1 edit)}" "${CLOUDFLARE_ACCOUNT_ID:?need CLOUDFLARE_ACCOUNT_ID}"
python3 - "$NAME" "$DB" <<'PY'
import re, sys
n, db = sys.argv[1:]
s = open("wrangler.toml", encoding="utf-8").read()
s = re.sub(r'^name = ".*"$', f'name = "{n}"', s, count=1, flags=re.M)
s = re.sub(r'^database_name = ".*"$', f'database_name = "{db}"', s, count=1, flags=re.M)
open("wrangler.toml", "w", encoding="utf-8").write(s)
PY
echo "✓ wrangler.toml → Worker $NAME / D1 $DB"
[[ -d node_modules/wrangler ]] || npm ci
node scripts/build.mjs | tail -1
npm run --silent deploy
for k in RATINGS_TOKEN AGENT_WEBHOOK_URL AGENT_WEBHOOK_KEY AGENT_WEBHOOK_AUTH; do
  [[ -n ${!k:-} ]] && { printf '%s' "${!k}" | npx wrangler secret put "$k" >/dev/null && echo "✓ secret $k"; }
done
[[ -z ${RATINGS_TOKEN:-} ]] && echo "⚠ RATINGS_TOKEN not set — the owner-only features stay locked until you add it (npx wrangler secret put RATINGS_TOKEN)"
echo "Next: commit wrangler.toml if it changed, then either connect the Worker to your GitHub repo (Settings → Builds; NEWS_DEPLOY=git) or deploy from CI (NEWS_DEPLOY=direct)."
