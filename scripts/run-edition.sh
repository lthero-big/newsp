#!/usr/bin/env bash
# One edition run, end to end: collect/score/dedupe/learn → Chinese copy → build → tests → (publish|preview) → summary.
# Runs the same from cron, Docker or GitHub Actions; no agent involved.
#
#   scripts/run-edition.sh am|pm [--publish | --preview edition/<x>] [--replay <run-dir>] [--tests quick|suite|full|none]
#
# Flags: --publish            production publish (publish.sh, SKIP_DAILY=1)
#        --preview <branch>   commit + push to an edition/* branch (Cloudflare preview), never main; implies no source-status push
#        --replay <run-dir>   re-score a saved run (raw.json + stats.json, original window end) instead of fetching again
#        --tests quick|suite|full|none   quick (default) = mobile-layout + invariants on 2 themes × 390/1440 · suite = all themes ·
#                             full = suite + editions.mjs --only ed. NEWS_FULL_TESTS=1 turns quick into suite.
# Chinese copy (env NEWS_LLM): key (default) = scripts/llm.py with NEWS_LLM_PROVIDER/MODEL/API_KEY[/BASE_URL] ·
#   off = no Chinese copy (cards show original titles). A file var/llm/DISABLED also means off.
# X (env NEWS_X): rsshub (default when RSSHUB_BASE is set) = scripts/collect/x_standby.py — RSSHub account timelines + keyword
#   searches + rule filter + one LLM relevance pass (NEWS_X_SCORE=0 turns that off) · off (default otherwise) = no X ·
#   NEWS_X_ITEMS=<file> uses a ready x-items file instead.
set -Eeuo pipefail
trap 'echo "✗ run-edition.sh line $LINENO: $BASH_COMMAND" >&2' ERR
cd "$(dirname "$0")/.."
[[ -d "$HOME/.local/node22/bin" ]] && export PATH="$HOME/.local/node22/bin:$PATH"
ENVF=${NEWSP_ENV:-$HOME/.config/newsp/env}; [[ -r "$ENVF" ]] && { set -a; . "$ENVF"; set +a; }   # never printed
RUNK=${1:?usage: scripts/run-edition.sh am|pm [--publish|--preview <branch>] [--replay DIR] [--tests quick|full|none]}; shift
[[ $RUNK == am || $RUNK == pm ]] || { echo "first arg must be am or pm" >&2; exit 2; }
DATE=${NEWS_DATE:-$(TZ=Asia/Shanghai date +%F)}
MODE=${NEWS_LLM:-key}; [[ -f var/llm/DISABLED && $MODE == key ]] && { echo "var/llm/DISABLED → NEWS_LLM=off"; MODE=off; }
XMODE=${NEWS_X:-$([[ -n ${RSSHUB_BASE:-} ]] && echo rsshub || echo off)}
PUBLISH=0 PREVIEW="" REPLAY="" TESTS=quick
while [[ $# -gt 0 ]]; do case $1 in
  --publish) PUBLISH=1;; --preview) PREVIEW=${2:?branch}; shift;; --replay) REPLAY=${2:?dir}; shift;;
  --tests) TESTS=${2:?}; shift;; *) echo "unknown arg $1" >&2; exit 2;; esac; shift; done
[[ -n $PREVIEW && $PUBLISH == 1 ]] && { echo "--preview and --publish are exclusive" >&2; exit 2; }
if [[ -n $PREVIEW ]]; then
  [[ $PREVIEW == edition/* ]] || { echo "preview branch must be edition/* (only those build previews)" >&2; exit 2; }
  export NEWS_NO_PUSH=1
fi
SUF=$RUNK; INC=()
if [[ $RUNK == pm ]]; then
  NEWS_RUN=${NEWS_RUN:-$( [[ $(TZ=Asia/Shanghai date +%H) -ge 17 ]] && echo 20:00 || echo 15:00 )}; export NEWS_RUN
  [[ $NEWS_RUN != 15:00 ]] && SUF="pm-${NEWS_RUN//:/}"
  INC=(--incremental)
fi
mkdir -p var/llm var/x-items var/x-rsshub var/logs
T0=$(date +%s); step() { echo "── $* ($(( $(date +%s) - T0 ))s)"; }

# ① X (optional): RSSHub, or a ready items file
XOUT="var/x-items/$DATE.json"; [[ $RUNK == pm ]] && XOUT="var/x-items/$DATE-$SUF.json"
if [[ -n "${NEWS_X_ITEMS:-}" ]]; then step "X：用现成文件 $NEWS_X_ITEMS"
elif [[ $XMODE == rsshub ]]; then
  step "X：RSSHub 账号 + 关键词"; node scripts/sync-state.mjs >/dev/null || true
  xs=(--out "$XOUT" --date "$DATE" --hours "${NEWS_X_HOURS:-$([[ $RUNK == am ]] && echo 26 || echo 12)}"); [[ ${NEWS_X_SCORE:-1} == 1 ]] && xs+=(--score)
  python3 scripts/collect/x_standby.py "${xs[@]}" || echo "  x_standby 失败，这期没有 X"
elif [[ $XMODE == off ]]; then step "X：关闭（NEWS_X=off 或未配置 RSSHUB_BASE）"
else echo "NEWS_X must be rsshub|off" >&2; exit 2; fi

# ② collect → rules → fill → validate → build → todo export
step "抓取 + 打分 + 去重 + 学习（daily.sh）"
gen=(); [[ -n $REPLAY ]] && gen=(--from-raw "$REPLAY" --end "$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['window']['end'])" "data/$DATE.json")")
bash scripts/daily.sh "$DATE" "${INC[@]+"${INC[@]}"}" "${gen[@]+"${gen[@]}"}"

# ③ Chinese copy
case $MODE in
  key)  step "中文文案（scripts/llm.py）"
        if python3 scripts/llm.py "$DATE" --run "$RUNK"; then :; else echo "  ⚠ llm.py 没写全，缺的卡片显示原标题"; fi
        [[ -s "var/titles/$DATE.key.json" ]] && { python3 scripts/titles.py import "$DATE" "var/titles/$DATE.key.json" || true; } ;;
  off)  step "NEWS_LLM=off：不写中文文案" ;;
  *) echo "NEWS_LLM must be key|off" >&2; exit 2 ;;
esac

# ④ build + tests
step "构建"; node scripts/build.mjs | tail -1
TRES=skipped; FAIL=0
if [[ $TESTS != none ]]; then
  [[ $TESTS == quick && ${NEWS_FULL_TESTS:-0} == 1 ]] && TESTS=suite
  SM=(); TRES=""; [[ $TESTS == quick ]] && { SM=(NEWS_TEST_SMOKE=1 INV_SMOKE=1); TRES="快检 "; }
  step "测试（$TESTS）"; T1=$(date +%s)
  if env "${SM[@]+"${SM[@]}"}" node tests/mobile-layout.mjs > var/logs/mobile-$DATE-$SUF.log 2>&1; then TRES+="mobile ✓"; else TRES+="mobile ✗"; FAIL=1; fi
  if env "${SM[@]+"${SM[@]}"}" node tests/invariants.mjs > var/logs/inv-$DATE-$SUF.log 2>&1; then TRES+=" · invariants ✓"; else TRES+=" · invariants ✗"; FAIL=1; fi
  if [[ $TESTS == full ]]; then
    if node tests/editions.mjs --only ed > var/logs/ed-$DATE-$SUF.log 2>&1; then TRES+=" · editions ✓"; else TRES+=" · editions ✗"; FAIL=1; fi
  fi
  [[ $TESTS == quick ]] && TRES+="（2 主题 × 390/1440，$(( $(date +%s) - T1 ))s；全量 NEWS_FULL_TESTS=1）"
  [[ $FAIL == 1 ]] && TRES+="（日志 var/logs/*-$DATE-$SUF.log）"
fi

# ⑤ ship
URL=""
if [[ $PUBLISH == 1 ]]; then
  [[ $FAIL == 1 ]] && { echo "✗ tests failed — not publishing"; python3 scripts/edition-summary.py "$DATE" "$RUNK" "$MODE" "$TRES"; exit 1; }
  step "发布"; SKIP_DAILY=1 SKIP_MOBILE_CHECK=1 bash scripts/publish.sh "$DATE" "${INC[@]+"${INC[@]}"}"
elif [[ -n $PREVIEW ]]; then
  [[ $(git rev-parse --abbrev-ref HEAD) == main ]] && { echo "refusing preview from main checkout" >&2; exit 2; }
  step "预览分支 $PREVIEW"
  if git ls-files -co --exclude-standard | grep -E '(^|/)\.dev\.vars$|\.env$|(^|/)env$'; then echo "refusing: secret-like file"; exit 1; fi
  git add data lib/catalog.js && { git diff --cached --quiet || git commit -qm "preview: $DATE $RUNK (NEWS_LLM=$MODE)"; }
  SHA=$(git rev-parse HEAD); git push -qf origin "HEAD:refs/heads/$PREVIEW"
  ALIAS=$(echo "$PREVIEW" | tr 'A-Z' 'a-z' | sed -E 's/[^a-z0-9]+/-/g; s/^-|-$//g' | cut -c1-28 | sed -E 's/-$//')
  URL="https://$ALIAS.${CF_PAGES_PROJECT:-newsp}.pages.dev"
  ok=0; for i in $(seq 1 60); do curl -fsS "$URL/build.txt?t=$(date +%s)" 2>/dev/null | grep -q "commit $SHA" && { ok=1; break; }; sleep 10; done
  [[ $ok == 1 ]] && echo "✓ preview: $URL (${SHA:0:7})" || echo "⚠ preview not at ${SHA:0:7} after 10 min — check Cloudflare deployments ($URL)"
  URL="$URL/${DATE:0:4}/${DATE:5:2}/$DATE"
else step "不发布（没有 --publish / --preview）"; URL="file://$PWD/dist/index.html"; fi

echo; echo "════ 摘要（$(( $(date +%s) - T0 ))s）"
python3 scripts/edition-summary.py "$DATE" "$RUNK" "$MODE" "$TRES" ${URL:+"$URL"}
