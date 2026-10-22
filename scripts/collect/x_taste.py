"""Owner taste for the X query list (script-only, no AI, no extra tokens). Used by x_queries.py.

Reads the same owner feedback as learning.py (var/state/feedback.json from sync-state.mjs: 点赞/收藏 boost, 不感兴趣/少推 penalty,
30-day half-life, brand/broad words never keys, kw:/first-party penalties gated on >=2 items) and only reorders/reallocates:
  1. from: batches — inside each group, accounts are ordered by their x:@handle factor (liked first, penalized last).
  2. kw-<handle>-<n> searches — ordered by factor; max_results scaled by factor (10..45), the kw-* total stays the same.
  3. taste-accounts / taste-kw — at most two extra searches for liked X accounts that are not configured sources and for liked
     specific keywords (kw:). Their budget is taken from the baseline topic searches (x.queries + custom), capped at
     TASTE_SHARE of that topic budget, so the total max_results is unchanged and baseline keeps >= 1 - TASTE_SHARE (exploration).
  4. Strongly penalized accounts / keywords (strength >= EXCLUDE_AT, i.e. repeated 不感兴趣/少推) are excluded from the topic
     searches with -from:<h> / -"<kw>" (at most MAX_EXCLUDE, query length cap respected).
No feedback (or no matching keys) → output identical to the plain list. Every changed query carries a "taste" note.
"""
from __future__ import annotations

import learning

TASTE_SHARE = 0.2          # max share of the topic budget moved to taste searches
LIKE_MIN = 0.9             # boost strength (≈ one like inside the half-life) to qualify for a taste search
MAX_TASTE_ACCOUNTS, MAX_TASTE_KW = 8, 6
EXCLUDE_AT, MAX_EXCLUDE = 1.0, 5
KW_MIN, KW_MAX, KW_BASE = 10, 45, 30


def _quote(t: str) -> str:
    return t if (" " not in t and "-" not in t) else f'"{t}"'


def account_order(fb: "learning.Feedback"):
    """sort key for sc.x_queries(order_key=...): liked first, penalized last, otherwise original order (stable sort)."""
    return lambda h: -fb.factor([f"x:@{h.lower()}"])


def apply(queries: list[dict], fb: "learning.Feedback", sources: dict, accounts: list[tuple], topic_ids: set[str]) -> tuple[list[dict], list[str]]:
    if not (fb.boost or fb.penalty) or not queries:
        return queries, []
    x = sources.get("x") or {}
    suffix, base_likes, limit = x.get("suffix", ""), int(x.get("min_likes", 20)), int(x.get("max_query_len", 480))
    tail = " -is:retweet -is:reply"
    notes: list[str] = []
    out = [dict(q) for q in queries]
    configured = {h.lower() for h, _, _ in accounts}
    present = " ".join(q["query"].lower() for q in out)

    # 2. kw-* searches: order + budget by factor, total unchanged
    kw = [q for q in out if q["id"].startswith("kw-") and q.get("account")]
    if kw:
        def f(q):
            term = q["query"].split(" has:")[0].split(" -is:")[0].strip().strip('"').lower()
            return fb.factor([f"x:@{q['account'].lower()}", "kw:" + term.replace(" ", "_")])
        fs = {q["id"]: f(q) for q in kw}
        if any(v != 1 for v in fs.values()):
            total = sum(int(q.get("max_results", KW_BASE)) for q in kw)
            mean = sum(fs.values()) / len(fs)
            want = {q["id"]: max(KW_MIN, min(KW_MAX, round(int(q.get("max_results", KW_BASE)) * fs[q["id"]] / mean))) for q in kw}
            diff = total - sum(want.values())
            for q in sorted(kw, key=lambda q: -fs[q["id"]] if diff > 0 else fs[q["id"]]):   # put the rounding residue back
                if diff == 0:
                    break
                step = min(diff, KW_MAX - want[q["id"]]) if diff > 0 else max(diff, KW_MIN - want[q["id"]])
                want[q["id"]] += step; diff -= step
            for q in kw:
                if want[q["id"]] != q.get("max_results") or fs[q["id"]] != 1:
                    q["taste"] = f"factor {fs[q['id']]}: max_results {q.get('max_results')}→{want[q['id']]}"
                    notes.append(f"{q['id']}: {q['taste']}")
                q["max_results"] = want[q["id"]]
            first = next(i for i, q in enumerate(out) if q in kw)
            rest = [q for q in out if q not in kw]
            out = rest[:first] + sorted(kw, key=lambda q: -fs[q["id"]]) + rest[first:]

    topics = [q for q in out if q["id"] in topic_ids]
    topic_budget = sum(int(q.get("max_results", 100)) for q in topics)

    # 3. taste searches (liked accounts outside the configured list, liked specific keywords)
    taste = []
    hs = sorted(((k[3:], v) for k, v in fb.boost.items() if k.startswith("x:@") and v >= LIKE_MIN
                 and k[3:] not in configured and not fb.penalty.get(k)), key=lambda t: (-t[1], t[0]))
    picked = []
    for h, v in hs[:MAX_TASTE_ACCOUNTS]:
        if len(f"({' OR '.join('from:' + p for p in picked + [h])}){tail}") > limit:
            break
        picked.append(h)
    if picked:
        taste.append({"id": "taste-accounts", "query": f"({' OR '.join('from:' + p for p in picked)}){tail}", "min_likes": base_likes,
                      "taste": "liked accounts: " + ", ".join(f"@{h}" for h in picked)})
    ks = sorted(((k[3:].replace("_", " "), v) for k, v in fb.boost.items() if k.startswith("kw:") and v >= LIKE_MIN
                 and not fb.penalty.get(k) and not learning.is_brand(k[3:]) and k[3:].replace("_", " ") not in learning.BROAD),
                key=lambda t: (-t[1], t[0]))
    terms = []
    for t, v in ks[:MAX_TASTE_KW]:
        if f'"{t}"' in present or len(f"({' OR '.join(terms + [_quote(t)])}) {suffix}") > limit:
            continue
        terms.append(_quote(t))
    if terms:
        taste.append({"id": "taste-kw", "query": f"({' OR '.join(terms)}) {suffix}".strip(), "min_likes": base_likes,
                      "taste": "liked keywords: " + ", ".join(terms)})
    if taste and topic_budget:
        cap = int(topic_budget * TASTE_SHARE)
        each = max(10, min(30, cap // len(taste)))
        for t in taste:
            t["max_results"] = each
        moved = each * len(taste)
        left = moved
        for i, q in enumerate(topics):   # take the budget proportionally from the topic searches
            cut = left if i == len(topics) - 1 else round(moved * int(q.get("max_results", 100)) / topic_budget)
            cut = min(cut, int(q.get("max_results", 100)) - 10)
            q["max_results"] = int(q.get("max_results", 100)) - cut; left -= cut
            q["taste"] = (q.get("taste", "") + f"; " if q.get("taste") else "") + f"−{cut} max_results for taste searches"
        for t in taste:
            notes.append(f"{t['id']}: {t['taste']} (max_results {t['max_results']})")
        last_topic = max(i for i, q in enumerate(out) if q["id"] in topic_ids)
        out = out[:last_topic + 1] + taste + out[last_topic + 1:]
    elif taste:
        taste = []

    # 4. exclusions for strongly penalized accounts / keywords in the topic searches
    ex = sorted(((k, v) for k, v in fb.penalty.items() if v >= EXCLUDE_AT and (k.startswith("x:@") or k.startswith("kw:"))),
                key=lambda t: (-t[1], t[0]))[:MAX_EXCLUDE]
    if ex:
        clauses = [f"-from:{k[3:]}" if k.startswith("x:@") else f'-"{k[3:].replace("_", " ")}"' for k, _ in ex]
        for q in topics:
            added = [c for c in clauses if c.lower() not in q["query"].lower() and len(q["query"]) + len(c) + 1 <= limit]
            if added:
                q["query"] = q["query"] + " " + " ".join(added)
                q["taste"] = (q.get("taste", "") + "; " if q.get("taste") else "") + "excluded " + " ".join(added)
        notes.append("excluded from topic searches: " + " ".join(clauses))
    for q in topics:
        if q.get("taste"):
            notes.append(f"{q['id']}: {q['taste']}")
    return out, notes
