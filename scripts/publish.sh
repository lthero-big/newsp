#!/usr/bin/env bash
# Usage: scripts/publish.sh YYYY-MM-DD [--incremental]
# daily (collect→validate→build) -> commit data + push main -> deploy to Cloudflare Pages, one of:
#   NEWS_DEPLOY=git (default)  the Pages project is connected to this GitHub repo and builds `npm run build` itself;
#                              we wait until $NEWS_SITE/build.txt shows the pushed commit.
#   NEWS_DEPLOY=direct         `wrangler pages deploy dist` (Functions + D1 binding from wrangler.toml) — needs
#                              CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID; no Git integration needed.
#   NEWS_DEPLOY=none           commit + push only.
# Optional backup of dist/: set PAGES_REPO (a git remote) and the built tree is pushed there (same layout as dist/).
set -euo pipefail
cd "$(dirname "$0")/.."
DATE="${1:?usage: scripts/publish.sh YYYY-MM-DD [--incremental]}"; shift || true
PAGES_DIR="${PAGES_DIR:-$HOME/.cache/newsp-pages}"
PAGES_REPO="${PAGES_REPO:-}"
[[ -d "$HOME/.local/node22/bin" ]] && export PATH="$HOME/.local/node22/bin:$PATH"
# secrets/config outside git (never committed): NEWS_SITE, RATINGS_TOKEN, LLM / RSSHub keys (see README)
[[ -f "${NEWSP_ENV:-$HOME/.config/newsp/env}" ]] && set -a && . "${NEWSP_ENV:-$HOME/.config/newsp/env}" && set +a

if [[ "${SKIP_DAILY:-0}" == 1 ]]; then node scripts/sync-state.mjs; node scripts/build.mjs; else bash scripts/daily.sh "$DATE" "$@"; fi

# Pre-push gate: mobile layout (cards full-width, no h-scroll at 360/390/412, every theme). Needs Chrome on the box.
if [[ "${SKIP_MOBILE_CHECK:-0}" != 1 ]]; then
  if [[ -x "${CHROME:-/usr/bin/google-chrome}" && -f "${PLAYWRIGHT_CORE:-/node_modules/playwright-core/index.mjs}" ]]; then
    node tests/mobile-layout.mjs || { echo "✗ mobile-layout check failed — not pushing (SKIP_MOBILE_CHECK=1 to override)"; exit 1; }
  else echo "⚠ Chrome/playwright-core missing — skipping mobile-layout check"; fi
fi

# cross-edition dedupe index (committed): every published card URL + linked content URL
if [[ -f "data/$DATE.json" ]]; then python3 scripts/collect/linkdates.py update "data/$DATE.json"; else echo "· no data/$DATE.json (code-only publish) — seen-links unchanged"; fi

if git ls-files -co --exclude-standard | grep -E '(^|/)\.dev\.vars$|\.env$|(^|/)env$' ; then echo "refusing: secret-like file staged"; exit 1; fi
git add -A
git diff --cached --quiet || git commit -qm "${PUBLISH_MSG:-daily: $DATE}"
# PUBLISH_REBASE=1 (server standby): someone else may have pushed main meanwhile — rebase onto it first (a conflict aborts the publish)
[[ "${PUBLISH_REBASE:-0}" == 1 ]] && git pull -q --rebase origin main
[[ "${NEWS_NO_GIT_PUSH:-0}" == 1 ]] || git push -q origin HEAD:main
SHA=$(git rev-parse HEAD)
case "${NEWS_DEPLOY:-git}" in
  git)
    SITE_URL="${NEWS_SITE:?set NEWS_SITE (e.g. https://news.example.com)}"
    echo "waiting for Cloudflare Git build of ${SHA:0:7} ..."
    ok=0; for i in $(seq 1 60); do
      if curl -fsS -A "newsp-publish" "$SITE_URL/build.txt?t=$(date +%s)" 2>/dev/null | grep -q "commit $SHA"; then ok=1; break; fi; sleep 10
    done
    if [[ $ok == 1 ]]; then echo "✓ live: $SITE_URL/build.txt = ${SHA:0:7}"; else echo "⚠ build.txt not at ${SHA:0:7} after 10 min — check the Cloudflare Pages deployments"; fi ;;
  direct)
    : "${CLOUDFLARE_API_TOKEN:?NEWS_DEPLOY=direct needs CLOUDFLARE_API_TOKEN}" "${CLOUDFLARE_ACCOUNT_ID:?and CLOUDFLARE_ACCOUNT_ID}"
    CF_PAGES_COMMIT_SHA=$SHA CF_PAGES_BRANCH=main node scripts/build.mjs | tail -1
    npx wrangler pages deploy dist --project-name "${CF_PAGES_PROJECT:-newsp}" --branch main --commit-hash "$SHA" --commit-dirty=true ;;
  none) echo "NEWS_DEPLOY=none: pushed, not deployed" ;;
  *) echo "NEWS_DEPLOY must be git|direct|none" >&2; exit 2 ;;
esac

if [[ -n $PAGES_REPO ]]; then
  [[ -d "$PAGES_DIR/.git" ]] || git clone -q "$PAGES_REPO" "$PAGES_DIR"
  git -C "$PAGES_DIR" pull -q --ff-only origin main 2>/dev/null || true
  find "$PAGES_DIR" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
  cp -a dist/. "$PAGES_DIR"/
  git -C "$PAGES_DIR" add -A
  git -C "$PAGES_DIR" diff --cached --quiet || git -C "$PAGES_DIR" commit -qm "build: $DATE ($(git rev-parse --short HEAD))"
  git -C "$PAGES_DIR" push -q origin HEAD:main || echo "⚠ dist backup push failed (publish already done)"
fi
echo "✓ published $DATE"
# mark this run dir as published (daily.sh counts earlier pm runs as "seen" only if published)
if [[ " $* " == *" --incremental "* ]]; then R=${NEWS_RUN:-$( [[ $(TZ=Asia/Shanghai date +%H) -ge 17 ]] && echo 20:00 || echo 15:00 )}; R=${R//:/}; MD="var/runs/$DATE/$([[ $R == 1500 ]] && echo pm || echo "pm-$R")"
else MD="var/runs/$DATE"; fi
[[ -d "$MD" ]] && touch "$MD/.published"
