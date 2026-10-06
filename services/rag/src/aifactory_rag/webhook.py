"""A GitLab push webhook that keeps repository sources current (RQ-0028).

GitLab posts push and tag-push events; the RAG finds the repository entries
the event's project and ref concern, checks the entry's secret token, and
queues an ingest of their sources. The ingest runs in the background: GitLab
waits only a few seconds for a webhook, and one ingest per source runs at a
time, with pushes that arrive meanwhile folded into one follow-up run.
"""

from __future__ import annotations

import hmac
import os
import threading
import traceback
from dataclasses import dataclass
from typing import Any, Callable
from urllib.parse import urlsplit

from aifactory_rag.config import REF_SELECTORS, GitRepositoryConfig, RagConfig, RagSourceConfig


@dataclass(frozen=True)
class Match:
    source: RagSourceConfig
    repository: GitRepositoryConfig


def project_key(event: dict[str, Any]) -> str | None:
    """`host/group/project` of the event's project, as repository inputs are keyed."""
    project = event.get("project") or {}
    url = project.get("web_url") or (event.get("repository") or {}).get("homepage") or ""
    path = project.get("path_with_namespace") or ""
    host = urlsplit(url).netloc
    return f"{host}/{path}" if host and path else None


def entries_for(config: RagConfig, event: dict[str, Any]) -> list[Match]:
    """The repository entries whose URL names the event's project."""
    key = project_key(event)
    if key is None:
        return []
    found: list[Match] = []
    for source in config.sources:
        for repository in source.repositories:
            parts = urlsplit(repository.url.strip())
            path = parts.path.strip("/").removesuffix(".git")
            if f"{parts.netloc}/{path}" == key:
                found.append(Match(source, repository))
    return found


def follows(repository: GitRepositoryConfig, event: dict[str, Any]) -> bool:
    """Whether the pushed ref is the one the entry ingests.

    A successful pipeline on that ref counts too: the push's ingest runs before
    the pipeline has produced the commit's SCIP index (and, for a tag, before
    the release package is uploaded), so its end starts a second ingest that
    finds them; the files themselves are unchanged by then and skipped.
    """
    if event.get("object_kind") == "pipeline":
        attributes = event.get("object_attributes") or {}
        # A finished pipeline, passed or not: an unrelated failing job must not
        # keep a successful scip_index job's artifact from the corpus.
        if attributes.get("status") not in {"success", "failed"}:
            return False
        if attributes.get("tag"):
            return repository.ref in REF_SELECTORS
        wanted = repository.ref or (event.get("project") or {}).get("default_branch")
        return repository.ref not in REF_SELECTORS and attributes.get("ref") == wanted
    ref = str(event.get("ref") or "")
    if event.get("object_kind") == "tag_push" or ref.startswith("refs/tags/"):
        return repository.ref in REF_SELECTORS
    if not ref.startswith("refs/heads/") or repository.ref in REF_SELECTORS:
        return False
    branch = ref[len("refs/heads/"):]
    wanted = repository.ref or (event.get("project") or {}).get("default_branch")
    return branch == wanted


def authentic(repository: GitRepositoryConfig, token: str | None, environ: dict[str, str] | None = None) -> bool:
    env = os.environ if environ is None else environ
    secret = (env.get(repository.webhook_secret_env or "") or "").strip()
    if not secret or not token:
        return False
    return hmac.compare_digest(secret.encode(), token.encode())


class IngestQueue:
    """One background ingest per source; pushes during a run fold into one more run."""

    def __init__(self, ingest: Callable[[str], Any]) -> None:
        self._ingest = ingest
        self._lock = threading.Lock()
        self._running: set[str] = set()
        self._pending: set[str] = set()

    def trigger(self, source_id: str) -> str:
        with self._lock:
            if source_id in self._running:
                self._pending.add(source_id)
                return "pending"
            self._running.add(source_id)
        threading.Thread(target=self._run, args=(source_id,), name=f"webhook-ingest-{source_id}", daemon=True).start()
        return "started"

    def _run(self, source_id: str) -> None:
        while True:
            try:
                print(f"Webhook ingest of {source_id} started", flush=True)
                self._ingest(source_id)
            except Exception:  # noqa: BLE001 - one failed run must not stop the next
                print(f"Webhook ingest of {source_id} failed:\n{traceback.format_exc()}", flush=True)
            with self._lock:
                if source_id in self._pending:
                    self._pending.discard(source_id)
                    continue
                self._running.discard(source_id)
                return

    def busy(self, source_id: str) -> bool:
        with self._lock:
            return source_id in self._running
