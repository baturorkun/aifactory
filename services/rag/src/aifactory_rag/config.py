from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any, Literal

from dotenv import load_dotenv
from pydantic import BaseModel, Field


ENV_PATTERN = re.compile(r"\$\{([A-Z0-9_]+)(?::-([^}]*))?\}", re.IGNORECASE)


class RagDatabaseConfig(BaseModel):
    connection_string: str = Field(
        default="postgresql://aifactory_rag:aifactory_rag@localhost:5432/aifactory_rag",
        alias="connectionString",
    )


class RagSourceConfig(BaseModel):
    id: str
    type: Literal["filesystem"] = "filesystem"
    root_path: str = Field(alias="rootPath")
    include: list[str] = Field(
        default_factory=lambda: [
            "**/*.txt",
            "**/*.md",
            "**/*.json",
            "**/*.csv",
            "**/*.html",
            "**/*.htm",
            "**/*.pdf",
            "**/*.docx",
            "**/*.pptx",
        ]
    )
    exclude: list[str] = Field(default_factory=lambda: ["**/~$*", "**/.DS_Store"])


class RagIngestConfig(BaseModel):
    chunk_size: int = Field(default=1200, alias="chunkSize")
    chunk_overlap: int = Field(default=150, alias="chunkOverlap")
    batch_size: int = Field(default=50, alias="batchSize")


class RagEmbeddingConfig(BaseModel):
    provider: Literal["openai", "gemini", "ollama"] = "openai"
    model: str = "text-embedding-3-small"
    dimensions: int = 1536
    api_key: str | None = Field(default=None, alias="apiKey")
    base_url: str | None = Field(default=None, alias="baseUrl")
    max_retries: int = Field(default=6, ge=0, alias="maxRetries")
    retry_base_seconds: float = Field(default=2.0, gt=0, alias="retryBaseSeconds")
    retry_max_seconds: float = Field(default=60.0, gt=0, alias="retryMaxSeconds")
    min_request_interval_seconds: float = Field(default=1.0, ge=0, alias="minRequestIntervalSeconds")


class RagLlmConfig(BaseModel):
    provider: Literal["openai", "claude", "gemini", "ollama"] = "openai"
    model: str = "gpt-4o-mini"
    api_key: str | None = Field(default=None, alias="apiKey")
    base_url: str | None = Field(default=None, alias="baseUrl")
    temperature: float = 0.1


class RagRetrievalConfig(BaseModel):
    top_k: int = Field(default=6, alias="topK")
    min_score: float | None = Field(default=None, alias="minScore")


class RagAuthConfig(BaseModel):
    provider: Literal["none", "entra"] = "none"
    tenant_id: str | None = Field(default=None, alias="tenantId")
    audience: str | None = None
    issuer: str | None = None
    enabled: bool = False


class RagApiConfig(BaseModel):
    host: str = "127.0.0.1"
    port: int = 8765


class RagGroundingConfig(BaseModel):
    enabled: bool = False
    chat_url: str | None = Field(default=None, alias="chatUrl")
    mode: Literal["always", "explicit"] = "always"
    marker: str = "@rag"
    source_ids: list[str] = Field(default_factory=list, alias="sourceIds")
    agents: list[str] = Field(
        default_factory=lambda: [
            "planner",
            "architect",
            "coder",
            "tester",
            "reviewer",
            "domain-guard",
        ]
    )
    timeout_ms: int = Field(default=120_000, gt=0, alias="timeoutMs")
    fail_open: bool = Field(default=True, alias="failOpen")
    max_context_chars: int = Field(default=12_000, gt=0, alias="maxContextChars")
    query_prefix: str = Field(
        default=(
            "Answer using the configured project documentation. Identify applicable rules, "
            "constraints, and source references."
        ),
        alias="queryPrefix",
    )


class RagConfig(BaseModel):
    database: RagDatabaseConfig = Field(default_factory=RagDatabaseConfig)
    sources: list[RagSourceConfig] = Field(default_factory=list)
    ingest: RagIngestConfig = Field(default_factory=RagIngestConfig)
    embedding: RagEmbeddingConfig = Field(default_factory=RagEmbeddingConfig)
    llm: RagLlmConfig = Field(default_factory=RagLlmConfig)
    retrieval: RagRetrievalConfig = Field(default_factory=RagRetrievalConfig)
    auth: RagAuthConfig = Field(default_factory=RagAuthConfig)
    grounding: RagGroundingConfig = Field(default_factory=RagGroundingConfig)
    api: RagApiConfig = Field(default_factory=RagApiConfig)


class FactoryConfig(BaseModel):
    rag: RagConfig = Field(default_factory=RagConfig)


def load_factory_config(config_path: str | Path = "factory.config.json") -> FactoryConfig:
    path = Path(config_path).resolve()
    load_dotenv(path.parent / ".env")
    if not path.exists():
        raise FileNotFoundError(f"Config file not found: {path}")

    raw = json.loads(path.read_text(encoding="utf-8"))
    expanded = _expand_env(raw)
    return FactoryConfig.model_validate(expanded)


def find_source(config: RagConfig, source_id: str) -> RagSourceConfig:
    for source in config.sources:
        if source.id == source_id:
            return source
    raise ValueError(f"RAG source not found: {source_id}")


def require_ingest_config(config: RagConfig) -> None:
    if config.embedding.provider == "openai" and not _has_value(config.embedding.api_key):
        raise RuntimeError("OPENAI_API_KEY is required for RAG ingest because embeddings are generated during ingest.")
    if config.embedding.provider == "gemini" and not _has_value(config.embedding.api_key):
        raise RuntimeError("GEMINI_API_KEY is required for RAG ingest when rag.embedding.provider is gemini.")


def require_query_config(config: RagConfig) -> None:
    require_ingest_config(config)
    if config.llm.provider == "openai" and not _has_value(config.llm.api_key):
        raise RuntimeError("OPENAI_API_KEY is required for RAG query when rag.llm.provider is openai.")
    if config.llm.provider == "claude" and not _has_value(config.llm.api_key):
        raise RuntimeError("ANTHROPIC_API_KEY is required for RAG query when rag.llm.provider is claude.")
    if config.llm.provider == "gemini" and not _has_value(config.llm.api_key):
        raise RuntimeError("GEMINI_API_KEY is required for RAG query when rag.llm.provider is gemini.")


def _has_value(value: str | None) -> bool:
    return value is not None and value.strip() != "" and value.strip() != "replace_me"


def _expand_env(value: Any) -> Any:
    if isinstance(value, str):
        return ENV_PATTERN.sub(_replace_env, value)
    if isinstance(value, list):
        return [_expand_env(item) for item in value]
    if isinstance(value, dict):
        return {key: _expand_env(entry) for key, entry in value.items()}
    return value


def _replace_env(match: re.Match[str]) -> str:
    name = match.group(1)
    default = match.group(2)
    value = os.environ.get(name)
    if value:
        return value
    if default is not None:
        return default
    raise RuntimeError(f"Environment variable not set: {name}")
