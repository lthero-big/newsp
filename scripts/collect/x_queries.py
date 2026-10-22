"""Print the X search_posts_all queries for this run as JSON (defaults + owner settings + owner taste). No network.
    python3 scripts/collect/x_queries.py [--skip-ok var/x-rsshub/<run>.json] [--feedback var/state/feedback.json] [--no-taste]
      -> [{"id": "models", "query": "..."}, ...]
--skip-ok: accounts that x_rsshub.py fetched successfully are left out of the from: queries (connector = fallback).
--feedback: owner feedback (sync-state.mjs); missing file / --no-taste = the plain list. Taste rules: x_taste.py (notes on stderr).
"""
import argparse
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import learning  # noqa: E402
import source_config as sc  # noqa: E402
import x_taste  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument("--skip-ok", default="")
ap.add_argument("--feedback", default=str(sc.ROOT / "var/state/feedback.json"))
ap.add_argument("--no-taste", action="store_true")
a = ap.parse_args()
skip = set()
if a.skip_ok and Path(a.skip_ok).is_file():
    skip = set(json.loads(Path(a.skip_ok).read_text(encoding="utf-8")).get("ok") or [])
sources = json.loads((sc.ROOT / "config/collect-sources.json").read_text(encoding="utf-8"))
cfg = sc.load_settings()
if a.no_taste:
    print(json.dumps(sc.x_queries(sources, cfg, skip), ensure_ascii=False, indent=1))
    raise SystemExit(0)
fb = learning.Feedback.load(Path(a.feedback) if a.feedback else None, time.time() * 1000)
order = x_taste.account_order(fb) if (fb.boost or fb.penalty) else None
qs = sc.x_queries(sources, cfg, skip, order_key=order)
topic_ids = {q["id"] for q in (sources.get("x") or {}).get("queries", [])} | {"custom"}
qs, notes = x_taste.apply(qs, fb, sources, sc.x_accounts(sources, cfg), topic_ids)
for n in notes:
    print("x-taste: " + n, file=sys.stderr)
print(json.dumps(qs, ensure_ascii=False, indent=1))
