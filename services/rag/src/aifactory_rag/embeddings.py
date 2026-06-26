from __future__ import annotations

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
        if not self.api_key:
            raise RuntimeError("GEMINI_API_KEY is required for Gemini embeddings.")

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return [self._embed(f"title: none | text: {text}", task_type="RETRIEVAL_DOCUMENT") for text in texts]

    def embed_query(self, text: str) -> list[float]:
        return self._embed(text, task_type="RETRIEVAL_QUERY")

    def _embed(self, text: str, task_type: str) -> list[float]:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:embedContent"
        response = httpx.post(
            url,
            headers={
                "Content-Type": "application/json",
                "x-goog-api-key": self.api_key,
            },
            json={
                "taskType": task_type,
                "outputDimensionality": self.dimensions,
                "content": {"parts": [{"text": text}]},
            },
            timeout=60,
        )
        response.raise_for_status()
        data = response.json()
        embedding = data.get("embedding")
        if embedding and "values" in embedding:
            return [float(value) for value in embedding["values"]]
        embeddings = data.get("embeddings")
        if embeddings and "values" in embeddings[0]:
            return [float(value) for value in embeddings[0]["values"]]
        raise RuntimeError("Gemini embedding response did not include embedding values.")


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
