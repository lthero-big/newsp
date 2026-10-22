import os
os.environ.setdefault("NEWS_NO_MEDIA", "1")  # media enrichment hits the network; tested separately
import json
import subprocess
import sys
import tempfile
import unittest
from datetime import timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import generate  # noqa: E402
import x_from_connector  # noqa: E402
from test_generate import NOW, TAGS, TERMS, raw  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
MORNING = [raw("hn", "OpenAI ships GPT-6 Astra model", "https://example.com/astra", 500, 90, hours=3),
           raw("github", "acme/agent-kit", "https://github.com/acme/agent-kit", 900, 30, kind="repo", text="An AI agent toolkit"),
           raw("hf", "acme/flux-mini", "https://huggingface.co/acme/flux-mini", 300, kind="model", text="text-to-image diffusion")]
PM_NOW = NOW + timedelta(hours=2)


def build(items, now=NOW, **kw):
    return generate.build("2026-10-16", items, {}, TERMS, TAGS, now - timedelta(hours=24), now, [], 5, False, **kw)


def fill(doc):
    return json.loads(subprocess.run(["node", "scripts/fill.mjs", "/dev/stdin"], input=json.dumps(doc), cwd=ROOT,
                                     capture_output=True, text=True, check=True).stdout)


def pm_run(base, items):
    new = build(items, PM_NOW, exclude=base["items"], quotas=generate.PM_QUOTAS, batch="pm",
                fresh_after=generate.core.parse_time(base["window"]["end"]) - timedelta(hours=1))
    return generate.merge_incremental(base, new)


class IncrementalTests(unittest.TestCase):
    def setUp(self):
        self.base = fill(build(MORNING))

    def later(self):
        return MORNING + [
            raw("hn", "OpenAI ships GPT-6 Astra model!", "https://news.example.org/astra-copy", 50, hours=0.5),   # similar title
            raw("reddit", "Agent benchmark: Claude Opus 5.5 vs GPT-6", "https://example.com/agent-bench?utm_source=x", 400, 80, hours=0.5),
            raw("hn", "Old LLM post from yesterday", "https://example.com/old-llm", 900, 300, hours=20),           # stale story
        ]

    def test_morning_items_unchanged_and_new_items_tagged_pm(self):
        out = pm_run(self.base, self.later())
        am = [c for c in out["items"] if c["batch"] == "am"]
        self.assertEqual([{k: v for k, v in c.items() if k not in ("batch", "fetched_at")} for c in am],
                         [{k: v for k, v in c.items() if k not in ("batch", "fetched_at")} for c in self.base["items"]])
        pm = [c for c in out["items"] if c["batch"] == "pm"]
        self.assertEqual([c["url"] for c in pm], ["https://example.com/agent-bench?utm_source=x"])
        self.assertTrue(pm[0]["fetched_at"])
        self.assertEqual(sum(m["count"] for m in out["modules"]), len(out["items"]))

    def test_incremental_is_idempotent(self):
        once = fill(pm_run(self.base, self.later()))
        twice = fill(pm_run(once, self.later()))
        self.assertEqual([c["id"] for c in once["items"]], [c["id"] for c in twice["items"]])
        self.assertEqual(len({c["id"] for c in twice["items"]}), len(twice["items"]))

    def test_full_rerun_keeps_pm_items_without_duplicates(self):
        merged = fill(pm_run(self.base, self.later()))
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp) / "day.json"
            base.write_text(json.dumps(merged), encoding="utf-8")
            full = build(MORNING)
            keep = [c for c in merged["items"] if c["batch"] == "pm"]
            again = generate.merge_incremental(full, {**full, "items": keep, "window": None}, keep_window=True)
        self.assertEqual(sorted(c["id"] for c in again["items"]), sorted(c["id"] for c in merged["items"]))

    def test_validates_against_schema(self):
        out = fill(pm_run(self.base, self.later()))
        r = subprocess.run(["node", "scripts/validate.mjs", "/dev/stdin"], input=json.dumps(out), cwd=ROOT, capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)


class BarTests(unittest.TestCase):
    def test_pm_needs_to_beat_weakest_morning_card(self):
        base = fill(build(MORNING))
        weak = raw("hn", "Tiny LLM note", "https://example.com/tiny-llm", 1, hours=0.2)
        strong = raw("hn", "Huge LLM agent launch", "https://example.com/huge-llm", 2000, 500, hours=0.2)
        new = build(MORNING + [weak, strong], PM_NOW, exclude=base["items"], quotas=generate.PM_QUOTAS, batch="pm",
                    min_score={"community": 50})
        self.assertEqual([c["url"] for c in new["items"]], ["https://example.com/huge-llm"])
        self.assertEqual(set(generate.pm_bar(base)), {"model", "opensource", "community"})
        self.assertEqual(generate.PM_QUOTAS, {"model": 3, "opensource": 2, "community": 3})
        self.assertEqual(sum(generate.QUOTAS.values()), 22)


class ImageTests(unittest.TestCase):
    def test_repo_and_model_images_full_size(self):
        cards = {c["source"]: c for c in build(MORNING)["items"]}
        self.assertEqual(cards["github"]["image"]["src"], "https://opengraph.githubassets.com/1/acme/agent-kit")
        self.assertEqual(cards["hf"]["image"]["width"], 1200)
        self.assertNotIn("image", cards["hn"])

    def test_x_image_srcset_never_upscales(self):
        img = generate.x_image({"url": "https://pbs.twimg.com/media/ABC.jpg", "width": 1000, "height": 500})
        self.assertIn("name=small 680w", img["srcset"])
        self.assertIn("name=orig 1000w", img["srcset"])
        self.assertNotIn("name=large", img["srcset"])
        self.assertIsNone(generate.x_image({"url": "https://pbs.twimg.com/media/T.jpg", "width": 320, "height": 240}))

    def test_og_image_requires_declared_size(self):
        html = '<meta property="og:image" content="https://e.com/a.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">'
        self.assertEqual(generate.og_image(html)["width"], 1200)
        self.assertIsNone(generate.og_image('<meta property="og:image" content="https://e.com/a.png">'))

    def test_connector_media_kept(self):
        post = {"attachments": {"media_keys": ["3_1", "3_2"]}}
        media = {"3_1": {"media_key": "3_1", "type": "photo", "url": "https://pbs.twimg.com/media/A.jpg", "width": 1600, "height": 900},
                 "3_2": {"media_key": "3_2", "type": "photo", "url": "https://pbs.twimg.com/media/B.jpg", "width": 150, "height": 150}}
        self.assertEqual([m["url"] for m in x_from_connector.pick_media(post, media)], ["https://pbs.twimg.com/media/A.jpg"])


if __name__ == "__main__":
    unittest.main()


class ReleaseTests(unittest.TestCase):
    def test_build_tags_collapse_and_boilerplate_dropped(self):
        rel = lambda tag, text, title=None: raw("rss", title or tag, f"https://github.com/ggml-org/llama.cpp/releases/tag/{tag}", kind="release", feed="llamacpp-releases", text=text)
        items = [rel("b11681", "<p>graph: add precision handling</p>"), rel("b11680", "<p>x</p>"),
                 rel("v0.7.0", "<h2>Overview</h2><p>llama.cpp v0.7.0 adds speculative decoding and a new server API for long context models.</p>"),
                 raw("rss", "v0.41.2", "https://github.com/Comfy-Org/ComfyUI/releases/tag/v0.41.2", kind="release", feed="comfy", text="<p>ComfyUI v0.41.2</p>"),
                 raw("rss", "v0.41.1", "https://github.com/Comfy-Org/ComfyUI/releases/tag/v0.41.1", kind="release", feed="comfy", text="<p>ComfyUI v0.41.1</p>")]
        out = generate.collapse_releases(items)
        self.assertEqual(len(out), 1)
        self.assertTrue(out[0]["title"].startswith("llama.cpp v0.7.0（另有 2 个版本"))
        self.assertEqual(len(out[0]["also"]), 2)

    def test_github_chrome_stripped(self):
        t = "Release v0.41.2 · Comfy-Org/ComfyUI · GitHub Skip to content Navigation Menu Sign in Appearance settings"
        self.assertEqual(generate.excerpt(t), "")
        self.assertEqual(generate.strip_chrome("GitHub - a/b: Agent rules for coding · GitHub Skip to content Navigation"), "Agent rules for coding")


class TitlesTests(unittest.TestCase):
    def test_check_limits(self):
        sys.path.insert(0, str(ROOT / "scripts"))
        import titles
        self.assertEqual(titles.check({"title_zh": "中文标题", "summary_zh": "摘要。"})[2], [])
        self.assertTrue(titles.check({"title_zh": "超" * 29})[2])
        self.assertTrue(titles.check({"title_zh": "English only"})[2])
        self.assertTrue(titles.check({"title_zh": "中文", "summary_zh": "长" * 61})[2])


class LearningTests(unittest.TestCase):
    def test_trashed_key_penalised_liked_key_boosted_restored_ignored(self):
        import learning
        now = NOW.timestamp() * 1000
        x = lambda acc, url, likes: {"source": "x", "kind": "post", "url": url, "title": {"spammy": "Crypto LLM airdrop thread", "good": "Deep dive into agent memory design", "plain": "Benchmarks for small LLM inference"}[acc], "points": likes, "comments": 1,
                                     "published_at": (NOW - timedelta(hours=1)).isoformat(), "listing_text": f"{acc}: LLM agent notes and details here for everyone",
                                     "author": acc, "source_links": [{"source": "x", "url": url}], "feed": "x"}
        items = [x("spammy", "https://x.com/spammy/status/1", 500), x("good", "https://x.com/good/status/2", 500), x("plain", "https://x.com/plain/status/3", 500)]
        fb = learning.Feedback({"trashed": [{"id": "sha256:old", "at": now, "keys": ["x:@spammy"]}],
                                "liked": [{"id": "sha256:l", "at": now, "keys": ["x:@good"]}]}, now)
        import copy
        # X is capped at 2 per module, so score pairs separately (3 X posts would let the cap drop the penalised one)
        def scores(sub, f=None): return {c["source_label"]: c["score"] for c in build(copy.deepcopy(sub), feedback=f)["items"]}
        sp, gd, pl = items
        base, out = scores([sp, pl]), scores([sp, pl], fb)
        self.assertLess(out["X · @spammy"]["total"], base["X · @spammy"]["total"])
        self.assertEqual(out["X · @plain"]["total"], base["X · @plain"]["total"])
        self.assertEqual(out["X · @spammy"]["feedback"], 0.75)
        self.assertNotIn("feedback", out["X · @plain"])
        self.assertGreater(scores([gd, pl], fb)["X · @good"]["total"], scores([gd, pl])["X · @good"]["total"])
        self.assertNotIn("X · @spammy", [c["source_label"] for c in build(copy.deepcopy(items), feedback=fb)["items"]])  # cap keeps the 2 unpenalised posts
        # broad tags never penalise; trashed item itself is excluded; floor at 0.4
        fb2 = learning.Feedback({"trashed": [{"id": generate.stable_id("https://x.com/plain/status/3"), "at": now, "keys": ["x:@spammy"] * 1}] * 5}, now)
        self.assertEqual(fb2.factor(["x:@spammy"]), 0.5)
        res = build(copy.deepcopy(items), feedback=fb2)
        self.assertNotIn("X · @plain", [c["source_label"] for c in res["items"]])
        # v3.2 gate: kw: needs >=2 distinct deleted items; repeats of one item don't count; floor 0.5
        self.assertEqual(learning.Feedback({"trashed": [{"id": "a", "at": now, "keys": ["kw:x"]}] * 9}, now).factor(["kw:x", "x:@q"]), 1.0)
        self.assertEqual(learning.Feedback({"trashed": [{"id": f"a{i}", "at": now, "keys": ["kw:x"]} for i in range(9)]}, now).factor(["kw:x", "x:@q"]), 0.5)
        self.assertEqual(learning.Feedback({"trashed": [{"id": "a", "at": now, "keys": ["kw:x", "sub:y", "x:@z"]}] * 9}, now).factor(["kw:x", "sub:y", "x:@z"]), 0.4)
