"""scripts/llm.py provider slots from env + one real HTTP round trip against a local OpenAI-compatible stub."""
import json
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import llm  # noqa: E402


class Stub(BaseHTTPRequestHandler):
    seen = []

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["content-length"])))
        Stub.seen.append((self.path, self.headers.get("authorization"), body))
        out = json.dumps({"choices": [{"message": {"content": '{"ok": 1}'}, "finish_reason": "stop"}], "usage": {"prompt_tokens": 3, "completion_tokens": 2}}).encode()
        self.send_response(200); self.send_header("content-type", "application/json"); self.send_header("content-length", str(len(out))); self.end_headers()
        self.wfile.write(out)

    def log_message(self, *a):
        pass


class EnvProviders(unittest.TestCase):
    def test_presets_and_overrides(self):
        env = {"NEWS_LLM_PROVIDER": "deepseek", "NEWS_LLM_API_KEY": "k1",
               "NEWS_LLM_FALLBACK_BASE_URL": "https://gw.example.com/v1", "NEWS_LLM_FALLBACK_MODEL": "m2", "NEWS_LLM_FALLBACK_API_KEY": "k2"}
        p = llm.env_providers(env)
        self.assertEqual([(x[0], x[1], x[2], x[3]) for x in p], [
            ("primary:deepseek", "https://api.deepseek.com/v1", "NEWS_LLM_API_KEY", "deepseek-chat"),
            ("fallback:custom", "https://gw.example.com/v1", "NEWS_LLM_FALLBACK_API_KEY", "m2")])
        self.assertEqual(p[0][4], {"response_format": {"type": "json_object"}})

    def test_incomplete_slots_are_skipped(self):
        self.assertEqual(llm.env_providers({}), [])
        self.assertEqual(llm.env_providers({"NEWS_LLM_PROVIDER": "openai"}), [])            # no key
        self.assertEqual(llm.env_providers({"NEWS_LLM_PROVIDER": "custom", "NEWS_LLM_API_KEY": "k"}), [])  # no base / model
        self.assertEqual(llm.env_providers({"NEWS_LLM_PROVIDER": "nope", "NEWS_LLM_API_KEY": "k"}), [])
        self.assertEqual(llm.env_providers({"NEWS_LLM_PROVIDER": "ollama"})[0][0], "primary:ollama")  # keyless
        self.assertEqual(llm.env_providers({"NEWS_LLM_PROVIDER": "anthropic", "NEWS_LLM_API_KEY": "k"})[0][4], {"_api": "anthropic"})

    def test_round_trip(self):
        srv = HTTPServer(("127.0.0.1", 0), Stub); threading.Thread(target=srv.serve_forever, daemon=True).start()
        env = {"NEWS_LLM_BASE_URL": f"http://127.0.0.1:{srv.server_port}/v1", "NEWS_LLM_MODEL": "stub-1", "NEWS_LLM_API_KEY": "sk-test"}
        old = dict(llm.os.environ); llm.os.environ.update(env)
        try:
            with tempfile.TemporaryDirectory() as d:
                chain = llm.Chain(llm.env_providers(), Path(d) / "log.jsonl", "2026-10-22", "am")
                name, model, out, meta = chain.call([{"role": "system", "content": "s"}, {"role": "user", "content": "u"}], "t")
                log = (Path(d) / "log.jsonl").read_text()
        finally:
            llm.os.environ.clear(); llm.os.environ.update(old); srv.shutdown()
        self.assertEqual((name, model, json.loads(out)), ("primary:custom", "stub-1", {"ok": 1}))
        path, auth, body = Stub.seen[-1]
        self.assertEqual((path, auth, body["model"]), ("/v1/chat/completions", "Bearer sk-test", "stub-1"))
        self.assertNotIn("sk-test", log)


if __name__ == "__main__":
    unittest.main()
