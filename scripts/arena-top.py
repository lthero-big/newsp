#!/usr/bin/env python3
"""Fetch deterministic Arena top-N snapshots from the official HF dataset.

The Arena web pages are protected by Cloudflare.  The public HF parquet files
are the primary source; the datasets-server rows endpoint is a paginated
fallback for machines without pyarrow or when parquet download/decoding fails.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
import time
from pathlib import Path
from typing import Any, Callable, Iterable
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


SOURCE = "hf:lmarena-ai/leaderboard-dataset"
HF_PARQUET_ROOT = "https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset/resolve/main"
ROWS_ENDPOINT = "https://datasets-server.huggingface.co/rows"
DEFAULT_BOARDS = ("code", "agent", "text_to_image", "image_edit", "vision")
BOARD_CONFIG = {
    "code": "webdev",
    "agent_code": "agent",
    "text_to_image": "text_to_image",
    "image_edit": "image_edit",
    "vision": "vision",
}
CONFIG_TO_NAME = {config: name for name, config in BOARD_CONFIG.items()}
INPUT_ALIASES = {"agent": "agent_code"}


class FetchError(RuntimeError):
    """A source fetch or parse error that is safe to put in output JSON."""


def _request_json(url: str, *, opener: Callable[..., Any] = urlopen, retries: int = 1) -> Any:
    """Fetch JSON, retrying transient 502 responses when requested."""
    last_error: Exception | None = None
    for attempt in range(retries):
        try:
            request = Request(url, headers={"User-Agent": "news-daily/arena-top"})
            with opener(request, timeout=30) as response:
                status = getattr(response, "status", None)
                if status is None:
                    status = response.getcode()
                body = response.read()
            if status != 200:
                raise FetchError(f"HTTP {status} from {url}")
            try:
                return json.loads(body)
            except (TypeError, ValueError) as error:
                raise FetchError(f"invalid JSON from {url}: {error}") from error
        except HTTPError as error:
            last_error = FetchError(f"HTTP {error.code} from {url}")
            if error.code != 502 or attempt + 1 == retries:
                break
        except (URLError, TimeoutError, OSError, FetchError) as error:
            last_error = error if isinstance(error, FetchError) else FetchError(f"network error from {url}: {error}")
            if isinstance(error, FetchError) and not str(error).startswith("HTTP 502"):
                break
        if attempt + 1 < retries:
            time.sleep(0.2 * (attempt + 1))
    raise last_error or FetchError(f"failed to fetch {url}")


def _request_bytes(url: str, *, opener: Callable[..., Any] = urlopen) -> bytes:
    try:
        request = Request(url, headers={"User-Agent": "news-daily/arena-top"})
        with opener(request, timeout=60) as response:
            status = getattr(response, "status", None)
            if status is None:
                status = response.getcode()
            if status != 200:
                raise FetchError(f"HTTP {status} from {url}")
            return response.read()
    except HTTPError as error:
        raise FetchError(f"HTTP {error.code} from {url}") from error
    except (URLError, TimeoutError, OSError) as error:
        raise FetchError(f"network error from {url}: {error}") from error


def read_parquet_rows(payload: bytes) -> list[dict[str, Any]]:
    """Decode parquet bytes with the optional pyarrow dependency."""
    try:
        import pyarrow as pa
        import pyarrow.parquet as pq
    except ImportError as error:
        raise FetchError("pyarrow is not installed") from error
    try:
        return pq.read_table(pa.BufferReader(payload)).to_pylist()
    except Exception as error:  # pyarrow exposes several parser exception types
        raise FetchError(f"parquet parse error: {error}") from error


def fetch_parquet_rows(config: str, *, opener: Callable[..., Any] = urlopen) -> list[dict[str, Any]]:
    url = f"{HF_PARQUET_ROOT}/{config}/latest-00000-of-00001.parquet"
    return read_parquet_rows(_request_bytes(url, opener=opener))


def _unwrap_rows(payload: Any) -> list[dict[str, Any]]:
    if not isinstance(payload, dict):
        raise FetchError("rows API response is not an object")
    values = payload.get("rows", payload.get("data", payload.get("features")))
    if not isinstance(values, list):
        raise FetchError("rows API response has no rows array")
    result = []
    for value in values:
        if isinstance(value, dict) and isinstance(value.get("row"), dict):
            value = value["row"]
        if not isinstance(value, dict):
            raise FetchError("rows API returned a non-object row")
        result.append(value)
    return result


def fetch_rows_api(
    config: str,
    *,
    opener: Callable[..., Any] = urlopen,
    endpoint: str = ROWS_ENDPOINT,
    page_size: int = 100,
) -> list[dict[str, Any]]:
    """Read every rows API page, retrying 502 three times per page."""
    all_rows: list[dict[str, Any]] = []
    offset = 0
    while True:
        query = urlencode({"dataset": "lmarena-ai/leaderboard-dataset", "config": config, "split": "train", "offset": offset, "length": page_size})
        page = _unwrap_rows(_request_json(f"{endpoint}?{query}", opener=opener, retries=3))
        all_rows.extend(page)
        if len(page) < page_size:
            break
        offset += len(page)
    return all_rows


def _date(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    if "T" in text:
        text = text.split("T", 1)[0]
    if len(text) >= 10:
        text = text[:10]
    try:
        return dt.date.fromisoformat(text).isoformat()
    except ValueError:
        return None


def _number(value: Any) -> int | float | None:
    if value is None or value == "":
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return int(number) if number.is_integer() else number


def _rank(value: Any) -> int | None:
    number = _number(value)
    return int(number) if number is not None else None


def select_rows(raw_rows: Iterable[dict[str, Any]], *, board: str, top: int) -> tuple[str | None, list[dict[str, Any]]]:
    """Keep the latest overall snapshot and normalize its top rows."""
    rows = [row for row in raw_rows if str(row.get("category", "")).lower() == "overall"]
    if not rows:
        raise FetchError("no category=overall rows")
    dates = [_date(row.get("leaderboard_publish_date")) for row in rows]
    snapshot = max((value for value in dates if value), default=None)
    if snapshot:
        rows = [row for row in rows if _date(row.get("leaderboard_publish_date")) == snapshot]
    normalized = []
    for row in rows:
        model = row.get("model_name", row.get("model"))
        if model is None or str(model).strip() == "":
            continue
        normalized.append({
            "rank": _rank(row.get("rank")),
            "model": str(model),
            "score": _number(row.get("score", row.get("rating"))),
            "vote_count": _number(row.get("vote_count")),
            "organization": row.get("organization"),
            "license": row.get("license"),
        })
    if not normalized:
        raise FetchError("overall rows have no model_name")
    normalized.sort(key=lambda row: (row["rank"] is None, row["rank"] if row["rank"] is not None else 10**9, -(row["score"] or 0), row["model"]))
    return snapshot, normalized[:top]


def _previous_board(previous: Any, name: str) -> dict[str, Any] | None:
    if isinstance(previous, list):
        boards = previous
    elif isinstance(previous, dict):
        boards = previous.get("boards")
        if boards is None:
            boards = []
            for group in (previous.get("arena", {}).get("code", {}), previous.get("arena", {}).get("image", {})):
                boards.extend(group.get("boards", []) if isinstance(group, dict) else [])
    else:
        boards = []
    if not isinstance(boards, list):
        return None
    aliases = {name, BOARD_CONFIG.get(name), CONFIG_TO_NAME.get(name)}
    return next((board for board in boards if isinstance(board, dict) and board.get("name") in aliases), None)


def apply_delta(rows: list[dict[str, Any]], previous: Any, name: str, snapshot: str | None) -> bool | None:
    board = _previous_board(previous, name)
    if board is None:
        for row in rows:
            row["delta_vs_previous"] = None
        return None
    previous_snapshot = _date(board.get("snapshot_date"))
    unchanged = bool(snapshot and previous_snapshot and snapshot == previous_snapshot)
    old_ranks = {str(row.get("model")): _rank(row.get("rank")) for row in board.get("rows", []) if isinstance(row, dict)}
    for row in rows:
        if unchanged:
            row["delta_vs_previous"] = None
            continue
        old_rank = old_ranks.get(row["model"])
        row["delta_vs_previous"] = "new" if old_rank is None else (old_rank - row["rank"] if row["rank"] is not None else None)
    return unchanged


def fetch_board(name: str, top: int, previous: Any, *, opener: Callable[..., Any] = urlopen) -> dict[str, Any]:
    config = BOARD_CONFIG[name]
    parquet_error: Exception | None = None
    try:
        raw_rows = fetch_parquet_rows(config, opener=opener)
    except Exception as error:
        parquet_error = error
        try:
            raw_rows = fetch_rows_api(config, opener=opener)
        except Exception as fallback_error:
            raise FetchError(f"parquet: {parquet_error}; rows API: {fallback_error}") from fallback_error
    snapshot, rows = select_rows(raw_rows, board=name, top=top)
    unchanged = apply_delta(rows, previous, name, snapshot)
    result: dict[str, Any] = {"name": name, "source": SOURCE, "snapshot_date": snapshot, "fetch_status": "ok", "rows": rows}
    if unchanged is not None:
        result["snapshot_unchanged"] = unchanged
    return result


def fetch_boards(names: Iterable[str], top: int, previous: Any, *, opener: Callable[..., Any] = urlopen) -> list[dict[str, Any]]:
    results = []
    for name in names:
        try:
            results.append(fetch_board(name, top, previous, opener=opener))
        except Exception as error:
            results.append({"name": name, "source": SOURCE, "snapshot_date": None, "fetch_status": "failed", "error": str(error), "failure_reason": str(error), "rows": []})
    return results


def _delta_label(value: Any, *, baseline: bool, unchanged: bool) -> str:
    if baseline:
        return "基线"
    if unchanged:
        return "无变化"
    if value == "new":
        return "新进榜"
    if value is None:
        return "无可用对照"
    if value > 0:
        return f"↑{value}"
    if value < 0:
        return f"↓{abs(value)}"
    return "0"


def to_markdown(boards: Iterable[dict[str, Any]]) -> str:
    chunks = []
    for board in boards:
        chunks.extend([f"### {board['name']}", "", "| 名次 | 模型 | 分数 | 相对昨日 |", "|---:|---|---:|---|"])
        unchanged = board.get("snapshot_unchanged") is True
        baseline = "snapshot_unchanged" not in board and not any(row.get("delta_vs_previous") is not None for row in board.get("rows", []))
        if board.get("fetch_status") == "ok":
            for row in board.get("rows", []):
                chunks.append(f"| {row.get('rank', '—')} | {row.get('model', '—')} | {row.get('score', '—')} | {_delta_label(row.get('delta_vs_previous'), baseline=baseline, unchanged=unchanged)} |")
        else:
            chunks.append(f"| — | 取数失败 | — | 无可用对照 |")
            chunks.append(f"\n> {board.get('failure_reason', board.get('error', '未知错误'))}")
        chunks.extend(["", f"数据来自 Arena 官方 HF 数据集 latest 快照，快照日期 {board.get('snapshot_date') or '未知'}", ""])
    return "\n".join(chunks).rstrip() + "\n"


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--boards", default=",".join(DEFAULT_BOARDS), help="comma-separated board names")
    parser.add_argument("--top", type=int, default=10)
    parser.add_argument("--previous", type=Path)
    parser.add_argument("--out", type=Path)
    parser.add_argument("--markdown", action="store_true", help="write Markdown tables instead of JSON")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    requested = [name.strip() for name in args.boards.split(",") if name.strip()]
    names = [INPUT_ALIASES.get(name, name) for name in requested]
    unknown = [name for name in requested if name not in BOARD_CONFIG and name not in INPUT_ALIASES]
    if unknown or not names or args.top < 1:
        print(f"invalid boards/top: {unknown or names}, top={args.top}", file=sys.stderr)
        return 2
    previous: Any = None
    if args.previous:
        try:
            previous = json.loads(args.previous.read_text(encoding="utf-8"))
        except (OSError, ValueError) as error:
            print(f"cannot read --previous: {error}", file=sys.stderr)
            return 2
    boards = fetch_boards(names, args.top, previous)
    content = to_markdown(boards) if args.markdown else json.dumps({"boards": boards}, ensure_ascii=False, indent=2) + "\n"
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(content, encoding="utf-8")
    else:
        print(content, end="")
    return 2 if all(board["fetch_status"] == "failed" for board in boards) else 0


if __name__ == "__main__":
    raise SystemExit(main())
