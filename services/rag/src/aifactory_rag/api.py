from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from aifactory_rag import build_info
from aifactory_rag.auth.entra import user_from_claims, validate_request
from aifactory_rag.config import FactoryConfig, RagSourceConfig, find_source, load_factory_config
from aifactory_rag.db import fetch_all, fetch_one, migrate, connect, require_schema
from aifactory_rag.ingest.pipeline import ingest_source
from aifactory_rag.query import graph
from aifactory_rag.query.responder import answer_question


class QueryRequest(BaseModel):
    question: str
    sourceIds: list[str] = Field(default_factory=list)
    excludeContentTypes: list[str] = Field(default_factory=list)
    # Add the callers and callees of the functions found (RQ-0024).
    expandGraph: bool = True


class IngestRunRequest(BaseModel):
    sourceId: str
    force: bool = False
    subdir: str | None = None


def resolve_source_file(source: RagSourceConfig, relative_path: str) -> Path:
    if not source.root_path:
        raise ValueError("This source has no folder; its repository files open on GitLab")
    requested = Path(relative_path)
    if not relative_path.strip() or requested.is_absolute():
        raise ValueError("Document path must be relative to its configured source")

    root = Path(source.root_path).expanduser().resolve()
    resolved = (root / requested).resolve()
    try:
        resolved.relative_to(root)
    except ValueError as exc:
        raise ValueError("Document path resolves outside its configured source") from exc
    return resolved


def create_app(config_path: str | Path = "factory.config.json") -> FastAPI:
    factory_config = load_factory_config(config_path)
    running = build_info.capture()
    require_schema(factory_config.rag.database.connection_string)
    app = FastAPI(title="AI Factory RAG", version=running.version)

    def auth_claims(request: Request) -> dict[str, Any]:
        return validate_request(request, factory_config.rag.auth)

    @app.get("/health")
    def health() -> dict[str, str]:
        with connect(factory_config.rag.database.connection_string) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
        return {"status": "ok"}

    @app.get("/runtime-info")
    def runtime_info(_: dict[str, Any] = Depends(auth_claims)) -> dict[str, dict[str, Any]]:
        return {
            "llm": {
                "provider": factory_config.rag.llm.provider,
                "model": factory_config.rag.llm.model,
            },
            # Which code is running and since when, so a deployment and a
            # restart can be confirmed from the web page (build_info.py).
            "build": running.as_dict(),
        }

    @app.post("/query")
    def query(payload: QueryRequest, claims: dict[str, Any] = Depends(auth_claims)) -> dict:
        user_id = user_from_claims(claims)
        return answer_question(
            factory_config.rag,
            payload.question,
            user_id=user_id,
            source_ids=payload.sourceIds,
            exclude_content_types=payload.excludeContentTypes,
            expand_graph=payload.expandGraph,
        )

    @app.post("/ingest-runs")
    def create_ingest_run(payload: IngestRunRequest, _: dict[str, Any] = Depends(auth_claims)) -> dict:
        summary = ingest_source(factory_config.rag, payload.sourceId, force=payload.force, subdir=payload.subdir)
        return summary.__dict__

    @app.get("/ingest-runs/{run_id}")
    def get_ingest_run(run_id: int, _: dict[str, Any] = Depends(auth_claims)) -> dict:
        with connect(factory_config.rag.database.connection_string) as conn:
            row = fetch_one(conn, "SELECT * FROM rag_ingest_runs WHERE id = %s", (run_id,))
        if not row:
            raise HTTPException(status_code=404, detail="Ingest run not found")
        return row

    @app.get("/sources")
    def sources(_: dict[str, Any] = Depends(auth_claims)) -> list[dict]:
        return [
            source.model_dump(by_alias=True)
            for source in factory_config.rag.sources
        ]

    @app.get("/documents")
    def documents(sourceId: str | None = None, _: dict[str, Any] = Depends(auth_claims)) -> list[dict]:
        query_text = """
            SELECT id, source_id, input_key, relative_path, file_size, modified_at, status,
                   last_ingested_at, last_error, metadata
            FROM rag_documents
        """
        params: tuple[Any, ...] = ()
        if sourceId:
            query_text += " WHERE source_id = %s"
            params = (sourceId,)
        query_text += " ORDER BY source_id, input_key, relative_path LIMIT 500"
        with connect(factory_config.rag.database.connection_string) as conn:
            return fetch_all(conn, query_text, params)

    @app.get("/documents/download")
    def download_document(
        sourceId: str,
        relativePath: str,
        _: dict[str, Any] = Depends(auth_claims),
    ) -> FileResponse:
        try:
            source = find_source(factory_config.rag, sourceId)
        except ValueError as exc:
            raise HTTPException(status_code=404, detail="RAG source not found") from exc
        try:
            path = resolve_source_file(source, relativePath)
        except (OSError, RuntimeError, ValueError) as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        with connect(factory_config.rag.database.connection_string) as conn:
            indexed = fetch_one(
                conn,
                """
                SELECT id
                FROM rag_documents
                WHERE source_id = %s AND input_key = '' AND relative_path = %s AND status = 'active'
                """,
                (sourceId, relativePath),
            )
        if not indexed or not path.is_file():
            raise HTTPException(status_code=404, detail="Active indexed document not found")

        return FileResponse(
            path,
            filename=path.name,
            headers={"Cache-Control": "private, no-store"},
        )

    def _source_list(sourceIds: str | None) -> list[str] | None:
        return [item.strip() for item in sourceIds.split(",") if item.strip()] if sourceIds else None

    def _graph(query: Any, *args: Any) -> Any:
        with connect(factory_config.rag.database.connection_string) as conn:
            return query(conn, *args)

    # The symbol graph (RQ-0024). `name` is a symbol, qualified or short;
    # `sourceIds` is an optional comma-separated list.
    @app.get("/symbols")
    def symbols(name: str, sourceIds: str | None = None, _: dict[str, Any] = Depends(auth_claims)) -> list[dict]:
        return _graph(graph.find_symbols, name, _source_list(sourceIds))

    @app.get("/callers")
    def callers(name: str, sourceIds: str | None = None, _: dict[str, Any] = Depends(auth_claims)) -> list[dict]:
        return _graph(graph.callers, name, _source_list(sourceIds))

    @app.get("/callees")
    def callees(name: str, sourceIds: str | None = None, _: dict[str, Any] = Depends(auth_claims)) -> list[dict]:
        return _graph(graph.callees, name, _source_list(sourceIds))

    @app.get("/references")
    def references(name: str, sourceIds: str | None = None, _: dict[str, Any] = Depends(auth_claims)) -> list[dict]:
        return _graph(graph.references, name, _source_list(sourceIds))

    @app.get("/impact")
    def impact(name: str, sourceIds: str | None = None, depth: int = 3, _: dict[str, Any] = Depends(auth_claims)) -> dict:
        return _graph(graph.impact, name, _source_list(sourceIds), depth)

    @app.post("/db/migrate")
    def migrate_db(_: dict[str, Any] = Depends(auth_claims)) -> dict[str, str]:
        migrate(factory_config.rag.database.connection_string)
        return {"status": "passed"}

    return app
