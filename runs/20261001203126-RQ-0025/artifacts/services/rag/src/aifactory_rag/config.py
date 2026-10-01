from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any, Literal, Mapping

from dotenv import load_dotenv
from pydantic import BaseModel, Field, field_validator


ENV_PATTERN = re.compile(r"\$\{([A-Z0-9_]+)(?::-([^}]*))?\}", re.IGNORECASE)


class RagDatabaseConfig(BaseModel):
    connection_string: str = Field(
        default="postgresql://aifactory_rag:aifactory_rag@localhost:5432/aifactory_rag",
        alias="connectionString",
    )


class GitRepositoryConfig(BaseModel):
    """One GitLab repository of a source, read from `<prefix>_REPO_<k>_*`."""

    entry: str
    url: str
    # The name of the variable that holds the token, never the token: the
    # configuration is printed and served (`/sources`), the variable is not.
    token_env: str = Field(alias="tokenEnv")
    ref: str | None = None


class GitGroupConfig(BaseModel):
    """A GitLab group of a source, read from `<prefix>_GROUP_<k>_*`."""

    entry: str
    url: str
    token_env: str = Field(alias="tokenEnv")
    project_exclude: list[str] = Field(default_factory=list, alias="projectExclude")


class RagJoernConfig(BaseModel):
    url: str = "http://127.0.0.1:8090"
    workspace: str = "/srv/rag-sources/joern"


class RagGitConfig(BaseModel):
    # Outside the deployed tree: rsync.sh deletes whatever the checkout lacks
    # under /srv/aifactory, and a mirror there would be cloned again each deploy.
    mirror_dir: str = Field(default="/srv/rag-sources/git", alias="mirrorDir")


DEFAULT_INCLUDE = [
    "**/*.txt",
    "**/*.md",
    "**/*.json",
    "**/*.csv",
    "**/*.html",
    "**/*.htm",
    "**/*.pdf",
    "**/*.docx",
    "**/*.pptx",
    "**/*.xlsx",
    "**/*.xlsm",
    "**/*.jpg",
    "**/*.jpeg",
    "**/*.png",
    "**/*.bmp",
    "**/*.tif",
    "**/*.tiff",
    "**/*.webp",
    "**/*.py",
    "**/*.pyi",
    "**/*.js",
    "**/*.jsx",
    "**/*.mjs",
    "**/*.cjs",
    "**/*.ts",
    "**/*.tsx",
    "**/*.mts",
    "**/*.cts",
    "**/*.java",
    "**/*.kt",
    "**/*.kts",
    "**/*.go",
    "**/*.rs",
    "**/*.c",
    "**/*.h",
    "**/*.cc",
    "**/*.cpp",
    "**/*.cxx",
    "**/*.hh",
    "**/*.hpp",
    "**/*.hxx",
    "**/*.cs",
    "**/*.fs",
    "**/*.fsx",
    "**/*.rb",
    "**/*.php",
    "**/*.swift",
    "**/*.scala",
    "**/*.sh",
    "**/*.bash",
    "**/*.zsh",
    "**/*.fish",
    "**/*.ps1",
    "**/*.sql",
    "**/*.yaml",
    "**/*.yml",
    "**/*.toml",
    "**/*.ini",
    "**/*.cfg",
    "**/*.conf",
    "**/*.xml",
    "**/*.vue",
    "**/*.svelte",
    "**/*.proto",
    "**/*.graphql",
    "**/*.gql",
    "**/*.dml",
    "**/*.simics",
    "**/*.mk",
    "**/*.inc",
    "**/*.include",
    "**/*.cmake",
    "**/Dockerfile",
    "**/Makefile",
    "**/GNUmakefile",
    "**/Rakefile",
    "**/Gemfile",
    "**/Procfile",
    "**/Jenkinsfile",
]


class RagSourceConfig(BaseModel):
    id: str
    type: Literal["filesystem"] = "filesystem"
    # The folder input. Optional: a source may hold only repositories.
    root_path: str | None = Field(default=None, alias="rootPath")
    # The slot's variable prefix (`RAG_SOURCE_3`); its numbered REPO_<k> and
    # GROUP_<k> entries are read from the environment under it.
    env_prefix: str | None = Field(default=None, alias="envPrefix")
    repositories: list[GitRepositoryConfig] = Field(default_factory=list)
    groups: list[GitGroupConfig] = Field(default_factory=list)
    # RQ-0025: build Joern graphs of this source's C/C++ inputs, and the
    # source, sink and interrupt-handler patterns its queries use.
    dataflow: bool = False
    dataflow_sources: str | None = Field(default=None, alias="dataflowSources")
    dataflow_sinks: str | None = Field(default=None, alias="dataflowSinks")
    dataflow_isr: str | None = Field(default=None, alias="dataflowIsr")
    include: list[str] = Field(default_factory=lambda: list(DEFAULT_INCLUDE))
    exclude: list[str] = Field(
        default_factory=lambda: [
            "**/~$*",
            "**/.DS_Store",
            "**/.git/**",
            "**/node_modules/**",
            "**/.venv/**",
            "**/venv/**",
            "**/__pycache__/**",
            "**/dist/**",
            "**/build/**",
            "**/coverage/**",
            "**/*.min.js",
            "**/*.map",
            "**/*.lock",
        ]
    )
    exclude_additions: list[str] = Field(default_factory=list, alias="excludeAdditions")

    @field_validator("root_path", mode="before")
    @classmethod
    def _blank_root_path_is_none(cls, value: object) -> object:
        return None if isinstance(value, str) and not value.strip() else value

    @property
    def has_inputs(self) -> bool:
        return bool(self.root_path or self.repositories or self.groups)

    @field_validator("exclude_additions", mode="before")
    @classmethod
    def parse_exclude_additions(cls, value: Any) -> Any:
        if not isinstance(value, str):
            return value
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError as exc:
            raise ValueError("excludeAdditions environment value must be a JSON array of glob strings") from exc
        if not isinstance(parsed, list) or not all(isinstance(item, str) for item in parsed):
            raise ValueError("excludeAdditions environment value must be a JSON array of glob strings")
        return parsed


class RagIngestConfig(BaseModel):
    chunk_size: int = Field(default=1200, alias="chunkSize")
    chunk_overlap: int = Field(default=150, alias="chunkOverlap")
    batch_size: int = Field(default=50, alias="batchSize")
    database_reconnect_retries: int = Field(default=12, ge=0, alias="databaseReconnectRetries")
    database_reconnect_delay_seconds: float = Field(default=5.0, gt=0, alias="databaseReconnectDelaySeconds")


class RagEmbeddingConfig(BaseModel):
    provider: Literal["openai", "gemini", "ollama", "local"] = "openai"
    model: str = "text-embedding-3-small"
    dimensions: int = 1536
    api_key: str | None = Field(default=None, alias="apiKey")
    base_url: str | None = Field(default=None, alias="baseUrl")
    cache_dir: str | None = Field(default=None, alias="cacheDir")
    model_path: str | None = Field(default=None, alias="modelPath")
    local_files_only: bool = Field(default=False, alias="localFilesOnly")
    threads: int | None = Field(default=None, gt=0)
    max_retries: int = Field(default=6, ge=0, alias="maxRetries")
    retry_base_seconds: float = Field(default=2.0, gt=0, alias="retryBaseSeconds")
    retry_max_seconds: float = Field(default=60.0, gt=0, alias="retryMaxSeconds")
    min_request_interval_seconds: float = Field(default=1.0, ge=0, alias="minRequestIntervalSeconds")


class RagLlmConfig(BaseModel):
    provider: Literal["openai", "claude", "claude-cli", "gemini", "ollama"] = "openai"
    model: str = "gpt-4o-mini"
    api_key: str | None = Field(default=None, alias="apiKey")
    base_url: str | None = Field(default=None, alias="baseUrl")
    temperature: float = 0.1
    # claude-cli only: the Claude Code executable and how long one answer may
    # take. The CLI authenticates from the signed-in session on the machine
    # running this service, which is what makes it usable without an API key.
    executable: str = Field(default="claude", alias="executable")
    timeout_seconds: float = Field(default=300.0, alias="timeoutSeconds")
    # claude-cli only: how hard the model thinks before answering, passed as
    # the CLI's --effort. Empty leaves the CLI's own default in place.
    effort: Literal["low", "medium", "high", "xhigh", "max"] | None = None

    @field_validator("effort", mode="before")
    @classmethod
    def _blank_effort_is_default(cls, value: object) -> object:
        return None if isinstance(value, str) and not value.strip() else value


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
    exclude_content_types: list[str] = Field(default_factory=list, alias="excludeContentTypes")
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

    @field_validator("source_ids", "exclude_content_types", mode="before")
    @classmethod
    def parse_comma_separated(cls, value: Any) -> Any:
        """Accept one comma-separated environment value as a list."""
        if not isinstance(value, str):
            return value
        return [item.strip() for item in value.split(",") if item.strip()]


class RagConfig(BaseModel):
    database: RagDatabaseConfig = Field(default_factory=RagDatabaseConfig)
    sources: list[RagSourceConfig] = Field(default_factory=list)
    git: RagGitConfig = Field(default_factory=RagGitConfig)
    joern: RagJoernConfig = Field(default_factory=RagJoernConfig)
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
    rag_raw = raw.get("rag", {})
    if not isinstance(rag_raw, dict):
        raise ValueError("factory.config.json field 'rag' must be an object")
    expanded_rag = _expand_env(rag_raw)
    sources = expanded_rag.get("sources")
    if isinstance(sources, list):
        for source in sources:
            if isinstance(source, dict) and source.get("envPrefix"):
                source.update(git_entries_from_env(str(source["envPrefix"]), str(source.get("id", "")), os.environ))
                source.update(dataflow_from_env(str(source["envPrefix"]), os.environ))
    config = FactoryConfig.model_validate({"rag": expanded_rag})
    # A slot that names neither a folder nor a repository is an unused template
    # slot, not a source.
    config.rag.sources = [source for source in config.rag.sources if source.has_inputs]
    return config


# REF values that are resolved at every ingest instead of naming a branch or
# tag. `@` because .env is sourced by a shell: `<LAST_RELEASE>` would be read as
# a redirection and leave the value silently empty.
REF_SELECTORS = ("@last-release", "@last-tag")

GIT_ENTRY_PATTERN = re.compile(r"^(REPO|GROUP)_(\d+)_(URL|TOKEN|REF|PROJECT_EXCLUDE)$")


def git_entries_from_env(prefix: str, source_id: str, environ: Mapping[str, str]) -> dict[str, list[dict[str, Any]]]:
    """Collect a slot's numbered repository and group entries.

    `<prefix>_REPO_<k>_URL` / `_TOKEN` / `_REF` and `<prefix>_GROUP_<k>_URL` /
    `_TOKEN` / `_PROJECT_EXCLUDE`. Numbers need not be contiguous. Only the
    token variable's name is kept; its value is read when git needs it.
    """
    found: dict[tuple[str, int], dict[str, str]] = {}
    for name, value in environ.items():
        if not name.startswith(prefix + "_"):
            continue
        match = GIT_ENTRY_PATTERN.match(name[len(prefix) + 1:])
        if not match or not value.strip():
            continue
        kind, number, field = match.group(1), int(match.group(2)), match.group(3)
        found.setdefault((kind, number), {})[field] = value.strip()

    repositories: list[dict[str, Any]] = []
    groups: list[dict[str, Any]] = []
    for (kind, number), fields in sorted(found.items(), key=lambda item: (item[0][0], item[0][1])):
        entry = f"{prefix}_{kind}_{number}"
        missing = [f"{entry}_{field}" for field in ("URL", "TOKEN") if field not in fields]
        if missing:
            label = f"{prefix} ({source_id})" if source_id else prefix
            raise ValueError(f"{label}: {entry} is incomplete, {' and '.join(missing)} not set")
        common = {"entry": entry, "url": fields["URL"], "tokenEnv": f"{entry}_TOKEN"}
        if kind == "REPO":
            ref = fields.get("REF")
            if ref and ref.startswith("@") and ref not in REF_SELECTORS:
                raise ValueError(
                    f"{entry}_REF={ref} is not a known selector; use a branch or tag name, or one of {', '.join(REF_SELECTORS)}"
                )
            repositories.append({**common, "ref": ref})
        else:
            groups.append({**common, "projectExclude": _json_glob_list(fields.get("PROJECT_EXCLUDE"), f"{entry}_PROJECT_EXCLUDE")})
    return {"repositories": repositories, "groups": groups}


def dataflow_from_env(prefix: str, environ: Mapping[str, str]) -> dict[str, Any]:
    """`<prefix>_DATAFLOW=on` and its optional `_SOURCES`, `_SINKS`, `_ISR` patterns."""
    flag = (environ.get(f"{prefix}_DATAFLOW") or "").strip().lower()
    values: dict[str, Any] = {"dataflow": flag in {"1", "on", "true", "yes"}}
    for suffix, key in (("SOURCES", "dataflowSources"), ("SINKS", "dataflowSinks"), ("ISR", "dataflowIsr")):
        value = (environ.get(f"{prefix}_DATAFLOW_{suffix}") or "").strip()
        if value:
            values[key] = value
    return values


def _json_glob_list(value: str | None, name: str) -> list[str]:
    if not value:
        return []
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError as exc:
        raise ValueError(f"{name} must be a JSON array of glob strings") from exc
    if not isinstance(parsed, list) or not all(isinstance(item, str) for item in parsed):
        raise ValueError(f"{name} must be a JSON array of glob strings")
    return parsed


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
