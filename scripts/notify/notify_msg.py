#!/usr/bin/env python3
"""Short Chinese plain-text message for scripts/notify (Telegram etc.). Never raises; prints the message.
    notify_msg.py start|done|fail|test <date> <am|pm> <preview|live> <log> <reason> [seconds]
"""
import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
kind, date, run, mode, log, reason = (sys.argv[1:7] + [""] * 6)[:6]
sec = sys.argv[7] if len(sys.argv) > 7 else ""
label = {"am": "早报", "pm": "15:00 增量"}.get(run, run)
md = f"{date[5:7]}/{date[8:10]}" if len(date) >= 10 else date
mode_zh = "正式" if mode == "live" else "预览"
P = ""


def tail(path, n=200):
    try:
        return Path(path).read_text(encoding="utf-8", errors="replace").splitlines()[-n:]
    except Exception:
        return []


def done():
    lines = tail(log, 400)
    url = ""
    for l in lines:
        m = re.search(r"✓ preview: (\S+)", l)
        if m:
            url = f"{m.group(1)}/{date[:4]}/{date[5:7]}/{date}"
    if not url:
        url = os.environ.get("NEWS_SITE", "").rstrip("/") + f"/{date[:4]}/{date[5:7]}/{date}"
    out = [f"{P}{md} {label}已出（{mode_zh}，{sec}s）", url]
    try:
        items = json.loads((ROOT / "data" / f"{date}.json").read_text(encoding="utf-8"))["items"]
        new = [c for c in items if run == "am" or c.get("batch") == "pm"]
        if run == "pm":
            last = max((c.get("run") or "15:00" for c in new), default=None)
            new = [c for c in new if (c.get("run") or "15:00") == last]
        out.append(f"{len(new)} 条" + ("新增" if run == "pm" else "") + f"，全天 {len(items)} 条")
        top = sorted(new, key=lambda c: -((c.get("score") or {}).get("total") or 0))[:3]
    except Exception:
        top = []
    tok = []
    try:
        s = json.loads((ROOT / "var/llm" / f"{date}-{run}.summary.json").read_text(encoding="utf-8"))
        tok.append(f"文案 {', '.join(s.get('providers') or []) or '—'} {s.get('in', 0)}/{s.get('out', 0)}")
    except Exception:
        pass
    try:
        xf = ROOT / "var/x-items" / (f"{date}.json" if run == "am" else f"{date}-pm.json")
        sc = (json.loads(xf.read_text(encoding="utf-8")).get("stats") or {}).get("score") or {}
        if sc.get("in"):
            tok.append(f"X 打分 {sc.get('model')} {sc['in']}/{sc.get('out', 0)}")
    except Exception:
        pass
    if tok:
        out.append("token 入/出：" + "；".join(tok))
    for c in top:
        out.append(f"· {(c.get('title_zh') or c.get('title') or '')[:40]}\n  {c.get('url', '')}")
    return out


def fail():
    lines = tail(log, 400)
    step = next((l.strip("─ ").strip() for l in reversed(lines) if l.startswith("──")), "启动前")
    bad = r"✗|Error|error|Traceback|failed|失败|refusing|fatal|HTTP \d{3}"
    why = next((l.strip() for l in reversed(lines) if re.search(bad, l) and not l.startswith("✗ run-edition.sh line")), "")
    why = why or next((l.strip() for l in reversed(lines) if re.search(bad, l)), "")
    if not why:
        why = next((l.strip() for l in reversed(lines) if l.strip()), "（日志为空）")
    return [f"{P}{md} {label}失败（{mode_zh}，{sec}s）", f"步骤：{step}", f"原因：{why[:300]}", f"日志：{log}"]


try:
    if kind == "start":
        msg = [f"{P}{md} {label}到点还没出，Grok Bot 可能挂了。备用流程已开始跑（{mode_zh}模式），约 20 分钟后再报结果。", f"原因：{reason}"]
    elif kind == "done":
        msg = done()
    elif kind == "fail":
        msg = fail()
    else:
        msg = [f"{P}通知测试：服务器 {mode_zh}模式，Telegram 通道正常。"]
    text = "\n".join(msg)
except Exception as e:  # noqa: BLE001
    text = f"{P}{md} {label} {kind}（消息生成出错：{type(e).__name__}）"
print(text[:3900])
