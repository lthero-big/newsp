# shellcheck shell=bash
# sourced by daily.sh (needs $DATE; run from repo root). Test: bash tests/seen-runs.sh
# An earlier incremental run's raw.json only counts as "already seen" if that run was published (publish.sh writes .published),
# or — for dirs from before the marker existed — if data/<date>.json already holds pm items of that run. The current run's own
# directory never counts (re-running a failed pm run used to report 0 new items).
run_published() { local d=$1 suf lab; [[ -f "$d/.published" ]] && return 0; suf=${d##*/}; if [[ $suf == pm ]]; then lab=15:00; else lab="${suf#pm-}"; lab="${lab:0:2}:${lab:2:2}"; fi
  python3 -c "import json,sys;d=json.load(open(sys.argv[1]));sys.exit(0 if any(c.get('batch')=='pm' and (c.get('run') or '15:00')==sys.argv[2] for c in d['items']) else 1)" "${NEWS_DATA_DIR:-data}/$DATE.json" "$lab" 2>/dev/null; }
