from __future__ import annotations

import hashlib
import json
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from time import perf_counter, sleep
from typing import Any, Callable, TypeVar

import psycopg

from aifactory_rag.config import RagConfig, RagSourceConfig, find_source, require_ingest_config
from aifactory_rag.db import connect, ensure_vector_index, require_schema, vector_literal
from aifactory_rag.embeddings import EmbeddingAdapter, create_embedding_adapter
from aifactory_rag.ingest.parsers import (
    IMAGE_EXTENSIONS,
    PLAIN_TEXT_EXTENSIONS,
    PLAIN_TEXT_FILENAMES,
)
from aifactory_rag.config import DEFAULT_INCLUDE
from aifactory_rag.ingest.chunker import chunk_text
from aifactory_rag.ingest.code_chunker import SIZE_CHUNKER, CodeChunk, chunk_code, language_for
from aifactory_rag.ingest.code_chunker import expected_chunker as code_chunker_for
from aifactory_rag.ingest.markdown_chunker import MARKDOWN_CHUNKER, chunk_markdown, is_markdown
from aifactory_rag.ingest.code_graph import GRAPH_VERSION, FileGraph, extract_graph
from aifactory_rag.ingest.git_inputs import (
    GitInputError,
    RepositoryInput,
    RepositoryTree,
    changed_paths,
    find_scip_index,
    repository_inputs,
    sync_repository,
)
from aifactory_rag.ingest.scip_index import ScipIndex, read_index
from aifactory_rag import dataflow
from aifactory_rag.ingest.parsers import parse_file
from aifactory_rag.ingest.sources import SourceFile, effective_excludes, normalize_subdir, scan_files, selected


T = TypeVar("T")
# What a file *is*, decided by its own name rather than by where it sits. A
# repository cloned from GitHub arrives with its own shape - src/, docs/,
# examples/, tools/ - and forcing it into two top-level folders would be manual
# work that also mislabels: a README under src/ is documentation, a build script
# under docs/ is code. Anything unrecognised stays unlabelled, and an unlabelled
# chunk survives every content-type filter, so a new file type is never silently
# dropped from a retrieval.
DOCUMENTATION_EXTENSIONS = frozenset({
    ".md", ".rst", ".txt", ".pdf", ".docx", ".doc", ".pptx", ".ppt", ".csv",
    ".xlsx", ".xlsm", ".xls",
    ".html", ".htm", ".epub", ".odt",
}) | IMAGE_EXTENSIONS

# Structured data and configuration are machine material, not prose: a question
# about how something works should not retrieve package.json.
CODE_EXTENSIONS = PLAIN_TEXT_EXTENSIONS | {".json"}


@dataclass
class IngestSummary:
    run_id: int
    source_id: str
    status: str
    subdir: str | None = None
    scanned_count: int = 0
    inserted_count: int = 0
    updated_count: int = 0
    skipped_count: int = 0
    deleted_count: int = 0
    error_count: int = 0
    duration_seconds: float = 0.0
    errors: list[dict[str, str]] = field(default_factory=list)
    # Per input (the folder, each repository): what it held and what happened.
    inputs: list[dict[str, Any]] = field(default_factory=list)
    # Code files the symbol chunker could not read, ingested by size instead.
    chunk_fallback_count: int = 0
    chunk_fallbacks: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class InputContext:
    """Where a document came from: the folder (key "") or one repository."""

    key: str
    label: str
    metadata: dict[str, Any]
    # Repository inputs: relative path -> git blob id, the change detector.
    blobs: dict[str, str] | None = None
    ref_selector: str | None = None


FOLDER_INPUT = InputContext(key="", label="PATH", metadata={"input": "path"})


# A summary that only counts its failures sends the reader to the log to learn
# which files they were. Carry the first few, the count already carries the rest.
MAX_REPORTED_ERRORS = 20


def _short_error(exc: Exception) -> str:
    text = str(exc).strip() or exc.__class__.__name__
    return text if len(text) <= 200 else f"{text[:197]}..."


def _format_duration(seconds: float) -> str:
    if seconds < 60:
        return f"{seconds:.2f}s"
    minutes, remaining = divmod(seconds, 60)
    if minutes < 60:
        return f"{int(minutes)}m {remaining:.1f}s"
    hours, minutes = divmod(minutes, 60)
    return f"{int(hours)}h {int(minutes)}m {remaining:.1f}s"


def _content_type_metadata(relative_path: str) -> dict[str, str]:
    """Classify a file as documentation or code from its extension."""
    name = PurePosixPath(relative_path).name
    extension = PurePosixPath(name).suffix.lower()
    if extension in DOCUMENTATION_EXTENSIONS:
        return {"contentType": "documentation"}
    if extension in CODE_EXTENSIONS or name.lower() in PLAIN_TEXT_FILENAMES:
        return {"contentType": "code"}
    return {}


class PassiveSourceError(ValueError):
    """An ingest of a source that is turned off (RQ-0033)."""


def ingest_source(config: RagConfig, source_id: str, force: bool = False, subdir: str | None = None) -> IngestSummary:
    if not find_source(config, source_id).enabled:
        raise PassiveSourceError(
            f"RAG source {source_id} is passive: its rows are kept but it is not ingested; set its ENABLED=on to ingest it"
        )
    with _source_lock(config, source_id):
        return _ingest_source(config, source_id, force, subdir)


def _lock_key(source_id: str) -> str:
    return f"aifactory-rag-ingest:{source_id}"


def close_interrupted_runs(connection_string: str) -> list[int]:
    """Close the `running` runs of sources nobody is ingesting.

    A service restart kills the webhook ingest in flight and its run stays
    `running` for good, shown as "Updating now" until the next ingest. A live
    ingest holds the source's advisory lock, so a source whose lock is free
    has no ingest: its running runs were interrupted. Called at startup.
    """
    closed: list[int] = []
    with psycopg.connect(connection_string, autocommit=True) as conn:
        sources = [row[0] for row in conn.execute(
            "SELECT DISTINCT source_id FROM rag_ingest_runs WHERE status = 'running' AND source_id IS NOT NULL"
        ).fetchall()]
        for source_id in sources:
            key = _lock_key(source_id)
            if not conn.execute("SELECT pg_try_advisory_lock(hashtextextended(%s, 0))", (key,)).fetchone()[0]:
                continue  # an ingest of this source is running somewhere
            try:
                closed.extend(row[0] for row in conn.execute(
                    "UPDATE rag_ingest_runs SET status = 'failed', finished_at = now(), "
                    "error = 'interrupted: no ingest of this source was running when the service started' "
                    "WHERE source_id = %s AND status = 'running' RETURNING id",
                    (source_id,),
                ).fetchall())
            finally:
                conn.execute("SELECT pg_advisory_unlock(hashtextextended(%s, 0))", (key,))
    return closed


@contextmanager
def _source_lock(config: RagConfig, source_id: str) -> Iterator[None]:
    """One ingest of a source at a time, across processes (RQ-0033).

    The webhook queue orders the service's own ingests, but a CLI ingest (a
    re-embedding of the whole corpus runs for hours) is another process: a
    push arriving meanwhile would ingest the same documents at the same time
    and leave them half replaced. The second one waits for the first.
    """
    key = _lock_key(source_id)
    with psycopg.connect(config.database.connection_string, autocommit=True) as lock:
        taken = lock.execute("SELECT pg_try_advisory_lock(hashtextextended(%s, 0))", (key,)).fetchone()[0]
        if not taken:
            print(f"RAG ingest waits  : another ingest of {source_id} is running", flush=True)
            lock.execute("SELECT pg_advisory_lock(hashtextextended(%s, 0))", (key,))
        try:
            yield
        finally:
            lock.execute("SELECT pg_advisory_unlock(hashtextextended(%s, 0))", (key,))


def _ingest_source(config: RagConfig, source_id: str, force: bool, subdir: str | None) -> IngestSummary:
    run_started = perf_counter()
    # A corpus is only useful once it can be searched quickly, and the index has
    # to match the width this run writes, so it is ensured here rather than left
    # to a migration that cannot know which model is configured.
    try:
        if ensure_vector_index(config.database.connection_string, config.embedding.dimensions):
            print(f"Built the {config.embedding.dimensions}-wide vector index.", flush=True)
    except Exception as exc:  # an index is an optimisation, never a reason to refuse an ingest
        print(f"Could not ensure the vector index ({exc}); retrieval will scan instead.", flush=True)
    require_ingest_config(config)
    require_schema(config.database.connection_string)
    source = find_source(config, source_id)
    if subdir and subdir.strip() not in {"", "."} and not source.root_path:
        raise ValueError(f"RAG source {source.id} has no folder input; a subdirectory narrows the folder only")
    normalized_subdir = normalize_subdir(source, subdir) if source.root_path else None
    print(f"RAG ingest source : {source.id}", flush=True)
    print(f"RAG ingest root   : {source.root_path or '(no folder)'}", flush=True)
    print(f"RAG include       : {', '.join(source.include) if source.include else '(all files)'}", flush=True)
    excludes = effective_excludes(source)
    print(f"RAG exclude       : {', '.join(excludes) if excludes else '(none)'}", flush=True)
    print(f"RAG subdirectory  : {normalized_subdir or '(entire source)'}", flush=True)
    print(f"RAG repositories  : {len(source.repositories)} listed, {len(source.groups)} groups", flush=True)

    conn = connect(config.database.connection_string)
    try:
        _upsert_source(conn, source)
        run_id = _start_run(conn, source.id)
        summary = IngestSummary(run_id=run_id, source_id=source.id, status="running", subdir=normalized_subdir)
        conn.commit()

        embed_model = create_embedding_adapter(config.embedding)

        try:
            if source.root_path:
                files = scan_files(source, normalized_subdir)
                _print_matched(FOLDER_INPUT.label, files)
                conn = _ingest_input(conn, config, source, FOLDER_INPUT, files, embed_model, force, summary, normalized_subdir)
                if source.dataflow and normalized_subdir is None:
                    states = {
                        family: dataflow.folder_state(code)
                        for family, code in _by_family((f.relative_path, f.size, f.modified_timestamp) for f in files).items()
                    }
                    conn = _build_dataflow_graphs(
                        conn, config, source.id, "", f"{source.id}-path", str(source.root_path), states, summary.inputs[-1],
                    )

            # A subdirectory narrows the folder input; repositories are left alone.
            if normalized_subdir is None and (source.repositories or source.groups):
                repositories, input_errors = repository_inputs(source)
                for error in input_errors:
                    conn = _record_input_error(conn, config, summary, source.id, error)
                for repository in repositories:
                    print(f"RAG repository    : {repository.key} ({repository.entry})", flush=True)
                    try:
                        tree = sync_repository(repository, config.git.mirror_dir)
                    except GitInputError as exc:
                        conn = _record_input_error(conn, config, summary, source.id, exc, repository.key)
                        continue
                    resolved = f"{tree.selector} -> {tree.ref}" if tree.selector else tree.ref
                    print(f"RAG repository at : {resolved} ({tree.commit[:12]})", flush=True)
                    context = _repository_context(repository, tree)
                    files = _repository_files(source, tree)
                    _print_matched(repository.key, files)
                    conn = _ingest_input(conn, config, source, context, files, embed_model, force, summary, None)
                    conn, _ = _run_with_database_retries(
                        conn,
                        config,
                        f"recording the commit of {repository.key}",
                        lambda current: _record_input_state_and_commit(current, source.id, repository, tree),
                    )
                    conn = _apply_scip_index(conn, config, source.id, repository, tree, summary.inputs[-1])
                    if source.dataflow:
                        families = _by_family((path, 0, 0.0) for path in tree.blobs)
                        conn = _build_dataflow_graphs(
                            conn, config, source.id, repository.key, repository.key, str(tree.worktree),
                            {family: tree.commit for family in families}, summary.inputs[-1],
                            ref=tree.ref, repository_url=repository.web_url,
                        )

            summary.status = "failed" if summary.error_count else "passed"
            summary.duration_seconds = round(perf_counter() - run_started, 3)
            conn, _ = _run_with_database_retries(
                conn,
                config,
                "finalizing the ingest run",
                lambda current: _finish_run_and_commit(current, summary),
            )
            print(f"RAG ingest finished: {summary.status} in {_format_duration(summary.duration_seconds)}", flush=True)
            return summary
        except Exception as exc:
            _safe_rollback(conn)
            summary.status = "failed"
            summary.duration_seconds = round(perf_counter() - run_started, 3)
            try:
                conn, _ = _run_with_database_retries(
                    conn,
                    config,
                    "recording the failed ingest run",
                    lambda current: _finish_failed_run_and_commit(current, summary, exc),
                )
            except Exception as finish_exc:
                print(f"RAG ingest could not record failed run {summary.run_id}: {finish_exc}", flush=True)
            print(f"RAG ingest failed after {_format_duration(summary.duration_seconds)}: {exc}", flush=True)
            raise
    finally:
        _safe_close(conn)


def _by_family(files: Any) -> dict[str, list[tuple[str, int, float]]]:
    """Code files grouped by the language family their data-flow graph is built in."""
    grouped: dict[str, list[tuple[str, int, float]]] = {}
    for item in files:
        family = dataflow.family_for(item[0])
        if family:
            grouped.setdefault(family, []).append(item)
    return grouped


def _build_dataflow_graphs(
    conn: psycopg.Connection,
    config: RagConfig,
    source_id: str,
    input_key: str,
    graph_key: str,
    input_path: str,
    states: dict[str, str],
    counts: dict[str, Any],
    ref: str | None = None,
    repository_url: str | None = None,
) -> psycopg.Connection:
    """Build (or keep) one Joern graph per language family of a code input.

    A family's failure stays with that family. A family the input no longer
    holds loses its record, so no query runs against a graph of files that
    are gone.
    """
    client = dataflow.JoernClient(dataflow.JoernSettings(url=config.joern.url, workspace=config.joern.workspace))
    notes: list[str] = []
    for family in dataflow.FAMILIES:
        state = states.get(family)
        if state is None:
            continue
        project = dataflow.project_name(graph_key, state, family)
        try:
            built = client.ensure_project(project, input_path, family=family)
        except dataflow.JoernError as exc:
            notes.append(f"{family} failed: {_short_error(exc)}")
            print(f"RAG data-flow     : {graph_key} ({family}): {exc}", flush=True)
            continue
        notes.append(f"{'built' if built else 'up to date'} {project}")
        print(f"RAG data-flow     : {notes[-1]}", flush=True)
        conn, _ = _run_with_database_retries(
            conn,
            config,
            f"recording the {family} data-flow graph of {graph_key}",
            lambda current, family=family, project=project, state=state: _record_dataflow_graph_and_commit(
                current, source_id, input_key, family, project, input_path, ref, state if ref else None, repository_url,
            ),
        )
    conn, _ = _run_with_database_retries(
        conn,
        config,
        f"pruning the data-flow graphs of {graph_key}",
        lambda current: _prune_dataflow_graphs_and_commit(current, source_id, input_key, set(states)),
    )
    if notes:
        counts["dataflow"] = "; ".join(notes)
    return conn


def _prune_dataflow_graphs_and_commit(conn: psycopg.Connection, source_id: str, input_key: str, families: set[str]) -> None:
    with conn.cursor() as cur:
        cur.execute(
            "DELETE FROM rag_dataflow_graphs WHERE source_id = %s AND input_key = %s AND NOT (family = ANY(%s))",
            (source_id, input_key, sorted(families)),
        )
    conn.commit()


def _record_dataflow_graph_and_commit(
    conn: psycopg.Connection,
    source_id: str,
    input_key: str,
    family: str,
    project: str,
    input_path: str,
    ref: str | None,
    commit: str | None,
    repository_url: str | None,
) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO rag_dataflow_graphs(source_id, input_key, family, project, input_path, ref, commit_sha, repository_url, built_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, now())
            ON CONFLICT(source_id, input_key, family) DO UPDATE SET
              project = EXCLUDED.project, input_path = EXCLUDED.input_path, ref = EXCLUDED.ref,
              commit_sha = EXCLUDED.commit_sha, repository_url = EXCLUDED.repository_url,
              -- an up-to-date graph keeps the time it was built
              built_at = CASE WHEN rag_dataflow_graphs.project = EXCLUDED.project
                              THEN rag_dataflow_graphs.built_at ELSE now() END
            """,
            (source_id, input_key, family, project, input_path, ref, commit, repository_url),
        )
    conn.commit()


def _apply_scip_index(
    conn: psycopg.Connection,
    config: RagConfig,
    source_id: str,
    repository: RepositoryInput,
    tree: RepositoryTree,
    counts: dict[str, Any],
) -> psycopg.Connection:
    """Make the input's edges precise where its commit's SCIP index covers them."""
    found = find_scip_index(repository, tree)
    origin = found.origin
    index: ScipIndex | None = None
    if found.data is not None:
        try:
            index = read_index(found.data)
        except Exception as exc:  # noqa: BLE001 - an unreadable index costs precision, not the ingest
            origin = f"unreadable SCIP index from {origin}: {_short_error(exc)}"
    if index is not None and found.commit and found.commit != tree.commit:
        # An ancestor's index: trusted only for the files unchanged since.
        changed = changed_paths(tree.worktree, found.commit, tree.commit)
        if changed is None:
            index, origin = None, f"{origin} unusable: git cannot compare it with {tree.commit[:12]}"
        else:
            index = index.without(changed)
            origin = f"{origin}, {len(changed)} files changed since"
    conn, precise = _run_with_database_retries(
        conn,
        config,
        f"applying the SCIP index of {repository.key}",
        lambda current: _overlay_scip_and_commit(current, source_id, repository.key, tree, index),
    )
    counts["scip"] = origin
    counts["preciseEdges"] = precise
    print(f"RAG SCIP index    : {origin}; {precise} precise edges", flush=True)
    return conn


def _overlay_scip_and_commit(
    conn: psycopg.Connection,
    source_id: str,
    input_key: str,
    tree: RepositoryTree,
    index: ScipIndex | None,
) -> int:
    precise = _overlay_scip(conn, source_id, input_key, tree, index)
    conn.commit()
    return precise


def _overlay_scip(
    conn: psycopg.Connection,
    source_id: str,
    input_key: str,
    tree: RepositoryTree,
    index: ScipIndex | None,
) -> int:
    """Recompute the precise targets of one input's edges from scratch.

    Every edge of the input first returns to `name`, so a file that left the
    index, or whose definitions moved, keeps no stale target. Then each
    `calls`/`reads`/`writes` edge of a covered file is matched to the SCIP use
    on the same line with the same text; when that use's symbol has a
    definition in the index, the edge records it.
    """
    with conn.cursor() as cur:
        cur.execute(
            "SELECT id, relative_path FROM rag_documents WHERE source_id = %s AND input_key = %s AND status = 'active'",
            (source_id, input_key),
        )
        documents = list(cur.fetchall())
        ids = [row["id"] for row in documents]
        if ids:
            cur.execute(
                "UPDATE rag_edges SET resolution = 'name', to_path = NULL, to_line = NULL WHERE document_id = ANY(%s) AND resolution <> 'name'",
                (ids,),
            )
        updates: list[tuple[str, int, int]] = []
        if index is not None:
            for document in documents:
                occurrences = index.documents.get(document["relative_path"])
                if not occurrences:
                    continue
                uses = _uses_by_line(tree.worktree, document["relative_path"], occurrences, index)
                if not uses:
                    continue
                cur.execute(
                    "SELECT id, line, to_name FROM rag_edges WHERE document_id = %s AND kind IN ('calls', 'reads', 'writes')",
                    (document["id"],),
                )
                for edge in cur.fetchall():
                    target = uses.get((edge["line"], edge["to_name"]))
                    if target is not None:
                        updates.append((target[0], target[1], edge["id"]))
            if updates:
                cur.executemany(
                    "UPDATE rag_edges SET to_path = %s, to_line = %s, resolution = 'precise' WHERE id = %s",
                    updates,
                )
    return len(updates)


def _uses_by_line(
    worktree: Path, relative_path: str, occurrences: list[Any], index: ScipIndex
) -> dict[tuple[int, str], tuple[str, int]]:
    """(line, name as written) -> definition, for the uses whose symbol is defined in the index."""
    try:
        lines = (worktree / relative_path).read_bytes().split(b"\n")
    except OSError:
        return {}
    uses: dict[tuple[int, str], tuple[str, int]] = {}
    for occurrence in occurrences:
        if occurrence.is_definition or occurrence.line > len(lines):
            continue
        definition = index.definition_for(occurrence.symbol, relative_path)
        if definition is None:
            continue
        name = lines[occurrence.line - 1][occurrence.start:occurrence.end].decode("utf-8", errors="replace")
        uses.setdefault((occurrence.line, name), definition)
    return uses


def _print_matched(label: str, files: list[SourceFile]) -> None:
    print(f"RAG matched files : {len(files)} in {label}", flush=True)
    for file in files[:10]:
        print(f"  - {file.relative_path}", flush=True)
    if len(files) > 10:
        print(f"  ... {len(files) - 10} more", flush=True)


def _ingest_input(
    conn: psycopg.Connection,
    config: RagConfig,
    source: RagSourceConfig,
    context: InputContext,
    files: list[SourceFile],
    embed_model: EmbeddingAdapter,
    force: bool,
    summary: IngestSummary,
    subdir: str | None,
) -> psycopg.Connection:
    files = ordered_files(files, config.ingest.order)
    counts: dict[str, Any] = {
        "input": context.label,
        "scanned": len(files),
        "inserted": 0,
        "updated": 0,
        "skipped": 0,
        "deleted": 0,
        "errors": 0,
    }
    if context.metadata.get("commit"):
        if context.ref_selector:
            counts["refSelector"] = context.ref_selector
        counts["ref"] = context.metadata.get("ref")
        counts["commit"] = context.metadata["commit"]
    summary.scanned_count += len(files)
    seen: set[str] = set()
    for index, file in enumerate(files, start=1):
        file_started = perf_counter()
        progress = f"[{index}/{len(files)}]"
        print(f"{progress} START {file.relative_path}", flush=True)
        seen.add(file.relative_path)
        try:
            conn, (outcome, fallback) = _run_with_database_retries(
                conn,
                config,
                f"ingesting {file.relative_path}",
                lambda current: _ingest_file_and_commit(
                    current, config, source, file, embed_model, force, context,
                ),
            )
            counts[outcome] += 1
            setattr(summary, f"{outcome}_count", getattr(summary, f"{outcome}_count") + 1)
            if fallback:
                summary.chunk_fallback_count += 1
                if len(summary.chunk_fallbacks) < MAX_REPORTED_ERRORS:
                    summary.chunk_fallbacks.append(_display_path(context, file.relative_path))
                print(f"{progress} NOTE  symbol chunking failed, chunked by size: {file.relative_path}", flush=True)
            print(f"{progress} DONE  {outcome:<8} {file.relative_path} ({_format_duration(perf_counter() - file_started)})", flush=True)
        except Exception as exc:
            _safe_rollback(conn)
            counts["errors"] += 1
            summary.error_count += 1
            if len(summary.errors) < MAX_REPORTED_ERRORS:
                summary.errors.append(
                    {"relativePath": _display_path(context, file.relative_path), "error": _short_error(exc)}
                )
            conn, _ = _run_with_database_retries(
                conn,
                config,
                f"recording the error for {file.relative_path}",
                lambda current: _record_file_error_and_commit(
                    current, summary.run_id, source.id, context.key, file.relative_path, "ingest", exc,
                ),
            )
            print(f"{progress} ERROR {file.relative_path} ({_format_duration(perf_counter() - file_started)}): {exc}", flush=True)

    conn, deleted = _run_with_database_retries(
        conn,
        config,
        f"removing files no longer in {context.label}",
        lambda current: _mark_deleted_and_commit(current, source.id, context.key, seen, subdir),
    )
    counts["deleted"] = deleted
    summary.deleted_count += deleted
    summary.inputs.append(counts)
    return conn


def _display_path(context: InputContext, relative_path: str) -> str:
    return f"{context.key}:{relative_path}" if context.key else relative_path


def _record_input_error(
    conn: psycopg.Connection,
    config: RagConfig,
    summary: IngestSummary,
    source_id: str,
    exc: Exception,
    label: str | None = None,
) -> psycopg.Connection:
    """A repository or group that could not be read fails alone."""
    summary.error_count += 1
    summary.inputs.append({"input": label or str(exc).split(":", 1)[0], "errors": 1, "error": _short_error(exc)})
    if len(summary.errors) < MAX_REPORTED_ERRORS:
        summary.errors.append({"relativePath": label or "(input)", "error": _short_error(exc)})
    print(f"RAG input ERROR   : {exc}", flush=True)
    conn, _ = _run_with_database_retries(
        conn,
        config,
        "recording an input error",
        lambda current: _record_file_error_and_commit(current, summary.run_id, source_id, None, label or "(input)", "input", exc),
    )
    return conn


def _repository_context(repository: RepositoryInput, tree: RepositoryTree) -> InputContext:
    return InputContext(
        key=repository.key,
        label=repository.key,
        metadata={
            "input": repository.key,
            "repository": repository.project_path,
            "repositoryUrl": repository.web_url,
            "ref": tree.ref,
            "commit": tree.commit,
        },
        blobs=tree.blobs,
        ref_selector=tree.selector,
    )


def _repository_files(source: RagSourceConfig, tree: RepositoryTree) -> list[SourceFile]:
    """A repository takes the code and document types; the slot's excludes apply."""
    excludes = effective_excludes(source)
    files: list[SourceFile] = []
    for relative_path in sorted(tree.blobs):
        if not selected(relative_path, DEFAULT_INCLUDE, excludes):
            continue
        path = tree.worktree / relative_path
        stat = path.stat()
        files.append(SourceFile(path=path, relative_path=relative_path, size=stat.st_size, modified_timestamp=stat.st_mtime))
    return files


def _run_with_database_retries(
    conn: psycopg.Connection,
    config: RagConfig,
    action: str,
    operation: Callable[[psycopg.Connection], T],
) -> tuple[psycopg.Connection, T]:
    retries = config.ingest.database_reconnect_retries
    delay = config.ingest.database_reconnect_delay_seconds
    current = conn
    attempt = 0

    while True:
        try:
            if current.closed:
                current = connect(config.database.connection_string)
            return current, operation(current)
        except (psycopg.InterfaceError, psycopg.OperationalError) as exc:
            _safe_close(current)
            if attempt >= retries:
                raise
            attempt += 1
            print(
                f"  DB reconnect [{attempt}/{retries}] while {action}; retrying in {delay:.1f}s: {exc}",
                flush=True,
            )
            sleep(delay)
            try:
                current = connect(config.database.connection_string)
            except psycopg.OperationalError:
                # The next loop iteration applies the same bounded retry policy.
                continue


def _safe_rollback(conn: psycopg.Connection) -> None:
    try:
        if not conn.closed:
            conn.rollback()
    except psycopg.Error:
        pass


def _safe_close(conn: psycopg.Connection) -> None:
    try:
        conn.close()
    except psycopg.Error:
        pass


def _ingest_file_and_commit(
    conn: psycopg.Connection,
    config: RagConfig,
    source: RagSourceConfig,
    file: SourceFile,
    embed_model: EmbeddingAdapter,
    force: bool,
    context: InputContext = FOLDER_INPUT,
) -> tuple[str, bool]:
    result = _ingest_file(conn, config, source, file, embed_model, force, context)
    conn.commit()
    return result


def _record_file_error_and_commit(
    conn: psycopg.Connection,
    run_id: int,
    source_id: str,
    input_key: str | None,
    path: str,
    stage: str,
    exc: Exception,
) -> None:
    _record_file_error(conn, run_id, source_id, input_key, path, stage, exc)
    conn.commit()


def _mark_deleted_and_commit(
    conn: psycopg.Connection,
    source_id: str,
    input_key: str,
    seen: set[str],
    subdir: str | None,
) -> int:
    deleted_count = _mark_deleted(conn, source_id, input_key, seen, subdir)
    conn.commit()
    return deleted_count


def _finish_run_and_commit(conn: psycopg.Connection, summary: IngestSummary) -> None:
    _finish_run(conn, summary)
    conn.commit()


def _record_input_state_and_commit(
    conn: psycopg.Connection,
    source_id: str,
    repository: RepositoryInput,
    tree: RepositoryTree,
) -> None:
    """The commit each repository was last ingested at, for status and for the
    graph and data-flow layers that work per commit."""
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO rag_source_inputs(source_id, input_key, entry, url, ref, commit_sha, file_count, committed_at, ingested_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, now())
            ON CONFLICT(source_id, input_key) DO UPDATE SET
              entry = EXCLUDED.entry,
              url = EXCLUDED.url,
              ref = EXCLUDED.ref,
              commit_sha = EXCLUDED.commit_sha,
              file_count = EXCLUDED.file_count,
              committed_at = EXCLUDED.committed_at,
              ingested_at = now()
            """,
            (source_id, repository.key, repository.entry, repository.web_url, tree.ref, tree.commit, len(tree.blobs), tree.committed_at),
        )
    conn.commit()


def _finish_failed_run_and_commit(
    conn: psycopg.Connection,
    summary: IngestSummary,
    exc: Exception,
) -> None:
    _finish_run(conn, summary, error=str(exc))
    conn.commit()


def _ingest_file(
    conn: psycopg.Connection,
    config: RagConfig,
    source: RagSourceConfig,
    file: SourceFile,
    embed_model: EmbeddingAdapter,
    force: bool,
    context: InputContext = FOLDER_INPUT,
) -> tuple[str, bool]:
    existing = _find_document(conn, source.id, context.key, file.relative_path)
    modified_at = datetime.fromtimestamp(file.modified_timestamp, tz=timezone.utc)
    blob = context.blobs.get(file.relative_path) if context.blobs is not None else None

    if existing and not force and existing["status"] == "active" and _ingest_config_matches(existing, config, file.relative_path):
        if blob is not None:
            # A repository file is unchanged exactly when its blob id is.
            unchanged = existing["content_hash"] == f"git:{blob}"
        else:
            unchanged = (
                existing["file_size"] == file.size
                and existing["modified_at"].replace(tzinfo=timezone.utc) == modified_at
            )
        if unchanged:
            _backfill_metadata(conn, existing, file.relative_path, context)
            _ensure_graph(conn, existing, source.id, file)
            return "skipped", False

    content_hash = f"git:{blob}" if blob is not None else _sha256(file.path)
    if existing and not force and existing["content_hash"] == content_hash and existing["status"] == "active" and _ingest_config_matches(existing, config, file.relative_path):
        _touch_document(conn, int(existing["id"]), file.size, modified_at)
        _backfill_metadata(conn, existing, file.relative_path, context)
        _ensure_graph(conn, existing, source.id, file)
        return "skipped", False

    text = parse_file(file.path)
    chunks, fallback = _chunks_for(text, file.relative_path, config)
    resume = _can_resume(existing, content_hash, config, file.relative_path)
    document_id = _upsert_document(conn, source, file, modified_at, content_hash, existing, config, len(chunks), context, fallback)
    if not resume:
        _reset_chunk_checkpoints(conn, document_id)
    conn.commit()
    _replace_chunks(
        conn, document_id, source.id, file.relative_path, chunks, embed_model, config.ingest.batch_size, resume, context,
        config.ingest.duty_cycle,
    )
    if language_for(file.relative_path):
        _replace_graph(conn, document_id, source.id, extract_graph(text, file.relative_path))
    _activate_document(conn, document_id)
    return ("updated" if existing else "inserted"), fallback


def _chunks_for(text: str, relative_path: str, config: RagConfig) -> tuple[list[CodeChunk], bool]:
    """Section chunks for Markdown, symbol chunks for C, C++, TS and JS from any
    input; size chunks otherwise.

    The boolean says that a code file the symbol chunker could not read was
    chunked by size instead.
    """
    size, overlap = config.ingest.chunk_size, config.ingest.chunk_overlap
    if is_markdown(relative_path):
        return chunk_markdown(text, relative_path, size), False
    if language_for(relative_path):
        symbols = chunk_code(text, relative_path, size, overlap)
        if symbols is not None:
            return symbols, False
        return [CodeChunk(chunk) for chunk in chunk_text(text, size, overlap)], True
    return [CodeChunk(chunk) for chunk in chunk_text(text, size, overlap)], False


def _ensure_graph(conn: psycopg.Connection, existing: dict[str, Any], source_id: str, file: SourceFile) -> None:
    """Give an unchanged code document its symbol graph without re-embedding it.

    Code ingested before the graph existed, or under an older graph version,
    is parsed again for its symbols and edges only.
    """
    if not language_for(file.relative_path):
        return
    if (existing.get("metadata") or {}).get("graph") == GRAPH_VERSION:
        return
    _replace_graph(conn, int(existing["id"]), source_id, extract_graph(parse_file(file.path), file.relative_path))


def _replace_graph(conn: psycopg.Connection, document_id: int, source_id: str, graph: FileGraph | None) -> None:
    """Replace one document's symbols and edges; a file that cannot be read has none."""
    with conn.cursor() as cur:
        cur.execute("DELETE FROM rag_edges WHERE document_id = %s", (document_id,))
        cur.execute("DELETE FROM rag_symbols WHERE document_id = %s", (document_id,))
        if graph is not None:
            if graph.symbols:
                cur.executemany(
                    """
                    INSERT INTO rag_symbols(source_id, document_id, name, short_name, kind, signature, start_line, end_line)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    [(source_id, document_id, s.name, s.short_name, s.kind, s.signature, s.start_line, s.end_line) for s in graph.symbols],
                )
            if graph.edges:
                cur.executemany(
                    """
                    INSERT INTO rag_edges(source_id, document_id, from_symbol, kind, to_name, line)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    """,
                    [(source_id, document_id, e.from_symbol, e.kind, e.to_name, e.line) for e in graph.edges],
                )
        patch = {"graph": GRAPH_VERSION, **({} if graph is not None else {"graphFallback": True})}
        cur.execute(
            "UPDATE rag_documents SET metadata = metadata || %s::jsonb WHERE id = %s",
            (json.dumps(patch), document_id),
        )


def expected_chunker(relative_path: str) -> str:
    """The chunker a file gets now: by section for Markdown (RQ-0030), by symbol
    for C, C++, TS and JS (RQ-0023), by size for everything else."""
    return MARKDOWN_CHUNKER if is_markdown(relative_path) else code_chunker_for(relative_path)


def _input_metadata(relative_path: str, context: InputContext) -> dict[str, Any]:
    return {**_content_type_metadata(relative_path), **context.metadata}


def _backfill_metadata(
    conn: psycopg.Connection,
    existing: dict[str, Any],
    relative_path: str,
    context: InputContext,
) -> None:
    """Bring an unchanged document's labels up to date, without re-embedding.

    Documents ingested before `contentType` existed carry none, so a filter on
    `documentation` would drop them; every document now also names its input.
    A repository file unchanged between two commits keeps its chunks but is
    relabelled with the commit and ref just ingested, so a citation names the
    release the corpus follows rather than the one the file was first seen in.
    """
    wanted = {"contentType": _content_type_metadata(relative_path).get("contentType"), **context.metadata}
    wanted = {key: value for key, value in wanted.items() if value is not None}
    current = existing.get("metadata") or {}
    if all(current.get(key) == value for key, value in wanted.items()):
        return
    patch = json.dumps(wanted)
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE rag_documents SET metadata = metadata || %s::jsonb, updated_at = now() WHERE id = %s",
            (patch, existing["id"]),
        )
        cur.execute(
            "UPDATE rag_chunks SET metadata = metadata || %s::jsonb WHERE document_id = %s AND status = 'active'",
            (patch, existing["id"]),
        )


def ordered_files(files: list[SourceFile], order: str) -> list[SourceFile]:
    """The files in ingest order: as scanned (by path), or smallest first."""
    if order == "size":
        return sorted(files, key=lambda file: (file.size, file.relative_path))
    return files


def duty_cycle_pause(elapsed: float, duty_cycle: float) -> float:
    """Seconds to rest after a batch that took `elapsed`, to embed only `duty_cycle` of the time."""
    return elapsed * (1 / duty_cycle - 1) if 0 < duty_cycle < 1 else 0.0


def _replace_chunks(
    conn: psycopg.Connection,
    document_id: int,
    source_id: str,
    relative_path: str,
    chunks: list[CodeChunk],
    embed_model: EmbeddingAdapter,
    batch_size: int,
    resume: bool,
    context: InputContext = FOLDER_INPUT,
    duty_cycle: float = 1.0,
) -> None:
    completed: set[int] = set()
    if resume:
        with conn.cursor() as cur:
            cur.execute("SELECT chunk_index, text FROM rag_chunks WHERE document_id = %s AND status = 'checkpoint'", (document_id,))
            completed = {int(row["chunk_index"]) for row in cur.fetchall() if int(row["chunk_index"]) < len(chunks) and row["text"] == chunks[int(row["chunk_index"])].text}
        if completed:
            print(f"  EMBED resume     {relative_path}: {len(completed)}/{len(chunks)} chunks already checkpointed", flush=True)

    pending = [index for index in range(len(chunks)) if index not in completed]
    total_batches = (len(pending) + batch_size - 1) // batch_size if pending else 0
    for batch_number, start in enumerate(range(0, len(pending), batch_size), start=1):
        indices = pending[start:start + batch_size]
        batch_chunks = [chunks[index].text for index in indices]
        print(f"  EMBED [{batch_number}/{total_batches}] {relative_path}: chunks {indices[0] + 1}-{indices[-1] + 1}/{len(chunks)}", flush=True)
        batch_started = perf_counter()
        embeddings = embed_model.embed_documents(batch_chunks)
        if len(embeddings) != len(batch_chunks):
            raise RuntimeError(f"Embedding provider returned {len(embeddings)} vectors for {len(batch_chunks)} chunks")
        with conn.cursor() as cur:
            for index, chunk, embedding in zip(indices, batch_chunks, embeddings):
                if len(embedding) == 0:
                    raise RuntimeError(f"Embedding provider returned an empty vector for chunk {index}")
                metadata = {
                    "relativePath": relative_path,
                    **_input_metadata(relative_path, context),
                    **chunks[index].metadata,
                }
                cur.execute(
                    """
                    INSERT INTO rag_chunks(document_id, source_id, chunk_index, text, embedding, metadata, status)
                    VALUES (%s, %s, %s, %s, %s::vector, %s::jsonb, 'checkpoint')
                    ON CONFLICT(document_id, chunk_index)
                    DO UPDATE SET text = EXCLUDED.text,
                                  embedding = EXCLUDED.embedding,
                                  metadata = EXCLUDED.metadata,
                                  status = 'checkpoint',
                                  created_at = now()
                    """,
                    (document_id, source_id, index, chunk, vector_literal(embedding), json.dumps(metadata)),
                )
        conn.commit()
        print(f"  EMBED [{batch_number}/{total_batches}] checkpointed in DB", flush=True)
        pause = duty_cycle_pause(perf_counter() - batch_started, duty_cycle)
        if pause:
            sleep(pause)


def _can_resume(existing: dict[str, Any] | None, content_hash: str, config: RagConfig, relative_path: str) -> bool:
    if not existing or existing.get("status") != "processing" or existing.get("content_hash") != content_hash:
        return False
    return _ingest_config_matches(existing, config, relative_path)


def _ingest_config_matches(existing: dict[str, Any], config: RagConfig, relative_path: str) -> bool:
    """Whether a document's chunks were made the way this run would make them.

    The chunker is part of that: a code file chunked by size before symbol
    chunking existed is chunked again even though the file did not change.
    Only the file types whose chunker changed are affected; a document from
    before the field existed was chunked by size.
    """
    metadata = existing.get("metadata") or {}
    return (
        (metadata.get("chunker") or SIZE_CHUNKER) == expected_chunker(relative_path)
        and metadata.get("chunkSize") == config.ingest.chunk_size
        and metadata.get("chunkOverlap") == config.ingest.chunk_overlap
        and metadata.get("embeddingProvider") == config.embedding.provider
        and metadata.get("embeddingModel") == config.embedding.model
        and metadata.get("embeddingDimensions") == config.embedding.dimensions
    )


def _reset_chunk_checkpoints(conn: psycopg.Connection, document_id: int) -> None:
    with conn.cursor() as cur:
        cur.execute("UPDATE rag_chunks SET status = 'replaced' WHERE document_id = %s AND status <> 'replaced'", (document_id,))


def _activate_document(conn: psycopg.Connection, document_id: int) -> None:
    with conn.cursor() as cur:
        cur.execute("UPDATE rag_chunks SET status = 'active' WHERE document_id = %s AND status = 'checkpoint'", (document_id,))
        cur.execute(
            """
            UPDATE rag_documents
            SET status = 'active', last_ingested_at = now(), last_error = NULL, updated_at = now()
            WHERE id = %s
            """,
            (document_id,),
        )


def _upsert_source(conn: psycopg.Connection, source: RagSourceConfig) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO rag_sources(id, type, root_path, include_globs, exclude_globs, updated_at)
            VALUES (%s, %s, %s, %s::jsonb, %s::jsonb, now())
            ON CONFLICT(id) DO UPDATE SET
              type = EXCLUDED.type,
              root_path = EXCLUDED.root_path,
              include_globs = EXCLUDED.include_globs,
              exclude_globs = EXCLUDED.exclude_globs,
              updated_at = now()
            """,
            (source.id, source.type, source.root_path or "", json.dumps(source.include), json.dumps(effective_excludes(source))),
        )


def _find_document(conn: psycopg.Connection, source_id: str, input_key: str, relative_path: str) -> dict[str, Any] | None:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT * FROM rag_documents WHERE source_id = %s AND input_key = %s AND relative_path = %s",
            (source_id, input_key, relative_path),
        )
        return cur.fetchone()


def _upsert_document(
    conn: psycopg.Connection,
    source: RagSourceConfig,
    file: SourceFile,
    modified_at: datetime,
    content_hash: str,
    existing: dict[str, Any] | None,
    config: RagConfig,
    chunk_count: int,
    context: InputContext = FOLDER_INPUT,
    chunk_fallback: bool = False,
) -> int:
    metadata = {
        "chunker": expected_chunker(file.relative_path),
        **({"chunkFallback": True} if chunk_fallback else {}),
        **context.metadata,
        "extension": file.path.suffix.lower(),
        "chunkSize": config.ingest.chunk_size,
        "chunkOverlap": config.ingest.chunk_overlap,
        "expectedChunks": chunk_count,
        "embeddingProvider": config.embedding.provider,
        "embeddingModel": config.embedding.model,
        "embeddingDimensions": config.embedding.dimensions,
        **_content_type_metadata(file.relative_path),
    }
    with conn.cursor() as cur:
        if existing:
            cur.execute(
                """
                UPDATE rag_documents
                SET path = %s,
                    file_size = %s,
                    modified_at = %s,
                    content_hash = %s,
                    status = 'processing',
                    last_error = NULL,
                    metadata = %s::jsonb,
                    updated_at = now()
                WHERE id = %s
                RETURNING id
                """,
                (str(file.path), file.size, modified_at, content_hash, json.dumps(metadata), existing["id"]),
            )
        else:
            cur.execute(
                """
                INSERT INTO rag_documents(
                  source_id, input_key, path, relative_path, file_size, modified_at, content_hash,
                  status, last_ingested_at, metadata
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, 'processing', NULL, %s::jsonb)
                RETURNING id
                """,
                (source.id, context.key, str(file.path), file.relative_path, file.size, modified_at, content_hash, json.dumps(metadata)),
            )
        row = cur.fetchone()
        return int(row["id"])


def _touch_document(conn: psycopg.Connection, document_id: int, size: int, modified_at: datetime) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE rag_documents
            SET file_size = %s, modified_at = %s, updated_at = now()
            WHERE id = %s
            """,
            (size, modified_at, document_id),
        )


def _mark_deleted(conn: psycopg.Connection, source_id: str, input_key: str, seen: set[str], subdir: str | None = None) -> int:
    """Retire the documents of one input that its latest listing no longer has."""
    with conn.cursor() as cur:
        scope_sql = " AND left(relative_path, length(%s)) = %s" if subdir else ""
        scope_prefix = f"{subdir}/" if subdir else ""
        scope_params: tuple[str, ...] = (scope_prefix, scope_prefix) if subdir else ()
        if seen:
            cur.execute(
                f"""
                UPDATE rag_documents
                SET status = 'deleted', updated_at = now()
                WHERE source_id = %s AND input_key = %s AND status <> 'deleted'{scope_sql} AND NOT (relative_path = ANY(%s))
                RETURNING id
                """,
                (source_id, input_key, *scope_params, list(seen)),
            )
        else:
            cur.execute(
                f"""
                UPDATE rag_documents
                SET status = 'deleted', updated_at = now()
                WHERE source_id = %s AND input_key = %s AND status <> 'deleted'{scope_sql}
                RETURNING id
                """,
                (source_id, input_key, *scope_params),
            )
        rows = cur.fetchall()
        document_ids = [row["id"] for row in rows]
        if document_ids:
            cur.execute(
                "UPDATE rag_chunks SET status = 'deleted' WHERE document_id = ANY(%s)",
                (document_ids,),
            )
            # A deleted file's symbols stop being definitions and its calls stop being callers.
            cur.execute("DELETE FROM rag_edges WHERE document_id = ANY(%s)", (document_ids,))
            cur.execute("DELETE FROM rag_symbols WHERE document_id = ANY(%s)", (document_ids,))
        return len(document_ids)


def _start_run(conn: psycopg.Connection, source_id: str) -> int:
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO rag_ingest_runs(source_id, status) VALUES (%s, 'running') RETURNING id",
            (source_id,),
        )
        row = cur.fetchone()
        return int(row["id"])


def _finish_run(conn: psycopg.Connection, summary: IngestSummary, error: str | None = None) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE rag_ingest_runs
            SET status = %s,
                finished_at = now(),
                scanned_count = %s,
                inserted_count = %s,
                updated_count = %s,
                skipped_count = %s,
                deleted_count = %s,
                error_count = %s,
                error = %s
            WHERE id = %s
            """,
            (
                summary.status,
                summary.scanned_count,
                summary.inserted_count,
                summary.updated_count,
                summary.skipped_count,
                summary.deleted_count,
                summary.error_count,
                error,
                summary.run_id,
            ),
        )


def _record_file_error(
    conn: psycopg.Connection,
    run_id: int,
    source_id: str,
    input_key: str | None,
    path: str,
    stage: str,
    exc: Exception,
) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO rag_ingest_errors(run_id, source_id, path, stage, error)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (run_id, source_id, f"{input_key}:{path}" if input_key else path, stage, str(exc)),
        )
        if input_key is None:
            return  # an input-level error: no document to mark
        cur.execute(
            """
            UPDATE rag_documents
            SET last_error = %s, updated_at = now()
            WHERE source_id = %s AND input_key = %s AND relative_path = %s
            """,
            (str(exc), source_id, input_key, path),
        )


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()
