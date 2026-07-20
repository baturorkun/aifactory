from __future__ import annotations

import random
import re
import time
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Any

import httpx
from llama_index.embeddings.openai import OpenAIEmbedding

from aifactory_rag.config import RagEmbeddingConfig


class EmbeddingAdapter:
    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        raise NotImplementedError

    def embed_query(self, text: str) -> list[float]:
        raise NotImplementedError


class OpenAIEmbeddingAdapter(EmbeddingAdapter):
    def __init__(self, config: RagEmbeddingConfig):
        self._model = OpenAIEmbedding(
            model=config.model,
            api_key=config.api_key,
            dimensions=config.dimensions,
        )

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return self._model.get_text_embedding_batch(texts)

    def embed_query(self, text: str) -> list[float]:
        return self._model.get_text_embedding(text)


class GeminiEmbeddingAdapter(EmbeddingAdapter):
    def __init__(self, config: RagEmbeddingConfig):
        self.model = config.model
        self.api_key = config.api_key
        self.dimensions = config.dimensions
        self.max_retries = config.max_retries
        self.retry_base_seconds = config.retry_base_seconds
        self.retry_max_seconds = config.retry_max_seconds
        self.min_request_interval_seconds = config.min_request_interval_seconds
        self._last_request_started = 0.0
        self._client = httpx.Client(timeout=60)
        if not self.api_key:
            raise RuntimeError("GEMINI_API_KEY is required for Gemini embeddings.")

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        data = self._post(
            "batchEmbedContents",
            {"requests": [self._embed_request(text, "RETRIEVAL_DOCUMENT") for text in texts]},
        )
        embeddings = data.get("embeddings")
        if not isinstance(embeddings, list) or len(embeddings) != len(texts):
            raise RuntimeError(f"Gemini returned {len(embeddings) if isinstance(embeddings, list) else 0} embeddings for {len(texts)} inputs")
        return [self._embedding_values(item) for item in embeddings]

    def embed_query(self, text: str) -> list[float]:
        data = self._post("embedContent", self._embed_request(text, "RETRIEVAL_QUERY", include_model=False))
        return self._embedding_values(data.get("embedding"))

    def _embed_request(self, text: str, task_type: str, include_model: bool = True) -> dict[str, Any]:
        request: dict[str, Any] = {
            "content": {"parts": [{"text": text}]},
            "outputDimensionality": self.dimensions,
        }
        if self.model != "gemini-embedding-2":
            request["taskType"] = task_type
        if include_model:
            request["model"] = f"models/{self.model}"
        return request

    def _post(self, method: str, payload: dict[str, Any]) -> dict[str, Any]:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:{method}"
        for attempt in range(self.max_retries + 1):
            self._wait_for_request_slot()
            try:
                response = self._client.post(
                    url,
                    headers={"Content-Type": "application/json", "x-goog-api-key": self.api_key},
                    json=payload,
                )
            except httpx.TransportError as exc:
                if attempt >= self.max_retries:
                    raise RuntimeError(f"Gemini embedding transport failed after {attempt + 1} attempts: {exc}") from exc
                delay = self._backoff_delay(attempt)
                print(f"Gemini embedding retry {attempt + 1}/{self.max_retries} after transport error; waiting {delay:.1f}s: {exc}", flush=True)
                time.sleep(delay)
                continue

            if response.is_success:
                data = response.json()
                if not isinstance(data, dict):
                    raise RuntimeError("Gemini embedding response was not a JSON object")
                return data

            message = self._error_message(response)
            if response.status_code not in {408, 429, 500, 502, 503, 504} or attempt >= self.max_retries:
                raise RuntimeError(f"Gemini embedding failed after {attempt + 1} attempts: HTTP {response.status_code}: {message}")
            delay = self._retry_delay(response, attempt)
            print(f"Gemini embedding retry {attempt + 1}/{self.max_retries} after HTTP {response.status_code}; waiting {delay:.1f}s: {message}", flush=True)
            time.sleep(delay)
        raise RuntimeError("Gemini embedding retry loop ended unexpectedly")

    def _wait_for_request_slot(self) -> None:
        elapsed = time.monotonic() - self._last_request_started
        if elapsed < self.min_request_interval_seconds:
            time.sleep(self.min_request_interval_seconds - elapsed)
        self._last_request_started = time.monotonic()

    def _retry_delay(self, response: httpx.Response, attempt: int) -> float:
        retry_after = response.headers.get("Retry-After")
        if retry_after:
            try:
                return min(self.retry_max_seconds, max(0.0, float(retry_after)))
            except ValueError:
                try:
                    retry_at = parsedate_to_datetime(retry_after)
                    if retry_at.tzinfo is None:
                        retry_at = retry_at.replace(tzinfo=timezone.utc)
                    return min(self.retry_max_seconds, max(0.0, (retry_at - datetime.now(timezone.utc)).total_seconds()))
                except (TypeError, ValueError):
                    pass
        match = re.search(r'"retryDelay"\s*:\s*"([0-9]+(?:\.[0-9]+)?)s"', response.text)
        if match:
            return min(self.retry_max_seconds, float(match.group(1)))
        return self._backoff_delay(attempt)

    def _backoff_delay(self, attempt: int) -> float:
        base = min(self.retry_max_seconds, self.retry_base_seconds * (2 ** attempt))
        return min(self.retry_max_seconds, base + random.uniform(0, min(self.retry_base_seconds, base * 0.25)))

    def _error_message(self, response: httpx.Response) -> str:
        try:
            error = response.json().get("error", {})
            status = error.get("status")
            message = error.get("message")
            if message:
                return f"{status}: {message}" if status else str(message)
        except (ValueError, AttributeError):
            pass
        return response.text.strip()[:1000] or response.reason_phrase

    def _embedding_values(self, embedding: Any) -> list[float]:
        if not isinstance(embedding, dict) or not isinstance(embedding.get("values"), list):
            raise RuntimeError("Gemini embedding response did not include embedding values")
        values = [float(value) for value in embedding["values"]]
        if len(values) != self.dimensions:
            raise RuntimeError(f"Gemini embedding dimension mismatch: expected {self.dimensions}, received {len(values)}")
        return values


class OllamaEmbeddingAdapter(EmbeddingAdapter):
    def __init__(self, config: RagEmbeddingConfig):
        self.model = config.model
        self.base_url = (config.base_url or "http://localhost:11434").rstrip("/")

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return [self._embed(text) for text in texts]

    def embed_query(self, text: str) -> list[float]:
        return self._embed(text)

    def _embed(self, text: str) -> list[float]:
        response = httpx.post(
            f"{self.base_url}/api/embeddings",
            json={"model": self.model, "prompt": text},
            timeout=120,
        )
        response.raise_for_status()
        data = response.json()
        embedding = data.get("embedding")
        if not embedding:
            raise RuntimeError("Ollama embedding response did not include embedding values.")
        return [float(value) for value in embedding]


def create_embedding_adapter(config: RagEmbeddingConfig) -> EmbeddingAdapter:
    if config.provider == "ollama":
        return OllamaEmbeddingAdapter(config)
    if config.provider == "gemini":
        return GeminiEmbeddingAdapter(config)
    return OpenAIEmbeddingAdapter(config)
