#!/usr/bin/env bash
# Telegram channel for scripts/notify/notify.sh (env TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID).
# Called as: notify.sh <subject> <body-file>. Sends the body as plain text (no parse_mode, so nothing needs escaping), ≤3900 chars.
# Only sendMessage is used (never getUpdates / setWebhook: another program consumes this bot's updates). Always exits 0.
set -u
BODY=${2:-/dev/null}
set -a; . "${NEWSP_ENV:-$HOME/.config/newsp/env}" 2>/dev/null; set +a
if [[ -z ${TELEGRAM_BOT_TOKEN:-} || -z ${TELEGRAM_CHAT_ID:-} ]]; then echo "notify: TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID missing"; exit 0; fi
TEXT=$(python3 -c "import sys;print(open(sys.argv[1],encoding='utf-8',errors='replace').read()[:3900])" "$BODY" 2>/dev/null)
R=$(curl -sS -m 20 "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" -d chat_id="$TELEGRAM_CHAT_ID" \
  -d disable_web_page_preview=true --data-urlencode text="$TEXT" 2>&1 | sed "s/${TELEGRAM_BOT_TOKEN}/***/g")
if [[ $R == *'"ok":true'* ]]; then echo "notify: telegram ok=true"; else echo "notify: telegram failed: ${R:0:200}"; fi
exit 0
