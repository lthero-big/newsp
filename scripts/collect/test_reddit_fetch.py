"""Reddit politeness: sequential RSS with spacing, 429 retry/back-off, shared limiter. No network, no real sleeps."""
import os; os.environ.setdefault("NEWS_NO_MEDIA", "1")
import sys
import unittest
import urllib.error
from datetime import datetime, timedelta, timezone
from email.message import Message
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))
import collect  # noqa: E402

END = datetime(2026, 10, 21, 0, 30, tzinfo=timezone.utc)
START = END - timedelta(hours=24)


def atom(sub: str) -> bytes:
    """Listing that covers the window (oldest entry before START)."""
    rows = []
    for k, h in enumerate((1, 5, 30)):
        t = (END - timedelta(hours=h)).strftime("%Y-%m-%dT%H:%M:%SZ")
        rows.append(f'<entry><title>{sub} post {k}</title><updated>{t}</updated>'
                    f'<link href="https://www.reddit.com/r/{sub}/comments/x{k}/p/"/><content>hi</content></entry>')
    return ('<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">' + "".join(rows) + "</feed>").encode()


class FakeClock:
    def __init__(self):
        self.t, self.sleeps = 100.0, []

    def clock(self):
        return self.t

    def sleep(self, s):
        self.sleeps.append(round(s, 2))
        self.t += s


class LimiterTests(unittest.TestCase):
    def test_spacing(self):
        c = FakeClock()
        lim = collect.RedditLimiter(clock=c.clock, sleep=c.sleep)
        self.assertEqual(lim.wait(3), 0.0)          # first request: no wait
        self.assertEqual(lim.wait(3), 3.0)          # back-to-back: full gap
        c.t += 10
        self.assertEqual(lim.wait(3), 0.0)          # gap already elapsed
        self.assertEqual(c.sleeps, [3.0])

    def test_is_reddit_url(self):
        self.assertTrue(collect.is_reddit_url("https://www.reddit.com/r/x/new.rss"))
        self.assertTrue(collect.is_reddit_url("https://old.reddit.com/r/x/"))
        self.assertFalse(collect.is_reddit_url("https://api.pullpush.io/reddit/search"))
        self.assertFalse(collect.is_reddit_url("https://notreddit.com/x"))


class SafeGetRedditTests(unittest.TestCase):
    def setUp(self):
        self.c = FakeClock()
        p = mock.patch.object(collect, "REDDIT", collect.RedditLimiter(clock=self.c.clock, sleep=self.c.sleep))
        p.start(); self.addCleanup(p.stop)

    def test_ua_limiter_and_retry_after(self):
        seen = []

        class Opener:
            def open(self, req, timeout=None):
                seen.append(req.get_header("User-agent"))
                h = Message(); h["Retry-After"] = "7"
                raise urllib.error.HTTPError(req.full_url, 429, "too many", h, None)

        for _ in range(2):
            with self.assertRaises(collect.FetchError) as ctx:
                collect.safe_get("https://www.reddit.com/r/x/new.rss", resolve=lambda h: ["151.101.1.140"], opener=Opener(), reddit_gap=4)
        self.assertEqual(ctx.exception.reason, "http:429")
        self.assertEqual(ctx.exception.retry_after, 7.0)
        self.assertEqual(seen, [collect.REDDIT_UA] * 2)
        self.assertEqual(self.c.sleeps, [4.0])  # second reddit request waited the gap


class FetchRedditTests(unittest.TestCase):
    def setUp(self):
        self.c = FakeClock()
        p = mock.patch.object(collect, "REDDIT", collect.RedditLimiter(clock=self.c.clock, sleep=self.c.sleep))
        p.start(); self.addCleanup(p.stop)
        p = mock.patch.object(collect.random, "uniform", lambda a, b: 4.0)
        p.start(); self.addCleanup(p.stop)
        self.calls = []

    def run_with(self, plan, archive_fail=False):
        """plan: subreddit -> list of results for successive RSS attempts (int status or 'ok')."""
        def fake_get(url, timeout=None, reddit_gap=None, **kw):
            collect.REDDIT.wait(reddit_gap)
            sub = url.split("/r/")[1].split("/")[0]
            self.calls.append(("rss", sub))
            step = plan[sub].pop(0)
            if step == "ok":
                return {"status": 200, "body": atom(sub), "content_type": "application/atom+xml"}
            code, ra = step if isinstance(step, tuple) else (step, None)
            raise collect.FetchError(f"http:{code}", ra)

        def fake_pullpush(feed, start, end, timeout):
            self.calls.append(("pullpush", feed["subreddit"]))
            raise collect.FetchError("http:429")

        def fake_arctic(feed, start, end, timeout):
            self.calls.append(("arctic", feed["subreddit"]))
            if archive_fail and (archive_fail is True or self.calls.count(("arctic", feed["subreddit"])) == 1):
                raise collect.FetchError("http:422")
            return [{"title": f"{feed['subreddit']} archived", "permalink": f"/r/{feed['subreddit']}/comments/a1/x/",
                     "created_utc": int((END - timedelta(hours=2)).timestamp()), "score": 1, "num_comments": 0, "_feed": feed["subreddit"]}]

        sources = {"reddit": {"feeds": [{"subreddit": s, "mode": "new"} for s in plan]}}
        with mock.patch.object(collect, "safe_get", fake_get), mock.patch.object(collect, "_pullpush", fake_pullpush), \
                mock.patch.object(collect, "_arctic", fake_arctic):
            return collect.fetch_reddit(sources, START, END, 5, None)

    def test_sequential_spacing_and_retries(self):
        items, st = self.run_with({"LocalLLaMA": ["ok"], "StableDiffusion": [(429, 6.0), "ok"], "comfyui": [429, 429, 429]})
        self.assertEqual(st["rss_attempts"], {"LocalLLaMA:new": ["200"], "StableDiffusion:new": ["429 ra=6", "200"],
                                              "comfyui:new": ["429", "429", "429"]})
        self.assertEqual(st["rss_retries"], 3)
        self.assertEqual(st["replay"], {"LocalLLaMA:new": "rss", "StableDiffusion:new": "rss", "comfyui:new": "arctic-shift"})
        # gap 4 s between listings; Retry-After/reset 6 → 6+2 s; no header → 10 s then 30 s
        self.assertEqual(self.c.sleeps, [4.0, 8.0, 4.0, 10.0, 30.0])
        self.assertEqual(st["rss_backoff_s"], 48.0)
        # strictly sequential: each subreddit's archive fallback ends before the next listing
        self.assertEqual(self.calls, [("rss", "LocalLLaMA"), ("rss", "StableDiffusion"), ("rss", "StableDiffusion"),
                                      ("rss", "comfyui"), ("rss", "comfyui"), ("rss", "comfyui"),
                                      ("pullpush", "comfyui"), ("arctic", "comfyui")])
        self.assertEqual(len([i for i in items if i["transport"] == "arctic-shift"]), 1)

    def test_backoff_budget_is_bounded(self):
        with mock.patch.object(collect, "REDDIT_WAIT_BUDGET", 35.0):
            _, st = self.run_with({"a": [429, 429, 429], "b": [429, 429, 429]})
        self.assertEqual(st["rss_backoff_s"], 35.0)            # 10 + 25 (capped), then no more back-off
        self.assertEqual(st["rss_attempts"]["b:new"], ["429"])  # budget spent: b falls straight back to the archive
        self.assertLessEqual(sum(self.c.sleeps), 35.0 + 4.0 * 2)

    def test_retry_after_is_capped_and_non_429_not_retried(self):
        _, st = self.run_with({"a": [(429, 600.0), "ok"], "b": [403]})
        self.assertIn(60.0, self.c.sleeps)                    # Retry-After 600 capped at REDDIT_RETRY_AFTER_MAX
        self.assertEqual(st["rss_attempts"]["b:new"], ["403"])  # only 429 is retried

    def test_arctic_retried_once(self):
        items, st = self.run_with({"s": [403]}, archive_fail="once")
        self.assertEqual(st["replay"], {"s:new": "arctic-shift"})
        self.assertEqual(self.calls.count(("arctic", "s")), 2)
        self.assertEqual(len(items), 1)


class MediaUsesLimiterTests(unittest.TestCase):
    def test_reddit_json_goes_through_limiter(self):
        import media
        c = FakeClock()
        lim = collect.RedditLimiter(clock=c.clock, sleep=c.sleep)
        heads = []

        class Resp:
            headers = {"content-type": "application/json"}
            def __enter__(self): return self
            def __exit__(self, *a): return False
            def read(self, n=None): return b"[]"

        def fake_urlopen(req, timeout=None):
            heads.append(req.get_header("User-agent"))
            return Resp()

        with mock.patch.object(collect, "REDDIT", lim), mock.patch.object(media.urllib.request, "urlopen", fake_urlopen):
            media.get("https://www.reddit.com/r/x/comments/1/a/.json")
            media.get("https://www.reddit.com/r/x/comments/2/b/.json")
            media.get("https://example.com/img.png")
        self.assertEqual(c.sleeps, [collect.REDDIT_GAP])
        self.assertEqual(heads[:2], [collect.REDDIT_UA] * 2)
        self.assertNotEqual(heads[2], collect.REDDIT_UA)


if __name__ == "__main__":
    unittest.main()
