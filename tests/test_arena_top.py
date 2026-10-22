import os; os.environ.setdefault("NEWS_NO_MEDIA", "1")
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("arena_top", ROOT / "scripts" / "arena-top.py")
arena = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(arena)


class ArenaTopTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.rows = json.loads((ROOT / "tests" / "fixtures" / "arena-rows.json").read_text())

    def test_selects_latest_overall_and_top_rows(self):
        snapshot, rows = arena.select_rows(self.rows, board="code", top=10)
        self.assertEqual(snapshot, "2026-10-15")
        self.assertEqual([row["model"] for row in rows], ["new-model", "second-model"])
        self.assertEqual(rows[0]["score"], 1100)
        self.assertEqual(rows[0]["vote_count"], 20)

    def test_top_limit_and_rank_sort(self):
        rows = [
            {"model_name": f"m{i}", "rank": 11 - i, "rating": i, "category": "overall", "leaderboard_publish_date": "2026-10-15"}
            for i in range(11)
        ]
        _, selected = arena.select_rows(rows, board="code", top=10)
        self.assertEqual([row["rank"] for row in selected], list(range(1, 11)))

    def test_delta_and_same_snapshot(self):
        previous = {"boards": [{"name": "code", "snapshot_date": "2026-10-14", "rows": [{"model": "new-model", "rank": 3}]}]}
        rows = [arena.select_rows(self.rows, board="code", top=10)[1][0]]
        self.assertFalse(arena.apply_delta(rows, previous, "code", "2026-10-15"))
        self.assertEqual(rows[0]["delta_vs_previous"], 2)

        same = {"boards": [{"name": "code", "snapshot_date": "2026-10-15", "rows": [{"model": "new-model", "rank": 3}]}]}
        rows = [arena.select_rows(self.rows, board="code", top=10)[1][0]]
        self.assertTrue(arena.apply_delta(rows, same, "code", "2026-10-15"))
        self.assertIsNone(rows[0]["delta_vs_previous"])

    def test_fallback_rows_path(self):
        with patch.object(arena, "fetch_parquet_rows", side_effect=arena.FetchError("pyarrow is not installed")), patch.object(arena, "fetch_rows_api", return_value=self.rows):
            result = arena.fetch_board("code", 10, None)
        self.assertEqual(result["fetch_status"], "ok")
        self.assertEqual(result["snapshot_date"], "2026-10-15")

    def test_rows_api_paginates(self):
        calls = []

        class Response:
            status = 200

            def __init__(self, payload):
                self.payload = payload

            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

            def getcode(self):
                return self.status

            def read(self):
                return json.dumps(self.payload).encode()

        def opener(request, timeout):
            calls.append(request.full_url)
            offset = int(request.full_url.split("offset=")[1].split("&", 1)[0])
            page = self.rows[offset : offset + 2]
            return Response({"rows": [{"row": row} for row in page]})

        result = arena.fetch_rows_api("webdev", opener=opener, page_size=2)
        self.assertEqual(len(result), len(self.rows))
        self.assertEqual(len(calls), 3)

    def test_parquet_round_trip_when_pyarrow_available(self):
        try:
            import pyarrow as pa
            import pyarrow.parquet as pq
        except ImportError:
            self.skipTest("pyarrow is optional")
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "rows.parquet"
            pq.write_table(pa.Table.from_pylist(self.rows), path)
            payload = path.read_bytes()
            self.assertEqual(len(arena.read_parquet_rows(payload)), len(self.rows))

    def test_all_failed_exit_code(self):
        with patch.object(arena, "fetch_boards", return_value=[{"name": "code", "fetch_status": "failed", "rows": []}]), patch("sys.stdout.write"):
            self.assertEqual(arena.main(["--boards", "code"]), 2)

    def test_agent_input_alias_is_output_agent_code(self):
        with patch.object(arena, "fetch_boards", return_value=[]) as fetch:
            self.assertEqual(arena.main(["--boards", "agent"]), 2)
        fetch.assert_called_once_with(["agent_code"], 10, None)


if __name__ == "__main__":
    unittest.main()
