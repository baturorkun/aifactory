"""How fresh each source is (RQ-0029): its last ingest, its inputs' commits,
its data-flow graphs, and whether an ingest is running now."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

# A run still marked running after this long died without finishing.
STALE_AFTER = timedelta(hours=6)

RUN_COLUMNS = (
    "id, source_id, status, started_at, finished_at, scanned_count, inserted_count, "
    "updated_count, skipped_count, deleted_count, error_count"
)


def summarize(
    source_ids: list[str],
    latest_runs: list[dict[str, Any]],
    finished_runs: list[dict[str, Any]],
    inputs: list[dict[str, Any]],
    graphs: list[dict[str, Any]],
    now: datetime | None = None,
) -> list[dict[str, Any]]:
    now = now or datetime.now(timezone.utc)
    latest = {row["source_id"]: row for row in latest_runs}
    finished = {row["source_id"]: row for row in finished_runs}
    result: list[dict[str, Any]] = []
    for source_id in source_ids:
        current = latest.get(source_id)
        last = finished.get(source_id)
        running = bool(current and current["status"] == "running" and current.get("finished_at") is None)
        stale = running and _aware(current["started_at"]) < now - STALE_AFTER
        if running and not stale:
            state = "updating"
        elif last is None:
            state = "never"
        elif last["status"] == "passed":
            state = "current"
        elif (last.get("error_count") or 0) > 0 and (last.get("scanned_count") or 0) > last["error_count"]:
            state = "file-errors"  # a few unreadable files, not a broken corpus
        else:
            state = "failed"
        result.append({
            "sourceId": source_id,
            "state": "stale" if stale else state,
            "updatedAt": _iso(last.get("finished_at")) if last else None,
            "running": _run(current) if running and not stale else None,
            "lastRun": _run(last) if last else None,
            "inputs": [
                {
                    "input": row["input_key"], "url": row.get("url"), "ref": row.get("ref"), "commit": row.get("commit_sha"),
                    "ingestedAt": _iso(row.get("ingested_at")), "files": row.get("file_count"),
                    **({"commitUrl": f"{row['url']}/-/commit/{row['commit_sha']}"}
                       if str(row.get("url") or "").startswith(("http://", "https://")) and row.get("commit_sha") else {}),
                }
                for row in sorted((r for r in inputs if r["source_id"] == source_id), key=lambda r: r["input_key"])
            ],
            "dataflow": [
                {"input": row["input_key"] or "path", "project": row["project"], "ref": row.get("ref"),
                 "commit": row.get("commit_sha"), "builtAt": _iso(row.get("built_at"))}
                for row in sorted((r for r in graphs if r["source_id"] == source_id), key=lambda r: r["input_key"])
            ],
        })
    return result


def _run(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"], "status": row["status"],
        "startedAt": _iso(row.get("started_at")), "finishedAt": _iso(row.get("finished_at")),
        "scanned": row.get("scanned_count"), "inserted": row.get("inserted_count"), "updated": row.get("updated_count"),
        "skipped": row.get("skipped_count"), "deleted": row.get("deleted_count"), "errors": row.get("error_count"),
    }


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def _iso(value: Any) -> str | None:
    return _aware(value).isoformat() if isinstance(value, datetime) else None
