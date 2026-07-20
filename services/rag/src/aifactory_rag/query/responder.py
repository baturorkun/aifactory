from __future__ import annotations

import json

import httpx
from llama_index.llms.anthropic import Anthropic
from llama_index.llms.openai import OpenAI

from aifactory_rag.config import RagConfig, require_query_config
from aifactory_rag.db import connect
from aifactory_rag.query.retriever import RetrievedChunk, retrieve


def answer_question(
    config: RagConfig,
    question: str,
    user_id: str | None = None,
    source_ids: list[str] | None = None,
) -> dict:
    require_query_config(config)
    chunks = retrieve(config, question, source_ids=source_ids)
    answer = _generate_answer(config, question, chunks)
    sources = [
        {
            "sourceId": chunk.source_id,
            "documentId": chunk.document_id,
            "chunkId": chunk.chunk_id,
            "relativePath": chunk.relative_path,
            "score": chunk.score,
        }
        for chunk in chunks
    ]
    _record_query(config, question, answer, sources, user_id)
    return {"answer": answer, "sources": sources}


def _generate_answer(config: RagConfig, question: str, chunks: list[RetrievedChunk]) -> str:
    if not chunks:
        return "No matching source content was found for this question."

    context = "\n\n".join(
        f"[source {index + 1}: {chunk.relative_path}]\n{chunk.text}"
        for index, chunk in enumerate(chunks)
    )
    prompt = (
        "Answer the question using only the provided source context. "
        "If the context is insufficient, say so. Include concise source references by path.\n\n"
        f"Question:\n{question}\n\n"
        f"Source context:\n{context}"
    )

    if config.llm.provider == "ollama":
        return _complete_with_ollama(config, prompt)
    if config.llm.provider == "gemini":
        return _complete_with_gemini(config, prompt)
    if config.llm.provider == "claude":
        llm = Anthropic(model=config.llm.model, api_key=config.llm.api_key, temperature=config.llm.temperature)
    else:
        llm = OpenAI(model=config.llm.model, api_key=config.llm.api_key, temperature=config.llm.temperature)

    response = llm.complete(prompt)
    return str(response).strip()


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
