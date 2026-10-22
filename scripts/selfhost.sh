#!/usr/bin/env bash
# Self-hosted entry (cron, systemd timer or the Docker image): sync the checkout, run one edition, publish, notify.
#   scripts/selfhost.sh am|pm [run-edition flags]      e.g. scripts/selfhost.sh pm   (NEWS_RUN=20:00 for the evening run)
# Config: ${NEWSP_ENV:-~/.config/newsp/env} (same variables as the GitHub Actions secrets, see README). The checkout must be able
# to `git push` to your repo (SSH deploy key or a token in the remote URL). Don't run this and the Actions schedule at the same
# time for the same repo — pick one, or use this as a fallback that only runs when Actions is disabled.
set -Eeuo pipefail
cd "$(dirname "$0")/.."
RUNK=${1:?usage: scripts/selfhost.sh am|pm [flags]}; shift
ENVF=${NEWSP_ENV:-$HOME/.config/newsp/env}; [[ -r "$ENVF" ]] && { set -a; . "$ENVF"; set +a; }
mkdir -p var/logs
exec 9>var/.selfhost.lock; flock -n 9 || { echo "another edition is running"; exit 0; }
git pull -q --rebase origin main
[[ -d node_modules ]] || npm ci --silent
LOG="var/logs/selfhost-$(TZ=Asia/Shanghai date +%F)-$RUNK.log"
T0=$(date +%s)
if PUBLISH_REBASE=1 bash scripts/run-edition.sh "$RUNK" --publish --tests "${NEWS_TESTS:-none}" "$@" 2>&1 | tee "$LOG"; then
  bash scripts/notify/notify.sh "newsp $(TZ=Asia/Shanghai date +%F) $RUNK ($(( $(date +%s) - T0 ))s)" "$LOG"
else
  bash scripts/notify/notify.sh "newsp $RUNK 失败" "$LOG"; exit 1
fi
