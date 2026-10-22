#!/usr/bin/env bash
# Push the edition summary to every channel that is configured in env (none configured = no-op). Always exits 0.
#   scripts/notify/notify.sh "<subject>" <body-file>
# Channels: TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID · NOTIFY_WEBHOOK_URL (JSON POST {subject, text}; optional NOTIFY_WEBHOOK_KEY →
# Authorization: Bearer) · BARK_KEY (+ BARK_SERVER) · SERVERCHAN_KEY. More examples: scripts/notify/notify.example.sh.
set -u
SUBJ=${1:-newsp}; BODY=${2:-/dev/null}
D="$(dirname "$0")"
[[ -r "${NEWSP_ENV:-$HOME/.config/newsp/env}" ]] && { set -a; . "${NEWSP_ENV:-$HOME/.config/newsp/env}"; set +a; }
TEXT=$(python3 -c "import sys;print(open(sys.argv[1],encoding='utf-8',errors='replace').read()[-3900:])" "$BODY" 2>/dev/null)
n=0
if [[ -n ${TELEGRAM_BOT_TOKEN:-} && -n ${TELEGRAM_CHAT_ID:-} ]]; then bash "$D/notify-telegram.sh" "$SUBJ" "$BODY"; n=$((n+1)); fi
if [[ -n ${NOTIFY_WEBHOOK_URL:-} ]]; then
  H=(); [[ -n ${NOTIFY_WEBHOOK_KEY:-} ]] && H=(-H "Authorization: Bearer $NOTIFY_WEBHOOK_KEY")
  J=$(python3 -c "import json,sys;print(json.dumps({'subject':sys.argv[1],'text':sys.argv[2]},ensure_ascii=False))" "$SUBJ" "$TEXT")
  curl -fsS -m 20 -o /dev/null "${H[@]+"${H[@]}"}" -H 'content-type: application/json' -d "$J" "$NOTIFY_WEBHOOK_URL" && echo "notify: webhook ok" || echo "notify: webhook failed"
  n=$((n+1))
fi
if [[ -n ${BARK_KEY:-} ]]; then
  curl -fsS -m 20 -o /dev/null "${BARK_SERVER:-https://api.day.app}/$BARK_KEY" --data-urlencode title="$SUBJ" --data-urlencode body="${TEXT:0:1500}" && echo "notify: bark ok" || echo "notify: bark failed"; n=$((n+1))
fi
if [[ -n ${SERVERCHAN_KEY:-} ]]; then
  curl -fsS -m 20 -o /dev/null "https://sctapi.ftqq.com/$SERVERCHAN_KEY.send" --data-urlencode title="$SUBJ" --data-urlencode desp="$TEXT" && echo "notify: serverchan ok" || echo "notify: serverchan failed"; n=$((n+1))
fi
[[ $n == 0 ]] && echo "notify: no channel configured"
exit 0
