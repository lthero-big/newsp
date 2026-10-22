#!/usr/bin/env bash
# Cheap check for run_published (scripts/lib-runs.sh): re-running a failed pm run must not treat its own/unpublished raw as seen.
set -euo pipefail
cd "$(dirname "$0")/.."; . scripts/lib-runs.sh
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT; DATE=2099-01-01; export NEWS_DATA_DIR=$T
mkdir -p "$T/runs/pm" "$T/runs/pm-2000"
echo '{"items":[{"batch":"am"}]}' > "$T/$DATE.json"
fail=0; ok() { if "$@"; then :; else echo "✗ $*"; fail=1; fi; }; no() { if "$@"; then echo "✗ not: $*"; fail=1; fi; }
no run_published "$T/runs/pm"                                   # failed 15:00 (nothing published) → not seen
echo '{"items":[{"batch":"pm","run":"15:00"}]}' > "$T/$DATE.json"
ok run_published "$T/runs/pm"                                   # legacy: 15:00 items are in the day file → seen
no run_published "$T/runs/pm-2000"                              # 20:00 not published
touch "$T/runs/pm-2000/.published"; ok run_published "$T/runs/pm-2000"   # marker → seen
[[ $fail == 0 ]] && echo "seen-runs: ok" || exit 1
