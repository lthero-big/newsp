#!/usr/bin/env bash
# More notify channels (copy a block into your own hook). The built-in ones are in scripts/notify/notify.sh.
# Called as: notify.sh "<subject>" <body-file>. Put credentials in "${NEWSP_ENV:-$HOME/.config/newsp/env}" (600), never in this file.
# Pick ONE block and uncomment it. Nothing here is enabled by default.
set -euo pipefail
SUBJ=$1; BODY=$2
set -a; . "${NEWSP_ENV:-$HOME/.config/newsp/env}"; set +a

# 1) Telegram bot — in use: scripts/notify/notify-telegram.sh (env TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID). Minimal form —
#    env: TG_BOT_TOKEN, TG_CHAT_ID (create a bot with @BotFather, send it /start, read chat id via getUpdates)
# curl -fsS -m 20 "https://api.telegram.org/bot$TG_BOT_TOKEN/sendMessage" -d chat_id="$TG_CHAT_ID" \
#   --data-urlencode text="$(head -c 3500 "$BODY")" >/dev/null

# 2) Email over SMTP (e.g. Gmail app password) — env: SMTP_URL (smtps://smtp.gmail.com:465), SMTP_USER, SMTP_PASS, MAIL_TO
# { printf 'From: %s\nTo: %s\nSubject: %s\nContent-Type: text/plain; charset=utf-8\n\n' "$SMTP_USER" "$MAIL_TO" "$SUBJ"; cat "$BODY"; } |
#   curl -fsS -m 30 --ssl-reqd --url "$SMTP_URL" --user "$SMTP_USER:$SMTP_PASS" --mail-from "$SMTP_USER" --mail-rcpt "$MAIL_TO" -T - >/dev/null

# 3) Bark (iOS push) — env: BARK_KEY (from the Bark app), optional BARK_SERVER (default https://api.day.app)
# curl -fsS -m 20 "${BARK_SERVER:-https://api.day.app}/$BARK_KEY" --data-urlencode title="$SUBJ" --data-urlencode body="$(head -c 1500 "$BODY")" >/dev/null

# 4) ServerChan (WeChat) — env: SERVERCHAN_KEY (SendKey from sct.ftqq.com)
# curl -fsS -m 20 "https://sctapi.ftqq.com/$SERVERCHAN_KEY.send" --data-urlencode title="$SUBJ" --data-urlencode desp="$(cat "$BODY")" >/dev/null

echo "notify.example.sh: no channel enabled ($SUBJ)"
