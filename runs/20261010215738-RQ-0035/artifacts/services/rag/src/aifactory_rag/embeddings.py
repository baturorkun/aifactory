from __future__ import annotations

import random
import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor
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


# A host that does not accept a connection within this time is away: a question
# must not wait for a switched-off machine the way a batch waits for its vectors.
OLLAMA_CONNECT_TIMEOUT_SECONDS = 5.0
# Requests smaller than this (a question) say nothing about a host's speed.
OLLAMA_MEASURED_CHARACTERS = 2000
_CONNECTION_ERRORS = (httpx.ConnectError, httpx.RemoteProtocolError, httpx.ReadError, httpx.TimeoutException)


class OllamaHost:
    """What is known about one Ollama address (RQ-0035).

    Kept for the life of the process and shared by every adapter: the API makes
    a new adapter for each question, and a question must not rediscover that a
    host is switched off.
    """

    def __init__(self, url: str) -> None:
        self.url = url
        self.rate: float | None = None  # characters a second, recent average
        self.away_until = 0.0  # monotonic time before which it is not tried
        self.digest: str | None = None  # the model's digest once checked; "" when the host lacks the model
        self.why: str | None = None  # why it is left out, short
        self.said: str | None = None  # the same as printed, so each change is printed once

    def measured(self, characters: int, seconds: float) -> None:
        if characters < OLLAMA_MEASURED_CHARACTERS or seconds <= 0:
            return
        rate = characters / seconds
        self.rate = rate if self.rate is None else 0.7 * self.rate + 0.3 * rate


_OLLAMA_HOSTS: dict[tuple[str, str], OllamaHost] = {}
# model -> (digest, the host that set it)
_OLLAMA_MODEL_DIGESTS: dict[str, tuple[str, str]] = {}
_OLLAMA_HOSTS_LOCK = threading.Lock()


def ollama_host(url: str, model: str) -> OllamaHost:
    with _OLLAMA_HOSTS_LOCK:
        return _OLLAMA_HOSTS.setdefault((url, model), OllamaHost(url))


def ollama_urls(base_url: str | None) -> list[str]:
    """`baseUrl` is one address or several separated by commas, in order of preference."""
    urls = [part.strip().rstrip("/") for part in (base_url or "").split(",") if part.strip()]
    return list(dict.fromkeys(urls)) or ["http://localhost:11434"]


def share_out(count: int, hosts: list[OllamaHost]) -> list[tuple[OllamaHost, int, int]]:
    """Split `count` texts between hosts in proportion to their measured speed.

    Returns `(host, start, end)` slices in the order of the hosts. A host that
    has not been measured counts as an average one, so with no measurement at
    all the split is equal. A single text goes to the fastest host, the first
    listed one among equals.
    """
    known = [host.rate for host in hosts if host.rate]
    average = sum(known) / len(known) if known else 1.0
    weights = [host.rate or average for host in hosts]
    total = sum(weights)
    exact = [count * weight / total for weight in weights]
    shares = [int(value) for value in exact]
    # The texts left over by rounding down go to the largest remainders, the
    # faster host first among equal ones.
    order = sorted(range(len(hosts)), key=lambda i: (-(exact[i] - shares[i]), -weights[i], i))
    for i in order[: count - sum(shares)]:
        shares[i] += 1
    slices, start = [], 0
    for host, share in zip(hosts, shares):
        if share:
            slices.append((host, start, start + share))
            start += share
    return slices


class OllamaEncodingError(RuntimeError):
    """Ollama computed a vector it could not encode (NaN) for some input of a batch."""


class _OllamaHostsAway(RuntimeError):
    """No listed host took the request; carries the last reason."""


class OllamaEmbeddingAdapter(EmbeddingAdapter):
    """Ollama's `/api/embed`: one request per batch and host (RQ-0033, RQ-0035).

    The Ollamas run on lab machines. With one address a refused or dropped
    connection (the machine restarting) is retried with backoff instead of
    failing the ingest. With several, a batch is shared out between the hosts
    that answer, in proportion to their speed; a host that is away is stepped
    over and tried again later, and the backoff starts only when none answers.
    """

    def __init__(self, config: RagEmbeddingConfig):
        self.model = config.model
        self.dimensions = config.dimensions
        self.hosts = [ollama_host(url, config.model) for url in ollama_urls(config.base_url)]
        self.instruction = query_instruction_for(config)
        self.max_retries = config.max_retries
        self.retry_base_seconds = config.retry_base_seconds
        self.retry_max_seconds = config.retry_max_seconds
        self.host_retry_seconds = config.host_retry_seconds
        self._client = httpx.Client(timeout=httpx.Timeout(config.timeout_seconds, connect=OLLAMA_CONNECT_TIMEOUT_SECONDS))

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
        names = ", ".join(host.url for host in self.hosts)
        attempt = 0
        while True:
            try:
                return self._embed_shared(texts)
            except _OllamaHostsAway as exc:
                if attempt >= self.max_retries:
                    raise RuntimeError(f"Ollama at {names} is not reachable: {exc}") from None
                delay = min(self.retry_max_seconds, self.retry_base_seconds * (2 ** attempt))
                print(f"Ollama at {names} unreachable ({exc}); retrying in {delay:.0f}s", flush=True)
                time.sleep(delay)
                attempt += 1

    def _embed_shared(self, texts: list[str]) -> list[list[float]]:
        """One pass over the hosts: every text is embedded, or no host is left."""
        vectors: list[list[float] | None] = [None] * len(texts)
        pending = list(range(len(texts)))
        failed: set[str] = set()
        # When every host is in its pause there is nothing to step over to: all
        # of them are tried again, which is the single-host retry of RQ-0033.
        hosts = self._ready_hosts() or self._ready_hosts(ignore_pause=True)
        while pending:
            if not hosts:
                raise _OllamaHostsAway("; ".join(dict.fromkeys(host.why for host in self.hosts if host.why)) or "no host")
            parts = [(host, pending[start:end]) for host, start, end in share_out(len(pending), hosts)]
            pending = []
            for host, indices, outcome in self._send(parts, texts):
                if isinstance(outcome, Exception):
                    if not self._host_failed(outcome):
                        raise outcome
                    self._away(host, outcome)
                    failed.add(host.url)
                    pending.extend(indices)
                    continue
                for index, vector in zip(indices, outcome):
                    vectors[index] = vector
            pending.sort()
            hosts = [host for host in self._ready_hosts() if host.url not in failed] if pending else []
        return vectors  # type: ignore[return-value]

    def _send(self, parts: list[tuple[OllamaHost, list[int]]], texts: list[str]) -> list[tuple[OllamaHost, list[int], Any]]:
        def one(host: OllamaHost, indices: list[int]) -> Any:
            try:
                return self._request(host, [texts[index] for index in indices])
            except Exception as exc:  # noqa: BLE001 - sorted out by the caller
                return exc

        if len(parts) == 1:
            return [(host, indices, one(host, indices)) for host, indices in parts]
        with ThreadPoolExecutor(max_workers=len(parts)) as pool:
            futures = [pool.submit(one, host, indices) for host, indices in parts]
            return [(host, indices, future.result()) for (host, indices), future in zip(parts, futures)]

    def _request(self, host: OllamaHost, texts: list[str]) -> list[list[float]]:
        started = time.monotonic()
        response = self._client.post(f"{host.url}/api/embed", json={"model": self.model, "input": texts})
        if response.status_code >= 400:
            message = f"Ollama embedding failed: HTTP {response.status_code}: {response.text[:300]}"
            if "NaN" in response.text:
                raise OllamaEncodingError(message)
            raise _OllamaServerError(message) if response.status_code >= 500 else RuntimeError(message)
        embeddings = response.json().get("embeddings")
        if not embeddings or len(embeddings) != len(texts):
            raise RuntimeError("Ollama embedding response did not include one embedding per input.")
        host.measured(sum(len(text) for text in texts), time.monotonic() - started)
        host.away_until, host.why = 0.0, None
        return [fit_dimensions([float(value) for value in vector], self.dimensions) for vector in embeddings]

    def _host_failed(self, error: Exception) -> bool:
        """Whether an error means the host is away, not that the texts are wrong.

        A server error (the model does not fit the GPU any more) counts only
        when another host is listed to take the texts.
        """
        return isinstance(error, _CONNECTION_ERRORS) or (isinstance(error, _OllamaServerError) and len(self.hosts) > 1)

    def _away(self, host: OllamaHost, error: Exception) -> None:
        why = error.__class__.__name__ if isinstance(error, _CONNECTION_ERRORS) else str(error)
        self._leave_out(host, why, f"Ollama at {host.url} is away ({why})")

    def _leave_out(self, host: OllamaHost, why: str, message: str) -> None:
        host.away_until = time.monotonic() + self.host_retry_seconds
        host.why = why
        host.digest = None  # checked again when it is tried again
        # With one host the retry loop reports it; with several each change is said once.
        if len(self.hosts) > 1 and host.said != message:
            print(f"{message}; tried again every {self.host_retry_seconds:.0f}s", flush=True)
        host.said = message

    def _ready_hosts(self, ignore_pause: bool = False) -> list[OllamaHost]:
        now = time.monotonic()
        ready = [host for host in self.hosts if ignore_pause or host.away_until <= now]
        if len(self.hosts) == 1:
            return ready
        # Vectors of two models must never share an index: with several hosts
        # each one shows the digest of the model before it gets a text. The
        # first listed host that answers sets the digest for the process.
        for host in ready:
            if host.digest is None:
                self._check_model(host)
        with _OLLAMA_HOSTS_LOCK:
            first = next((host for host in ready if host.digest), None)
            if first is not None:
                _OLLAMA_MODEL_DIGESTS.setdefault(self.model, (first.digest or "", first.url))
            wanted, wanted_url = _OLLAMA_MODEL_DIGESTS.get(self.model, ("", ""))
        usable = []
        for host in ready:
            if host.digest is None:
                continue
            if host.digest != wanted:
                has = f"has {self.model} {host.digest[:12]}" if host.digest else f"does not have {self.model}"
                against = f", {wanted_url} has {wanted[:12]}" if wanted else ""
                self._leave_out(host, f"{host.url} {has}", f"Ollama at {host.url} refused: it {has}{against}")
                continue
            if host.said:
                print(f"Ollama at {host.url} is back", flush=True)
                host.said = None
            usable.append(host)
        return usable

    def _check_model(self, host: OllamaHost) -> None:
        try:
            response = self._client.get(f"{host.url}/api/tags")
        except _CONNECTION_ERRORS as exc:
            self._away(host, exc)
            return
        if response.status_code >= 400:
            self._away(host, _OllamaServerError(f"HTTP {response.status_code} from /api/tags"))
            return
        name = self.model if ":" in self.model else f"{self.model}:latest"
        host.digest = next((str(model.get("digest") or "") for model in response.json().get("models") or [] if model.get("name") == name), "")


class _OllamaServerError(RuntimeError):
    """Ollama answered with a 5xx that is not about the texts."""


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
