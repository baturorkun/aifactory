from __future__ import annotations

import hashlib
import json
import re
import subprocess
import tempfile
from pathlib import Path
from typing import Any
from urllib.parse import quote

import httpx
from llama_index.llms.anthropic import Anthropic
from llama_index.llms.openai import OpenAI

from aifactory_rag.config import RagConfig, require_query_config
from aifactory_rag.db import connect
from aifactory_rag import dataflow
from aifactory_rag.query import graph
from aifactory_rag.query.retriever import RetrievedChunk, retrieve


def answer_question(
    config: RagConfig,
    question: str,
    user_id: str | None = None,
    source_ids: list[str] | None = None,
    exclude_content_types: list[str] | None = None,
    expand_graph: bool = True,
) -> dict:
    require_query_config(config)
    chunks = retrieve(
        config,
        question,
        source_ids=source_ids,
        exclude_content_types=exclude_content_types,
    )
    if expand_graph:
        chunks = _expand_with_graph(config, chunks)
    findings = _dataflow_findings(config, question, source_ids, chunks)
    answer = _generate_answer(config, question, chunks, [text for text, _ in findings])
    if findings and dataflow.NOTICE not in answer:
        answer = f"{answer}\n\n> {dataflow.NOTICE}"
    sources = [
        {
            "sourceId": chunk.source_id,
            "documentId": chunk.document_id,
            "chunkId": chunk.chunk_id,
            "relativePath": chunk.relative_path,
            "pageNumbers": list(chunk.page_numbers),
            "score": chunk.score,
            **code_location(chunk.relative_path, chunk.metadata),
            **({"graphRelation": chunk.metadata["graphRelation"]} if chunk.metadata.get("graphRelation") else {}),
        }
        for chunk in chunks
    ]
    sources.extend(location for _, location in findings)
    _record_query(config, question, answer, sources, user_id)
    return {"answer": answer, "sources": sources}


MAX_DATAFLOW_FINDINGS = 6


def _dataflow_findings(
    config: RagConfig, question: str, source_ids: list[str] | None, chunks: list[RetrievedChunk] | None = None,
) -> list[tuple[str, dict[str, Any]]]:
    """Run the prepared Joern query a data-flow question asks for (RQ-0025).

    Each finding becomes context text and a citation. All findings are
    gathered first and the most relevant kept: those in files the retrieval
    also found, then those that share words with the question, so a noisy
    input cannot crowd out the one the question is about. Joern being down or
    a source without a graph costs these findings, never the answer.
    """
    kinds = dataflow.classify(question)
    if not kinds:
        return []
    candidates = [s for s in config.sources if s.dataflow and s.enabled and (not source_ids or s.id in source_ids)]
    settings = dataflow.JoernSettings(url=config.joern.url, workspace=config.joern.workspace)
    found: list[tuple[str, dict[str, Any]]] = []
    retrieved = {chunk.relative_path for chunk in chunks or []}
    words = {word.lower() for word in re.findall(r"[A-Za-z_][A-Za-z0-9_]{2,}", question)}

    def relevance(item: tuple[str, dict[str, Any]]) -> tuple[int, int]:
        text, location = item
        lowered = text.lower()
        return (int(location.get("relativePath") in retrieved), sum(word in lowered for word in words))

    try:
        with connect(config.database.connection_string) as conn:
            for source in candidates:
                for kind in kinds:
                    result = dataflow.run_dataflow(conn, settings, source, kind)
                    for item in result["inputs"]:
                        for finding in item["findings"]:
                            text, anchor = dataflow.describe(finding)
                            found.append((
                                f"[data-flow finding by Joern ({kind}, {item.get('language', 'C/C++')}), not a qualified tool; input {item['input']}"
                                f"{' @ ' + str(item.get('ref')) if item.get('ref') else ''}"
                                f"{' (' + str(item['commit'])[:8] + ')' if item.get('commit') else ''}]\n{text}",
                                {
                                    "sourceId": source.id, "relativePath": anchor.get("file", ""), "dataflow": kind,
                                    "language": item.get("language", "C/C++"),
                                    "symbol": anchor.get("method"), "startLine": anchor.get("line"), "endLine": anchor.get("line"),
                                    **({"webUrl": anchor["webUrl"]} if anchor.get("webUrl") else {}),
                                    **({"repository": item["input"]} if item["input"] != "path" else {}),
                                },
                            ))
    except Exception as exc:  # noqa: BLE001 - findings are an addition to the answer
        print(f"Data-flow findings skipped: {exc}", flush=True)
    return sorted(found, key=relevance, reverse=True)[:MAX_DATAFLOW_FINDINGS]


def _expand_with_graph(config: RagConfig, chunks: list[RetrievedChunk]) -> list[RetrievedChunk]:
    """Add the callers and callees of the functions found, within the top-k budget.

    A third of the budget (at least two) goes to the graph; the weakest
    retrieval hits make room for it. The graph is an addition, never a reason
    to fail an answer.
    """
    top_k = config.retrieval.top_k
    limit = max(2, top_k // 3)
    try:
        with connect(config.database.connection_string) as conn:
            neighbors = graph.neighbor_chunks(conn, chunks, limit)
    except Exception as exc:  # noqa: BLE001 - e.g. a database not yet migrated
        print(f"Graph expansion skipped: {exc}", flush=True)
        return chunks
    if not neighbors:
        return chunks
    return chunks[: max(1, top_k - len(neighbors))] + neighbors


def code_location(relative_path: str, metadata: dict[str, Any]) -> dict[str, Any]:
    """Where a code chunk sits, and its GitLab link when it came from a repository."""
    location: dict[str, Any] = {}
    for key in ("repository", "commit", "symbol", "symbolKind", "section", "startLine", "endLine"):
        if metadata.get(key) is not None:
            location[key] = metadata[key]
    repository_url = metadata.get("repositoryUrl")
    commit = metadata.get("commit")
    if repository_url and commit and str(repository_url).startswith(("http://", "https://")):
        anchor = ""
        if metadata.get("startLine"):
            anchor = f"#L{metadata['startLine']}-{metadata.get('endLine') or metadata['startLine']}"
        location["webUrl"] = f"{repository_url}/-/blob/{commit}/{quote(relative_path)}{anchor}"
    return location


def citation_label(relative_path: str, metadata: dict[str, Any], page_numbers: tuple[int, ...] = ()) -> str:
    """How a chunk is named to the model, and so how the answer cites it.

    `<repository>@<short commit>:<path>:<start>-<end> (<symbol>)` for code from
    a repository, `<path>:<start>-<end> (<symbol>)` for code from a folder, and
    the file name with its pages for everything else.
    """
    label = relative_path
    if metadata.get("repository") and metadata.get("commit"):
        label = f"{metadata['repository']}@{str(metadata['commit'])[:8]}:{relative_path}"
    if metadata.get("startLine"):
        label += f":{metadata['startLine']}-{metadata.get('endLine') or metadata['startLine']}"
    if metadata.get("symbol"):
        label += f" ({metadata['symbol']})"
    elif metadata.get("section"):
        label += f" § {metadata['section'].split(' > ')[-1]}"
    if page_numbers:
        noun = "page" if len(page_numbers) == 1 else "pages"
        label += f"; {noun} {', '.join(str(page) for page in page_numbers)}"
    return label


def _generate_answer(config: RagConfig, question: str, chunks: list[RetrievedChunk], findings: list[str] | None = None) -> str:
    if not chunks and not findings:
        return "No matching source content was found for this question."

    context_parts: list[str] = []
    for chunk in chunks:
        label = citation_label(chunk.relative_path, chunk.metadata, chunk.page_numbers)
        if chunk.metadata.get("graphRelation"):
            label += f"; found through the code graph: {chunk.metadata['graphRelation']}"
        context_parts.append(f"[document: {label}]\n{chunk.text}")
    context_parts.extend(findings or [])
    context = "\n\n".join(context_parts)
    prompt = (
        "Answer the question using only the provided source context. "
        "If the context is insufficient, say so. Cite supporting evidence using the document "
        "filename and page number when available; cite code by the location in its document label, "
        "exactly as given. Do not use source numbers such as 'source 1'. A data-flow finding by Joern is "
        "a tool finding, not verified evidence: say so when you use one.\n\n"
        f"Question:\n{question}\n\n"
        f"Source context:\n{context}"
    )

    if config.llm.provider == "ollama":
        return _complete_with_ollama(config, prompt)
    if config.llm.provider == "gemini":
        return _complete_with_gemini(config, prompt)
    if config.llm.provider == "claude-cli":
        source_key = ",".join(sorted({chunk.source_id for chunk in chunks})) or "*"
        return _complete_with_claude_cli(config, prompt, session_key=source_key)
    if config.llm.provider == "claude":
        llm = Anthropic(model=config.llm.model, api_key=config.llm.api_key, temperature=config.llm.temperature)
    else:
        llm = OpenAI(model=config.llm.model, api_key=config.llm.api_key, temperature=config.llm.temperature)

    response = llm.complete(prompt)
    return str(response).strip()


# One seed session per source set, so a question against the same corpora reuses
# a warm prefix instead of paying for a cold one. Measured on the CLI: a fresh
# session writes about 5.8k cache tokens and costs roughly $0.073, while a fork
# of an existing session writes about 0.3k and costs roughly $0.021. The seeds
# live for the life of this process; losing them only makes the next call the
# expensive kind again.
_CLAUDE_CLI_SEEDS: dict[str, str] = {}


def _claude_cli_session_dir(session_key: str) -> str:
    """A stable directory per source set.

    The CLI scopes its sessions to the working directory, so a throwaway
    temporary directory would make `--resume` unable to find the seed. The
    directory is outside any project, which keeps a project's CLAUDE.md out of
    the prompt: the retrieved context stays the only thing the model can answer
    from.
    """
    digest = hashlib.sha256(session_key.encode("utf-8")).hexdigest()[:16]
    path = Path(tempfile.gettempdir()) / f"aifactory-rag-claude-cli-{digest}"
    path.mkdir(parents=True, exist_ok=True)
    return str(path)


def _complete_with_claude_cli(config: RagConfig, prompt: str, session_key: str | None = None) -> str:
    """Answer through the Claude Code CLI instead of an HTTP API.

    The point of this provider is that it needs no API key: the CLI uses the
    Claude session of whoever is signed in on the machine running this service.

    Each call carries the CLI's own harness prompt, about 35k input tokens. That
    prefix is cached, so the cost of a call depends on whether it can reuse a
    warm one. This is why a seed session is kept per source set and every answer
    is a **fork** of it: a fork reads the seed's prefix from cache and writes its
    own turn into a new session, so the seed never grows and one answer can never
    leak into the next. Resuming without forking would be equally cheap and
    would accumulate history, which for a service whose contract is "answer only
    from the provided context" is a correctness risk, not an optimisation.

    `--bare` would strip the harness entirely but reads only an API key and never
    the signed-in session, so it cannot be used here.

    Every tool is denied and nothing may stop to ask, which makes this a plain
    completion.
    """
    key = session_key or "*"
    workdir = _claude_cli_session_dir(key)
    seed = _CLAUDE_CLI_SEEDS.get(key)

    envelope = _run_claude_cli(config, prompt, workdir, seed)
    if envelope is None:
        # The seed is gone: the host restarted, or the session was pruned. Start
        # a fresh one and remember it.
        _CLAUDE_CLI_SEEDS.pop(key, None)
        seed = None  # this call is now the opening one, so its id becomes the seed
        envelope = _run_claude_cli(config, prompt, workdir, None)
        if envelope is None:
            raise RuntimeError("Claude CLI could not start a session.")

    answer = envelope.get("result")
    answer = answer.strip() if isinstance(answer, str) else ""
    # An unauthenticated or refused run still exits 0 and says so in the
    # envelope, so the envelope decides, not the exit code.
    if envelope.get("is_error"):
        raise RuntimeError(f"Claude CLI reported an error: {answer or 'no detail'}")
    if not answer:
        raise RuntimeError("Claude CLI returned an empty result.")

    # The first answer for a source set becomes its seed; later answers fork it
    # and must not replace it, or the prefix would drift and grow.
    if seed is None:
        session_id = envelope.get("session_id")
        if isinstance(session_id, str) and session_id:
            _CLAUDE_CLI_SEEDS[key] = session_id
    return answer


def _run_claude_cli(
    config: RagConfig, prompt: str, workdir: str, seed: str | None
) -> dict[str, Any] | None:
    """One CLI invocation. Returns None when a named seed could not be resumed."""
    denied = (
        "Bash Edit Write Read Glob Grep WebFetch WebSearch Task NotebookEdit "
        "TodoWrite Artifact Skill"
    )
    command = [
        config.llm.executable,
        "--print",
        "--output-format",
        "json",
        "--model",
        config.llm.model,
        "--permission-prompts",
        "none",
        "--disallowedTools",
        denied,
    ]
    if config.llm.effort:
        command += ["--effort", config.llm.effort]
    if seed:
        command += ["--resume", seed, "--fork-session"]

    try:
        completed = subprocess.run(  # noqa: S603 - the command is built here, not taken from input
            command,
            input=prompt,
            capture_output=True,
            text=True,
            timeout=config.llm.timeout_seconds,
            cwd=workdir,
        )
    except FileNotFoundError as exc:
        raise RuntimeError(
            f"Claude CLI not found ({config.llm.executable}). Install Claude Code on the host "
            "running this service and sign in there."
        ) from exc
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError(
            f"Claude CLI did not answer within {config.llm.timeout_seconds} seconds."
        ) from exc

    if completed.returncode != 0:
        detail = (completed.stderr or completed.stdout or "").strip()[-2000:]
        if seed:
            return None  # most likely the seed no longer exists; the caller retries clean
        raise RuntimeError(f"Claude CLI exited with {completed.returncode}: {detail}")

    try:
        return json.loads(completed.stdout)
    except json.JSONDecodeError as exc:
        raise RuntimeError(
            f"Claude CLI did not return JSON: {completed.stdout.strip()[:500]}"
        ) from exc


def _complete_with_gemini(config: RagConfig, prompt: str) -> str:
    if not config.llm.api_key:
        raise RuntimeError("GEMINI_API_KEY is required for Gemini LLM responses.")

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{config.llm.model}:generateContent"
    response = httpx.post(
        url,
        headers={
            "Content-Type": "application/json",
            "x-goog-api-key": config.llm.api_key,
        },
        json={
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"temperature": config.llm.temperature},
        },
        timeout=120,
    )
    response.raise_for_status()
    data = response.json()
    candidates = data.get("candidates") or []
    if not candidates:
        raise RuntimeError("Gemini response did not include candidates.")
    parts = candidates[0].get("content", {}).get("parts", [])
    texts = [part.get("text", "") for part in parts if part.get("text")]
    if not texts:
        raise RuntimeError("Gemini response did not include text.")
    return "\n".join(texts).strip()


def _complete_with_ollama(config: RagConfig, prompt: str) -> str:
    base_url = (config.llm.base_url or "http://localhost:11434").rstrip("/")
    response = httpx.post(
        f"{base_url}/api/generate",
        json={
            "model": config.llm.model,
            "prompt": prompt,
            "stream": False,
            "options": {"temperature": config.llm.temperature},
        },
        timeout=180,
    )
    response.raise_for_status()
    data = response.json()
    answer = data.get("response")
    if not answer:
        raise RuntimeError("Ollama response did not include generated text.")
    return str(answer).strip()


def _record_query(config: RagConfig, question: str, answer: str, sources: list[dict], user_id: str | None) -> None:
    with connect(config.database.connection_string) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO rag_queries(user_id, question, answer, sources)
                VALUES (%s, %s, %s, %s::jsonb)
                """,
                (user_id, question, answer, json.dumps(sources)),
            )
        conn.commit()
