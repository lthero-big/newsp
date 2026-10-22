#!/usr/bin/env python3
"""3–5 line run summary + push-message draft for run-edition.sh.   edition-summary.py <date> <am|pm> <mode> <tests> [url]"""
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
date, run, mode, tests = sys.argv[1:5]
url = sys.argv[5] if len(sys.argv) > 5 else os.environ.get("NEWS_SITE", "").rstrip("/") + f"/{date[:4]}/{date[5:7]}/{date}"
day = json.loads((ROOT / "data" / f"{date}.json").read_text(encoding="utf-8"))
items = day["items"]
new = [c for c in items if run == "am" or c.get("batch") == "pm"]
latest_run = max((c.get("run") or "15:00" for c in items if c.get("batch") == "pm"), default=None)
if run == "pm" and latest_run:
    new = [c for c in new if (c.get("run") or "15:00") == latest_run]
zh = sum(1 for c in new if c.get("title_zh"))
cm = sum(1 for c in items if c.get("comment_zh"))
s = {}
sp = ROOT / "var" / "llm" / f"{date}-{run}.summary.json"
if mode == "key" and sp.exists():
    s = json.loads(sp.read_text(encoding="utf-8"))
mods = {}
for c in new:
    mods[c["module"]] = mods.get(c["module"], 0) + 1
print(f"① {date} {run}：{len(new)} 条{'新增' if run == 'pm' else ''}（全天 {len(items)} 条，" + " ".join(f"{k}{v}" for k, v in mods.items()) + "）")
if mode == "key":
    calls = s.get("calls", [])
    print(f"② 文案：{zh}/{len(new)} 有中文标题，点评全天 {cm} 条；模型 {', '.join(s.get('providers', [])) or '—'}，"
          f"{len(calls)} 次调用（重试 {s.get('retries', 0)}），{s.get('in', 0)} 入 / {s.get('out', 0)} 出 token，{s.get('sec', 0)}s")
    fb = s.get("fallbacks") or []
    print(f"③ 回退：{', '.join(fb) if fb else '无'}；跳过：{', '.join(s.get('skipped_providers') or []) or '无'}；"
          f"失败 {len(s.get('errors') or [])}、数字存疑 {len(s.get('warnings') or [])}")
else:
    print(f"② 文案：NEWS_LLM={mode}，{zh}/{len(new)} 有中文标题")
print(f"④ 测试：{tests}")
print(f"⑤ 链接：{url}")
top = sorted(new, key=lambda c: -(c.get("score") or {}).get("total", 0))[:3]
heads = "；".join((c.get("title_zh") or c["title"])[:30] for c in top)
label = "早报" if run == "am" else f"{latest_run or '15:00'} 增量"
print("\n推送草稿：")
print(f"{date[5:7]}/{date[8:]} {label}好了，{len(new)} 条。{'先看：' + heads + '。' if heads else ''}{url}")
