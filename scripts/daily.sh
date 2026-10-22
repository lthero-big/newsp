#!/usr/bin/env bash
# collect → generate (rules, no AI) → fill → validate → build.   用法：scripts/daily.sh YYYY-MM-DD [--incremental] [--no-bodies]
#   X 条目（可选）：var/x-items/<date>.json 或 env NEWS_X_ITEMS，由 agent 用 X 连接器另行产出：
#     python3 scripts/collect/x_from_connector.py <connector-output>... --out var/x-items/<date>.json
#   沙箱专用：NEWS_COLLECT_FAKEIP_CIDR=198.18.0.0/15（DNS 返回代理 fake-IP 时）
set -Eeuo pipefail
cd "$(dirname "$0")/.."
#   --incremental：15:00 增量。保留 data/<date>.json 里的早间条目不动，只追加新条目（batch=pm），
#     X 优先读 var/x-items/<date>-pm.json。两种模式重复跑都是幂等的（按 URL/标题去重）。
DATE=${1:?用法：scripts/daily.sh YYYY-MM-DD [--incremental] [--no-bodies]}; shift || true
MODE=full; rest=()
for a in "$@"; do if [[ "$a" == --incremental ]]; then MODE=incremental; else rest+=("$a"); fi; done
set -- "${rest[@]+"${rest[@]}"}"
[[ "$DATE" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || { echo "bad date" >&2; exit 2; }
RUN="var/runs/$DATE"; mkdir -p "$RUN" data
X_ITEMS=${NEWS_X_ITEMS:-"var/x-items/$DATE.json"}
if [[ $MODE == incremental ]]; then
  [[ -f "data/$DATE.json" ]] || { echo "增量模式需要先有 data/$DATE.json（先跑早间完整模式）" >&2; exit 2; }
  # NEWS_RUN=15:00 (default) | 20:00 …: each incremental run gets its own dir + X file, earlier runs are dedupe sources
  NEWS_RUN=${NEWS_RUN:-$( [[ $(TZ=Asia/Shanghai date +%H) -ge 17 ]] && echo 20:00 || echo 15:00 )}; RUNTAG=$(echo "$NEWS_RUN" | tr -d :); SUF=$([[ $RUNTAG == 1500 ]] && echo pm || echo "pm-$RUNTAG")
  [[ -z "${NEWS_X_ITEMS:-}" && -f "var/x-items/$DATE-$SUF.json" ]] && X_ITEMS="var/x-items/$DATE-$SUF.json"
  RUN="$RUN/$SUF"; mkdir -p "$RUN"
fi

. scripts/lib-runs.sh   # run_published: which earlier pm runs count as "already seen"
echo "[1/5] Arena 榜单"
if [[ $MODE == incremental ]]; then echo "  增量模式沿用早间榜单"; else
previous=$(ls data/????-??-??.json 2>/dev/null | awk -v d="data/$DATE.json" '$0 < d' | tail -n 1 || true)
args=(--out "$RUN/arena.json"); [[ -n "$previous" ]] && args+=(--previous "$previous")
python3 scripts/arena-top.py "${args[@]}" >/dev/null || echo "  Arena 全部失败，继续"
fi

[[ -z "${RATINGS_TOKEN:-}" && -r "${NEWSP_ENV:-$HOME/.config/newsp/env}" ]] && { set -a; . "${NEWSP_ENV:-$HOME/.config/newsp/env}"; set +a; }
node scripts/sync-state.mjs   # 主人反馈（垃圾箱 / 收藏）→ var/state/feedback.json，用于降权与隐藏
echo "[2/5] 抓取 + 规则打分"
gen=(python3 scripts/collect/generate.py --date "$DATE" --out "$RUN/generated.json" --arena "$RUN/arena.json" --raw-dir "$RUN" --base "data/$DATE.json" "$@")
# 增量：早间（及此前 15:00）抓到过但没入选的条目不算"新增"
if [[ $MODE == incremental ]]; then gen+=(--incremental --seen-raw "var/runs/$DATE/raw.json"); for r in var/runs/$DATE/pm*/raw.json; do [[ -f $r && $(dirname "$r") != "$RUN" ]] && run_published "$(dirname "$r")" && gen+=(--seen-raw "$r"); done; gen+=(--run "${NEWS_RUN:-15:00}"); fi
if [[ -f "$X_ITEMS" ]]; then gen+=(--x-items "$X_ITEMS"); else echo "  没有 $X_ITEMS，跳过 X"; fi
"${gen[@]}"
[[ "${NEWS_NO_PUSH:-0}" == 1 ]] && echo "  NEWS_NO_PUSH=1：不推送信息源状态" || node scripts/push-source-status.mjs "$RUN" "${X_ITEMS:-}" || true   # 每个源本次抓取 / 入选条数 → /sources 页

echo "[3/5] 机械补全"; node scripts/fill.mjs "$RUN/generated.json" "$RUN/daily.json"
echo "[4/5] 校验"; node scripts/validate.mjs "$RUN/daily.json"
cp "$RUN/daily.json" "data/$DATE.json"
node scripts/render-markdown.mjs "data/$DATE.json" "$RUN/daily.md"
echo "[5/5] 构建（每周版本已冻结在 editions/，不再从 design-daily 取组件 / 主题）"
node scripts/build.mjs
# 中文标题：导出待写清单（scripts/llm.py 读它，titles.py import 后再 build 一次）
python3 scripts/titles.py export "$DATE"
