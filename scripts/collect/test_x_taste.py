import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import learning  # noqa: E402
import source_config as sc  # noqa: E402
import x_taste  # noqa: E402

NOW = 1_800_000_000_000
DAY = 864e5
SOURCES = {"x": {"suffix": "-is:retweet lang:en", "min_likes": 20, "low_min_likes": 3,
                 "queries": [{"id": "models", "terms": ["GPT", "Claude"], "max_results": 100},
                             {"id": "agents", "terms": ['"AI agent"'], "max_results": 100},
                             {"id": "prompts", "terms": ["prompt"], "max_results": 50}],
                 "accounts": [{"handle": "OpenAI", "group": "官方", "enabled": True, "keywords": ["gpt-image"]},
                              {"handle": "AnthropicAI", "group": "官方", "enabled": True},
                              {"handle": "GoogleDeepMind", "group": "官方", "enabled": True, "keywords": ["nano banana"]},
                              {"handle": "simonw", "group": "博主", "enabled": True},
                              {"handle": "swyx", "group": "博主", "enabled": True, "keywords": ["latent space"]}]}}
TOPICS = {"models", "agents", "prompts", "custom"}


def ev(keys, days=1, weight=1, id_=None):
    return {"id": id_ or "|".join(keys) + str(days), "at": NOW - days * DAY, "keys": keys, "weight": weight}


def run(feedback, skip=()):
    fb = learning.Feedback(feedback, NOW)
    order = x_taste.account_order(fb) if (fb.boost or fb.penalty) else None
    qs = sc.x_queries(SOURCES, {}, set(skip), order_key=order)
    return x_taste.apply(qs, fb, SOURCES, sc.x_accounts(SOURCES, {}), TOPICS)


def budget(qs):
    return sum(q["max_results"] for q in qs)


class XTaste(unittest.TestCase):
    def test_no_feedback_identical(self):
        plain = sc.x_queries(SOURCES, {}, set())
        for fb in (None, {}, {"liked": [], "trashed": [], "disliked": []},
                   {"liked": [ev(["x:@nobody_here"], days=400)]}):   # decayed to ~0 but still a key → order unchanged, no taste
            out, notes = run(fb)
            if fb and fb.get("liked"):
                out = [{k: v for k, v in q.items() if k != "taste"} for q in out if not q["id"].startswith("taste-")]
                self.assertEqual([q["query"] for q in out], [q["query"] for q in plain])
                continue
            self.assertEqual(json.dumps(out), json.dumps(plain))
            self.assertEqual(notes, [])

    def test_liked_account_first_in_batch(self):
        out, _ = run({"liked": [ev(["x:@swyx"]), ev(["x:@anthropicai"])]})
        q = {x["id"]: x["query"] for x in out}
        self.assertTrue(q["accounts1"].startswith("(from:AnthropicAI OR"))
        self.assertTrue(q["accounts2"].startswith("(from:swyx OR"))

    def test_budget_unchanged_and_baseline_kept(self):
        fb = {"liked": [ev(["x:@fan1"]), ev(["x:@fan2"]), ev(["kw:3d_generation"]), ev(["kw:mcp"]), ev(["x:@openai", "kw:gpt-image"])]}
        plain = sc.x_queries(SOURCES, {}, set())
        out, notes = run(fb)
        self.assertEqual(budget(out), budget(plain))
        taste = [x for x in out if x["id"].startswith("taste-")]
        self.assertEqual({x["id"] for x in taste}, {"taste-accounts", "taste-kw"})
        self.assertLessEqual(budget(taste), 0.5 * budget(out))
        self.assertLessEqual(budget(taste), x_taste.TASTE_SHARE * 250)
        self.assertIn("from:fan1", taste[0]["query"])
        self.assertNotIn("from:openai", taste[0]["query"].lower())   # configured accounts are not repeated
        self.assertIn('"3d generation"', taste[1]["query"])
        kw = [x for x in out if x["id"].startswith("kw-")]
        self.assertEqual(kw[0]["id"], "kw-openai-1")
        self.assertEqual(budget(kw), 90)
        self.assertGreater(kw[0]["max_results"], 30)
        self.assertTrue(notes)

    def test_taste_survives_skip_ok(self):   # only topic searches left (all accounts via RSSHub): still capped
        out, _ = run({"liked": [ev(["x:@fan1"])]}, skip={"OpenAI", "AnthropicAI", "GoogleDeepMind", "simonw", "swyx"})
        self.assertEqual(budget(out), budget(sc.x_queries(SOURCES, {}, {"OpenAI", "AnthropicAI", "GoogleDeepMind", "simonw", "swyx"})))
        self.assertLessEqual(next(x for x in out if x["id"] == "taste-accounts")["max_results"], 50)

    def test_brand_and_broad_ignored(self):
        out, _ = run({"liked": [ev(["kw:openai"]), ev(["kw:gemini"]), ev(["kw:ai"])]})
        self.assertFalse([x for x in out if x["id"] == "taste-kw"])

    def test_penalized_account_last_and_excluded(self):
        fb = {"trashed": [ev(["x:@simonw"], id_="a"), ev(["x:@simonw"], id_="b"), ev(["x:@spammy"], id_="c"), ev(["x:@spammy"], id_="d")]}
        out, notes = run(fb)
        q = {x["id"]: x["query"] for x in out}
        self.assertTrue(q["accounts2"].startswith("(from:swyx OR from:simonw)"))
        self.assertIn("-from:spammy", q["models"])
        self.assertTrue(all(len(x["query"]) <= 480 for x in out))
        self.assertTrue(any("excluded" in n for n in notes))

    def test_single_weak_dislike_does_not_exclude(self):
        out, _ = run({"disliked": [ev(["x:@spammy"], days=40)]})
        self.assertNotIn("-from:spammy", next(x for x in out if x["id"] == "models")["query"])

    def test_half_life(self):   # a like 90 days ago (3 half-lives) is below LIKE_MIN → no taste search
        out, _ = run({"liked": [ev(["x:@fan1"], days=90)]})
        self.assertFalse([x for x in out if x["id"] == "taste-accounts"])


if __name__ == "__main__":
    unittest.main()
