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


# Qwen3-Embedding is trained to embed a query after a one-line task and a
# document as it is; without the instruction its retrieval is measurably worse.
QWEN3_QUERY_INSTRUCTION = (
    "Given a question about an engineering project, retrieve the documentation, "
    "standard text or source code that answers it"
)


def query_instruction_for(config: RagEmbeddingConfig) -> str | None:
    if config.query_instruction:
        return config.query_instruction
    return QWEN3_QUERY_INSTRUCTION if "qwen3-embedding" in config.model.lower() else None


def fit_dimensions(vector: list[float], dimensions: int) -> list[float]:
    """Cut a Matryoshka vector to the configured width and normalise it again."""
    if len(vector) < dimensions:
        raise RuntimeError(f"Embedding dimension mismatch: expected {dimensions}, received {len(vector)}")
    if len(vector) == dimensions:
        return vector
    cut = vector[:dimensions]
    norm = sum(value * value for value in cut) ** 0.5 or 1.0
    return [value / norm for value in cut]


class OllamaEncodingError(RuntimeError):
    """Ollama computed a vector it could not encode (NaN) for some input of a batch."""


class OllamaEmbeddingAdapter(EmbeddingAdapter):
    """Ollama's `/api/embed`: one request per batch (RQ-0033).

    The Ollama runs on a lab machine, so a refused or dropped connection (the
    machine restarting) is retried with backoff instead of failing the ingest.
    """

    def __init__(self, config: RagEmbeddingConfig):
        self.model = config.model
        self.dimensions = config.dimensions
        self.base_url = (config.base_url or "http://localhost:11434").rstrip("/")
        self.instruction = query_instruction_for(config)
        self.max_retries = config.max_retries
        self.retry_base_seconds = config.retry_base_seconds
        self.retry_max_seconds = config.retry_max_seconds
        self._client = httpx.Client(timeout=config.timeout_seconds)

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return self._embed_isolating(texts) if texts else []

    def embed_query(self, text: str) -> list[float]:
        prompt = f"Instruct: {self.instruction}\nQuery: {text}" if self.instruction else text
        return self._embed([prompt])[0]

    def _embed_isolating(self, texts: list[str]) -> list[list[float]]:
        """A batch Ollama cannot encode is halved until the text it fails on is alone.

        Qwen3-Embedding 8B returns NaN for an odd input now and then, and Ollama
        then fails the whole batch ("json: unsupported value: NaN"): one bad
        chunk must not cost the other 49. A text that fails alone is retried
        with its whitespace collapsed, then reported.
        """
        try:
            return self._embed(texts)
        except OllamaEncodingError:
            if len(texts) == 1:
                cleaned = " ".join(texts[0].split())
                if cleaned and cleaned != texts[0]:
                    return self._embed([cleaned])
                raise
            middle = len(texts) // 2
            return self._embed_isolating(texts[:middle]) + self._embed_isolating(texts[middle:])

    def _embed(self, texts: list[str]) -> list[list[float]]:
        attempt = 0
        while True:
            try:
                response = self._client.post(f"{self.base_url}/api/embed", json={"model": self.model, "input": texts})
            except (httpx.ConnectError, httpx.RemoteProtocolError, httpx.ReadError, httpx.TimeoutException) as exc:
                if attempt >= self.max_retries:
                    raise RuntimeError(f"Ollama at {self.base_url} is not reachable: {exc.__class__.__name__}") from None
                delay = min(self.retry_max_seconds, self.retry_base_seconds * (2 ** attempt))
                print(f"Ollama at {self.base_url} unreachable ({exc.__class__.__name__}); retrying in {delay:.0f}s", flush=True)
                time.sleep(delay)
                attempt += 1
                continue
            if response.status_code >= 400:
                error = OllamaEncodingError if "NaN" in response.text else RuntimeError
                raise error(f"Ollama embedding failed: HTTP {response.status_code}: {response.text[:300]}")
            embeddings = response.json().get("embeddings")
            if not embeddings or len(embeddings) != len(texts):
                raise RuntimeError("Ollama embedding response did not include one embedding per input.")
            return [fit_dimensions([float(value) for value in vector], self.dimensions) for vector in embeddings]


class LocalEmbeddingAdapter(EmbeddingAdapter):
    """Generate dense embeddings in-process with FastEmbed and ONNX Runtime."""

    def __init__(self, config: RagEmbeddingConfig):
        try:
            from fastembed import TextEmbedding
        except ImportError as exc:
            raise RuntimeError(
                "Local embeddings require FastEmbed. Run: pnpm rag:install"
            ) from exc

        self.dimensions = config.dimensions
        self._model = TextEmbedding(
            model_name=config.model,
            cache_dir=config.cache_dir,
            threads=config.threads,
            local_files_only=config.local_files_only,
            specific_model_path=config.model_path or None,
        )
        model_dimensions = int(self._model.embedding_size)
        if model_dimensions != self.dimensions:
            raise RuntimeError(
                f"Local embedding dimension mismatch: configured {self.dimensions}, "
                f"model {config.model} produces {model_dimensions}"
            )

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        return [self._vector(values) for values in self._model.passage_embed(texts)]

    def embed_query(self, text: str) -> list[float]:
        values = next(iter(self._model.query_embed(text)))
        return self._vector(values)

    def _vector(self, values: Any) -> list[float]:
        raw = values.tolist() if hasattr(values, "tolist") else list(values)
        vector = [float(value) for value in raw]
        if len(vector) != self.dimensions:
            raise RuntimeError(
                f"Local embedding dimension mismatch: expected {self.dimensions}, received {len(vector)}"
            )
        return vector


def create_embedding_adapter(config: RagEmbeddingConfig) -> EmbeddingAdapter:
    if config.provider == "local":
        return LocalEmbeddingAdapter(config)
    if config.provider == "ollama":
        return OllamaEmbeddingAdapter(config)
    if config.provider == "gemini":
        return GeminiEmbeddingAdapter(config)
    return OpenAIEmbeddingAdapter(config)
