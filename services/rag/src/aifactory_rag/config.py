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
    # RQ-0028: the variable holding the GitLab webhook's secret token, when the
    # repository pushes to the RAG; again only the name is kept.
    webhook_secret_env: str | None = Field(default=None, alias="webhookSecretEnv")


class GitGroupConfig(BaseModel):
    """A GitLab group of a source, read from `<prefix>_GROUP_<k>_*`."""

    entry: str
    url: str
    token_env: str = Field(alias="tokenEnv")
    project_exclude: list[str] = Field(default_factory=list, alias="projectExclude")


class DoorsDatabaseConfig(BaseModel):
    """One IBM DOORS server of a source, read from `<prefix>_DOORS_<k>_*` (RQ-0037)."""

    entry: str
    # The server's database in DOORS's own notation, port@host: 36677@192.168.2.101.
    database: str
    # Where the DOORS client runs, as an SSH destination: the server itself.
    client: str
    user: str
    # The name of the variable that holds the password, as with a repository's token.
    password_env: str = Field(alias="passwordEnv")
    # Projects, folders or modules; every formal module under them is read.
    paths: list[str] = Field(default_factory=lambda: ["/"])
    # Globs matched against a module's full name.
    exclude: list[str] = Field(default_factory=list)


class RagDoorsConfig(BaseModel):
    """How DOORS is reached (RQ-0037): classic DOORS has no web interface, its
    data comes out through a DOORS client running a DXL script."""

    # Only when the DOORS client is not on the DOORS server itself: the Windows
    # PCs that have one, as SSH destinations (user@host), the preferred one
    # first, separated by commas. Empty: each entry's own server.
    clients: str = ""
    # doors.exe on the client; found under Program Files when empty.
    executable: str = ""
    # Outside the deployed tree, like the git mirror.
    mirror_dir: str = Field(default="/srv/rag-sources/doors", alias="mirrorDir")
    # How long one doors.exe run (the listing, or the export) may take.
    timeout_seconds: float = Field(default=600.0, gt=0, alias="timeoutSeconds")


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
    # An IBM DOORS module exported by doors_client/export.dxl (RQ-0037).
    "**/*.doors.jsonl",
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
    # FPGA projects (RQ-0059): HDL, constraints and the Tcl that builds them,
    # indexed as code. Before this a board's pins (an .xdc) were never in a
    # corpus that held the board's firmware.
    "**/*.v",
    "**/*.vh",
    "**/*.sv",
    "**/*.svh",
    "**/*.vhd",
    "**/*.vhdl",
    "**/*.xdc",
    "**/*.sdc",
    "**/*.pdc",
    "**/*.ucf",
    "**/*.qsf",
    "**/*.lpf",
    "**/*.tcl",
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
    # A passive source (`RAG_SOURCE_N_ENABLED=off`, RQ-0033) keeps its rows but
    # is neither ingested nor searched.
    enabled: bool = True
    # The folder input. Optional: a source may hold only repositories.
    root_path: str | None = Field(default=None, alias="rootPath")
    # The slot's variable prefix (`RAG_SOURCE_3`); its numbered REPO_<k>,
    # GROUP_<k> and DOORS_<k> entries are read from the environment under it.
    env_prefix: str | None = Field(default=None, alias="envPrefix")
    repositories: list[GitRepositoryConfig] = Field(default_factory=list)
    groups: list[GitGroupConfig] = Field(default_factory=list)
    # DOORS databases whose modules join the source (RQ-0037), from DOORS_<k>.
    doors: list[DoorsDatabaseConfig] = Field(default_factory=list)
    # RQ-0025: build Joern graphs of this source's C/C++ inputs, and the
    # source, sink and interrupt-handler patterns its queries use.
    dataflow: bool = False
    dataflow_sources: str | None = Field(default=None, alias="dataflowSources")
    dataflow_sinks: str | None = Field(default=None, alias="dataflowSinks")
    dataflow_isr: str | None = Field(default=None, alias="dataflowIsr")
    # Patterns of the other language families (RQ-0032): {"js": {"sources": ...}}.
    dataflow_families: dict[str, dict[str, str]] = Field(default_factory=dict, alias="dataflowFamilies")
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
            # What an FPGA tool generates beside a project (RQ-0059): Vivado's
            # IP output and run directories, and Quartus's databases. The
            # sources, constraints and Tcl a project is made of stay in; a
            # generated IP model (one transceiver wizard alone is 244 chunks)
            # would bury them.
            "**/*.gen/**",
            "**/*.ip_user_files/**",
            "**/*.cache/**",
            "**/*.runs/**",
            "**/*.sim/**",
            "**/*.hw/**",
            "**/*.srcs/**/ip/**",
            "**/.Xil/**",
            "**/incremental_db/**",
        ]
    )
    exclude_additions: list[str] = Field(default_factory=list, alias="excludeAdditions")

    @field_validator("root_path", mode="before")
    @classmethod
    def _blank_root_path_is_none(cls, value: object) -> object:
        return None if isinstance(value, str) and not value.strip() else value

    @property
    def has_inputs(self) -> bool:
        return bool(self.root_path or self.repositories or self.groups or self.doors)

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
    # Share of time spent embedding (0-1]. Below 1 every batch is followed by a
    # pause, so a bulk re-embed leaves the embedding GPU free for questions
    # part of the time: 0.5 rests as long as each batch took.
    duty_cycle: float = Field(default=1.0, gt=0, le=1, alias="dutyCycle")
    # The order an input's files are ingested in. `size`, the default, takes
    # the smallest first: most documents become searchable early and the few
    # huge manuals come last (the total time is the same). `path` is the
    # order they are scanned in.
    order: Literal["path", "size"] = "size"
    database_reconnect_retries: int = Field(default=12, ge=0, alias="databaseReconnectRetries")
    database_reconnect_delay_seconds: float = Field(default=5.0, gt=0, alias="databaseReconnectDelaySeconds")
    # A daily ingest of every active source at this hour ("HH:MM") by the
    # service, in schedule_timezone (an IANA name; empty: the host's local
    # time). Empty: no schedule, and a folder source is ingested only by hand
    # or through the API (RQ-0051).
    schedule: str | None = Field(default=None, pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    schedule_timezone: str | None = Field(default=None, alias="scheduleTimezone")

    @field_validator("schedule", "schedule_timezone", mode="before")
    @classmethod
    def _blank_schedule_is_none(cls, value: object) -> object:
        return None if isinstance(value, str) and not value.strip() else value


class RagEmbeddingConfig(BaseModel):
    provider: Literal["openai", "gemini", "ollama", "local"] = "openai"
    model: str = "text-embedding-3-small"
    dimensions: int = 1536
    api_key: str | None = Field(default=None, alias="apiKey")
    # Ollama: one address, or several separated by commas (RQ-0035).
    base_url: str | None = Field(default=None, alias="baseUrl")
    # How long an Ollama host that did not answer is left out before it is tried again.
    host_retry_seconds: float = Field(default=60.0, ge=0, alias="hostRetrySeconds")
    cache_dir: str | None = Field(default=None, alias="cacheDir")
    model_path: str | None = Field(default=None, alias="modelPath")
    local_files_only: bool = Field(default=False, alias="localFilesOnly")
    threads: int | None = Field(default=None, gt=0)
    max_retries: int = Field(default=6, ge=0, alias="maxRetries")
    retry_base_seconds: float = Field(default=2.0, gt=0, alias="retryBaseSeconds")
    retry_max_seconds: float = Field(default=60.0, gt=0, alias="retryMaxSeconds")
    min_request_interval_seconds: float = Field(default=1.0, ge=0, alias="minRequestIntervalSeconds")
    # How long one batch may take (Ollama on a lab machine: minutes for a large one).
    timeout_seconds: float = Field(default=600.0, gt=0, alias="timeoutSeconds")
    # Prefixed to questions, never to documents (Qwen3-Embedding is trained so).
    query_instruction: str | None = Field(default=None, alias="queryInstruction")


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
    # How many candidates the HNSW index keeps while it searches (pgvector's
    # hnsw.ef_search, 40 by default, 1000 at most). At 40 the index missed the
    # true nearest chunk for 4 of 100 questions, a requirement asked for by its
    # own sentence among them; at 400 it returned 99% of the exact top 12 in
    # about 10 ms instead of 3 (measured on 290k chunks, 13 Oct 2026).
    ef_search: int = Field(default=400, ge=1, le=1000, alias="efSearch")
    min_score: float | None = Field(default=None, alias="minScore")
    # A hit that is one part of a section split into parts brings up to this
    # many of the section's other parts, nearest first (RQ-0042): a section's
    # heading matched in part 1 and its content sat in part 2. 0 turns it off.
    section_parts: int = Field(default=2, ge=0, le=10, alias="sectionParts")
    # The question is also searched as an English search query, and the terms
    # the model names are looked for in file paths (RQ-0042): "arinc 429 ip
    # davranislari" put the twin's A429Lite.cs ninth among its repository's
    # code, the English question second. rewriteModel picks a smaller model of
    # the same provider for it; empty uses the answer's model.
    rewrite: bool = Field(default=True, alias="rewrite")
    rewrite_model: str | None = Field(default=None, alias="rewriteModel")

    @field_validator("rewrite_model", mode="before")
    @classmethod
    def _blank_rewrite_model_is_none(cls, value: object) -> object:
        return None if isinstance(value, str) and not value.strip() else value


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
    doors: RagDoorsConfig = Field(default_factory=RagDoorsConfig)
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
                source.update(doors_entries_from_env(str(source["envPrefix"]), str(source.get("id", "")), os.environ))
                source.update(dataflow_from_env(str(source["envPrefix"]), os.environ))
                flag = (os.environ.get(f"{source['envPrefix']}_ENABLED") or "").strip().lower()
                if flag:
                    source["enabled"] = flag not in {"0", "off", "false", "no"}
    config = FactoryConfig.model_validate({"rag": expanded_rag})
    # A slot that names neither a folder, a repository nor a DOORS database is
    # an unused template slot, not a source.
    config.rag.sources = [source for source in config.rag.sources if source.has_inputs]
    return config


# REF values that are resolved at every ingest instead of naming a branch or
# tag. `@` because .env is sourced by a shell: `<LAST_RELEASE>` would be read as
# a redirection and leave the value silently empty.
REF_SELECTORS = ("@last-release", "@last-tag")

GIT_ENTRY_PATTERN = re.compile(r"^(REPO|GROUP)_(\d+)_(URL|TOKEN|REF|PROJECT_EXCLUDE|WEBHOOK_SECRET)$")


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
            repositories.append({
                **common, "ref": ref,
                "webhookSecretEnv": f"{entry}_WEBHOOK_SECRET" if "WEBHOOK_SECRET" in fields else None,
            })
        else:
            groups.append({**common, "projectExclude": _json_glob_list(fields.get("PROJECT_EXCLUDE"), f"{entry}_PROJECT_EXCLUDE")})
    return {"repositories": repositories, "groups": groups}


DOORS_ENTRY_PATTERN = re.compile(r"^DOORS_(\d+)_(SERVER|SSH_USER|USER|PASSWORD|PATHS|EXCLUDE)$")
DOORS_DEFAULT_PORT = 36677


def doors_entries_from_env(prefix: str, source_id: str, environ: Mapping[str, str]) -> dict[str, list[dict[str, Any]]]:
    """Collect a slot's numbered DOORS entries (RQ-0037).

    `<prefix>_DOORS_<k>_SERVER` / `_USER` / `_PASSWORD`, and optionally
    `_SSH_USER`, `_PATHS` and `_EXCLUDE` (JSON arrays). `SERVER` is the DOORS
    server's address, with `:port` when it is not 36677; the DOORS client that
    exports runs on the same machine, reached over SSH as `_SSH_USER`. Only
    the password variable's name is kept. A server is listed once per slot:
    its documents are told apart by the server, so two entries would retire
    each other's modules.
    """
    found: dict[int, dict[str, str]] = {}
    for name, value in environ.items():
        if not name.startswith(prefix + "_"):
            continue
        match = DOORS_ENTRY_PATTERN.match(name[len(prefix) + 1:])
        if match and value.strip():
            found.setdefault(int(match.group(1)), {})[match.group(2)] = value.strip()

    label = f"{prefix} ({source_id})" if source_id else prefix
    entries: list[dict[str, Any]] = []
    databases: dict[str, str] = {}
    for number, fields in sorted(found.items()):
        entry = f"{prefix}_DOORS_{number}"
        missing = [f"{entry}_{field}" for field in ("SERVER", "USER", "PASSWORD") if field not in fields]
        if missing:
            raise ValueError(f"{label}: {entry} is incomplete, {' and '.join(missing)} not set")
        host, port = _doors_server(fields["SERVER"], f"{entry}_SERVER")
        database = f"{port}@{host}"
        if database.lower() in databases:
            raise ValueError(
                f"{label}: {entry}_SERVER={fields['SERVER']} is also {databases[database.lower()]}_SERVER; "
                f"list a server once and put all its paths in one _PATHS"
            )
        databases[database.lower()] = entry
        paths = _json_glob_list(fields.get("PATHS"), f"{entry}_PATHS", "DOORS paths") or ["/"]
        outside = [path for path in paths if not path.startswith("/")]
        if outside:
            raise ValueError(f"{entry}_PATHS: a DOORS path starts with /, got {outside[0]!r}")
        entries.append({
            "entry": entry, "database": database,
            "client": f"{fields['SSH_USER']}@{host}" if fields.get("SSH_USER") else host,
            "user": fields["USER"], "passwordEnv": f"{entry}_PASSWORD",
            "paths": paths, "exclude": _json_glob_list(fields.get("EXCLUDE"), f"{entry}_EXCLUDE"),
        })
    return {"doors": entries}


def _doors_server(value: str, name: str) -> tuple[str, int]:
    """(host, port) of `host`, `host:port` or, as DOORS writes it, `port@host`."""
    port, separator, host = value.partition("@")
    if not separator:
        host, separator, port = value.partition(":")
    if not separator:
        port = str(DOORS_DEFAULT_PORT)
    if not host or not port.isdigit() or any(character.isspace() or character in "/@:" for character in host):
        raise ValueError(f"{name}={value} is not a server address: an IP address or a name, with :port when it is not {DOORS_DEFAULT_PORT}")
    return host, int(port)


def dataflow_from_env(prefix: str, environ: Mapping[str, str]) -> dict[str, Any]:
    """`<prefix>_DATAFLOW=on` and its optional patterns.

    `_SOURCES`, `_SINKS`, `_ISR` (or `_C_SOURCES`, ...) are C's; `_JS_SOURCES`,
    `_JS_SINKS`, `_CS_SOURCES`, `_CS_SINKS` and `_CS_CALLBACKS` the other
    families' (RQ-0032).
    """
    flag = (environ.get(f"{prefix}_DATAFLOW") or "").strip().lower()
    values: dict[str, Any] = {"dataflow": flag in {"1", "on", "true", "yes"}}
    for suffix, key in (("SOURCES", "dataflowSources"), ("SINKS", "dataflowSinks"), ("ISR", "dataflowIsr")):
        value = (environ.get(f"{prefix}_DATAFLOW_{suffix}") or environ.get(f"{prefix}_DATAFLOW_C_{suffix}") or "").strip()
        if value:
            values[key] = value
    families: dict[str, dict[str, str]] = {}
    for family, suffixes in (("js", ("SOURCES", "SINKS")), ("cs", ("SOURCES", "SINKS", "CALLBACKS"))):
        for suffix in suffixes:
            value = (environ.get(f"{prefix}_DATAFLOW_{family.upper()}_{suffix}") or "").strip()
            if value:
                families.setdefault(family, {})[suffix.lower()] = value
    if families:
        values["dataflowFamilies"] = families
    return values


def _json_glob_list(value: str | None, name: str, what: str = "glob strings") -> list[str]:
    if not value:
        return []
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError as exc:
        raise ValueError(f"{name} must be a JSON array of {what}") from exc
    if not isinstance(parsed, list) or not all(isinstance(item, str) for item in parsed):
        raise ValueError(f"{name} must be a JSON array of {what}")
    return parsed


def searchable_source_ids(config: RagConfig, requested: list[str] | None = None) -> list[str] | None:
    """The sources a question or a graph query searches: those asked for, less
    the passive ones (RQ-0033). None searches everything, as before, when none
    is asked for and none is passive; an empty list searches nothing."""
    passive = {source.id for source in config.sources if not source.enabled}
    if not requested:
        return [source.id for source in config.sources if source.enabled] if passive else None
    return [source_id for source_id in requested if source_id not in passive]


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
