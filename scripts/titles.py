#!/usr/bin/env python3
"""Chinese titles/summaries for cards — the only AI-ish step, done by the scheduled agent itself (no external LLM API).

  python3 scripts/titles.py export <date>          → var/titles/<date>.todo.json  (only items lacking title_zh)
  python3 scripts/titles.py import <date> <file>   ← {"<id>": {"title_zh": "...", "summary_zh": "..."}}

The agent reads ONLY the todo file and writes the import file. Limits: title_zh ≤ 28 chars, summary_zh ≤ 60 chars.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TITLE_MAX, SUMMARY_MAX, COMMENT_MAX, COMMENTS_PER_DAY = 28, 60, 40, 5
HAN = re.compile(r"[\u4e00-\u9fff]")


def day_path(date):
    return ROOT / "data" / f"{date}.json"


def export(date):
    day = json.loads(day_path(date).read_text(encoding="utf-8"))
    todo = []
    for c in day["items"]:
        if c.get("title_zh"):
            continue
        m = {k: v for k, v in (c.get("metrics") or {}).items() if v}
        todo.append({"id": c["id"], "title": c["title"], "source": c["source_label"], "kind": c["kind"],
                     "excerpt": (c.get("excerpt") or "")[:200], **({"metrics": m} if m else {})})
    out = ROOT / "var" / "titles" / f"{date}.todo.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({"date": date, "rules": f"每条写 title_zh（中文概括标题，≤{TITLE_MAX} 字）和 summary_zh（中文一句话摘要，≤{SUMMARY_MAX} 字）；"
                               f"另挑 3–{COMMENTS_PER_DAY} 条真正值得点评的加 comment_zh（≤{COMMENT_MAX} 字，给出背景/影响/对照，只基于摘录，不编造数字）；输出 {{id: {{title_zh, summary_zh, comment_zh?}}}}",
                               "comments_left": max(0, COMMENTS_PER_DAY - sum(1 for c in day["items"] if c.get("comment_zh"))), "items": todo}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"todo: {len(todo)} -> {out.relative_to(ROOT)}")


def check(entry):
    t, s = (entry.get("title_zh") or "").strip(), (entry.get("summary_zh") or "").strip()
    cm = (entry.get("comment_zh") or "").strip()
    errs = []
    if cm and (len(cm) > COMMENT_MAX or not HAN.search(cm)):
        errs.append(f"comment_zh 需为中文且 ≤{COMMENT_MAX} 字（现 {len(cm)}）")
    if not t or len(t) > TITLE_MAX or not HAN.search(t):
        errs.append(f"title_zh 需为中文且 ≤{TITLE_MAX} 字（现 {len(t)}）")
    if s and (len(s) > SUMMARY_MAX or not HAN.search(s)):
        errs.append(f"summary_zh 需为中文且 ≤{SUMMARY_MAX} 字（现 {len(s)}）")
    if re.search(r"[<>]", t + s + cm):
        errs.append("不能含 HTML")
    entry["_comment"] = cm
    return t, s, errs


def do_import(date, file):
    p = day_path(date)
    day = json.loads(p.read_text(encoding="utf-8"))
    src = json.loads(Path(file).read_text(encoding="utf-8"))
    src = src.get("items", src) if isinstance(src, dict) else src
    if isinstance(src, list):
        src = {e["id"]: e for e in src}
    by_id = {c["id"]: c for c in day["items"]}
    ok, bad = 0, []
    for cid, entry in src.items():
        if cid not in by_id:
            bad.append(f"{cid[:19]}…: 当天没有这条")
            continue
        t, s, errs = check(entry)
        if errs:
            bad.append(f"{cid[:19]}…: {'；'.join(errs)}")
            continue
        by_id[cid]["title_zh"] = t
        if s:
            by_id[cid]["summary_zh"] = s
        if entry.get("_comment"):
            if sum(1 for c in day["items"] if c.get("comment_zh") and c["id"] != cid) >= COMMENTS_PER_DAY:
                bad.append(f"{cid[:19]}…: 点评已满 {COMMENTS_PER_DAY} 条，忽略 comment_zh")
            else:
                by_id[cid]["comment_zh"] = entry["_comment"]
        ok += 1
    p.write_text(json.dumps(day, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    missing = sum(1 for c in day["items"] if not c.get("title_zh"))
    print(f"imported: {ok}, rejected: {len(bad)}, still missing: {missing}")
    for b in bad:
        print("  ✗ " + b)
    return 1 if bad else 0


if __name__ == "__main__":
    a = sys.argv[1:]
    if len(a) == 2 and a[0] == "export":
        export(a[1])
    elif len(a) == 3 and a[0] == "import":
        sys.exit(do_import(a[1], a[2]))
    else:
        print(__doc__)
        sys.exit(2)
