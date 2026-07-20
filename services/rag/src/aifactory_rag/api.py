from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi import Depends, FastAPI, HTTPException, Request
from pydantic import BaseModel, Field

from aifactory_rag.auth.entra import user_from_claims, validate_request
from aifactory_rag.config import FactoryConfig, load_factory_config
from aifactory_rag.db import fetch_all, fetch_one, migrate, connect, require_schema
from aifactory_rag.ingest.pipeline import ingest_source
from aifactory_rag.query.responder import answer_question


class QueryRequest(BaseModel):
    question: str
    sourceIds: list[str] = Field(default_factory=list)


class IngestRunRequest(BaseModel):
    sourceId: str
    force: bool = False
    subdir: str | None = None


def create_app(config_path: str | Path = "factory.config.json") -> FastAPI:
    factory_config = load_factory_config(config_path)
    require_schema(factory_config.rag.database.connection_string)
    app = FastAPI(title="AI Factory RAG", version="0.1.0")

    def auth_claims(request: Request) -> dict[str, Any]:
        return validate_request(request, factory_config.rag.auth)

    @app.get("/health")
    def health() -> dict[str, str]:
        with connect(factory_config.rag.database.connection_string) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
        return {"status": "ok"}

    @app.post("/query")
    def query(payload: QueryRequest, claims: dict[str, Any] = Depends(auth_claims)) -> dict:
        user_id = user_from_claims(claims)
        return answer_question(
            factory_config.rag,
            payload.question,
            user_id=user_id,
            source_ids=payload.sourceIds,
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
            SELECT id, source_id, relative_path, file_size, modified_at, status,
                   last_ingested_at, last_error, metadata
            FROM rag_documents
        """
        params: tuple[Any, ...] = ()
        if sourceId:
            query_text += " WHERE source_id = %s"
            params = (sourceId,)
        query_text += " ORDER BY source_id, relative_path LIMIT 500"
        with connect(factory_config.rag.database.connection_string) as conn:
            return fetch_all(conn, query_text, params)

    @app.post("/db/migrate")
    def migrate_db(_: dict[str, Any] = Depends(auth_claims)) -> dict[str, str]:
        migrate(factory_config.rag.database.connection_string)
        return {"status": "passed"}

    return app
