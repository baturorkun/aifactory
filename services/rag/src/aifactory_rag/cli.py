from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import uvicorn

from aifactory_rag.api import create_app
from aifactory_rag.config import load_factory_config
from aifactory_rag.db import fetch_all, fetch_one, migrate, connect, require_schema
from aifactory_rag.ingest.pipeline import ingest_source
from aifactory_rag.query.responder import answer_question


def main(argv: list[str] | None = None) -> int:
    try:
        return _main(argv)
    except RuntimeError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1


def _main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="aifactory-rag")
    parser.add_argument("--config", default="factory.config.json")
    sub = parser.add_subparsers(dest="command", required=True)

    db_parser = sub.add_parser("db")
    db_sub = db_parser.add_subparsers(dest="db_command", required=True)
    db_sub.add_parser("migrate")

    ingest_parser = sub.add_parser("ingest")
    ingest_parser.add_argument("--source", required=True)
    ingest_parser.add_argument("--force", action="store_true")

    sub.add_parser("status")

    query_parser = sub.add_parser("query")
    query_parser.add_argument("question")

    api_parser = sub.add_parser("api")
    api_sub = api_parser.add_subparsers(dest="api_command", required=True)
    api_start = api_sub.add_parser("start")
    api_start.add_argument("--host")
    api_start.add_argument("--port", type=int)

    args = parser.parse_args(argv)
    config = load_factory_config(args.config)

    if args.command == "db" and args.db_command == "migrate":
        migrate(config.rag.database.connection_string)
        print_json({"status": "passed"})
        return 0

    if args.command == "ingest":
        summary = ingest_source(config.rag, args.source, force=args.force)
        print_json(summary.__dict__)
        return 0 if summary.status == "passed" else 2

    if args.command == "status":
        require_schema(config.rag.database.connection_string)
        print_json(_status(config.rag.database.connection_string))
        return 0

    if args.command == "query":
        print_json(answer_question(config.rag, args.question))
        return 0

    if args.command == "api" and args.api_command == "start":
        app = create_app(Path(args.config))
        uvicorn.run(
            app,
            host=args.host or config.rag.api.host,
            port=args.port or config.rag.api.port,
        )
        return 0

    parser.error("Unsupported command")
    return 2


def _status(connection_string: str) -> dict:
    with connect(connection_string) as conn:
        documents = fetch_one(
            conn,
            """
            SELECT
              count(*) FILTER (WHERE status = 'active') AS active_documents,
              count(*) FILTER (WHERE status = 'deleted') AS deleted_documents
            FROM rag_documents
            """,
        ) or {}
        chunks = fetch_one(
            conn,
            "SELECT count(*) AS active_chunks FROM rag_chunks WHERE status = 'active'",
        ) or {}
        runs = fetch_all(
            conn,
            """
            SELECT id, source_id, status, started_at, finished_at,
                   scanned_count, inserted_count, updated_count, skipped_count,
                   deleted_count, error_count
            FROM rag_ingest_runs
            ORDER BY started_at DESC
            LIMIT 10
            """,
        )
    return {"documents": documents, "chunks": chunks, "recentRuns": runs}


def print_json(value: object) -> None:
    print(json.dumps(value, indent=2, default=str))


if __name__ == "__main__":
    sys.exit(main())
