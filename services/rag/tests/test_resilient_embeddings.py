from __future__ import annotations

import json
import sys
import types
import unittest
from unittest.mock import patch

import httpx
import psycopg

from aifactory_rag.config import RagConfig, RagEmbeddingConfig
from aifactory_rag.embeddings import GeminiEmbeddingAdapter, LocalEmbeddingAdapter, create_embedding_adapter
from aifactory_rag.ingest.pipeline import (
    _can_resume,
    _content_type_metadata,
    _replace_chunks,
    _run_with_database_retries,
    _safe_rollback,
)


class FakeCursor:
    def __init__(self, connection: "FakeConnection") -> None:
        self.connection = connection

    def __enter__(self) -> "FakeCursor":
        return self

    def __exit__(self, *_: object) -> None:
        return None

    def execute(self, statement: str, params: tuple[object, ...]) -> None:
        if statement.startswith("SELECT chunk_index"):
            self.connection.selected = True
        elif "INSERT INTO rag_chunks" in statement:
            self.connection.inserted_indices.append(int(params[2]))
            self.connection.inserted_metadata.append(json.loads(str(params[5])))

    def fetchall(self) -> list[dict[str, object]]:
        return self.connection.completed_rows


class FakeConnection:
    def __init__(self, completed_rows: list[dict[str, object]]) -> None:
        self.completed_rows = completed_rows
        self.inserted_indices: list[int] = []
        self.inserted_metadata: list[dict[str, object]] = []
        self.commit_count = 0
        self.selected = False

    def cursor(self) -> FakeCursor:
        return FakeCursor(self)

    def commit(self) -> None:
        self.commit_count += 1


class FakeEmbeddingAdapter:
    def __init__(self) -> None:
        self.batches: list[list[str]] = []

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        self.batches.append(texts)
        return [[float(index), 1.0, 2.0] for index, _ in enumerate(texts)]


def gemini_config(**overrides: object) -> RagEmbeddingConfig:
    values: dict[str, object] = {
        "provider": "gemini",
        "model": "gemini-embedding-001",
        "dimensions": 3,
        "apiKey": "test-key",
        "maxRetries": 2,
        "retryBaseSeconds": 0.01,
        "retryMaxSeconds": 0.02,
        "minRequestIntervalSeconds": 0,
    }
    values.update(overrides)
    return RagEmbeddingConfig.model_validate(values)


class ResilientEmbeddingTests(unittest.TestCase):
    def test_local_embedding_runs_in_process_and_validates_dimensions(self) -> None:
        class FakeTextEmbedding:
            embedding_size = 3

            def __init__(self, **kwargs: object) -> None:
                self.kwargs = kwargs

            def passage_embed(self, texts: list[str]) -> list[list[float]]:
                return [[float(index), 1.0, 2.0] for index, _ in enumerate(texts)]

            def query_embed(self, _text: str) -> list[list[float]]:
                return [[3.0, 4.0, 5.0]]

        module = types.ModuleType("fastembed")
        module.TextEmbedding = FakeTextEmbedding  # type: ignore[attr-defined]
        config = RagEmbeddingConfig.model_validate(
            {
                "provider": "local",
                "model": "BAAI/bge-small-en-v1.5",
                "dimensions": 3,
                "cacheDir": "/models",
                "localFilesOnly": True,
                "threads": 2,
            }
        )

        with patch.dict(sys.modules, {"fastembed": module}):
            adapter = create_embedding_adapter(config)

        self.assertIsInstance(adapter, LocalEmbeddingAdapter)
        self.assertEqual(adapter.embed_documents(["first", "second"]), [[0.0, 1.0, 2.0], [1.0, 1.0, 2.0]])
        self.assertEqual(adapter.embed_query("question"), [3.0, 4.0, 5.0])

    @patch("aifactory_rag.embeddings.time.sleep", lambda _: None)
    def test_gemini_batches_documents_and_retries_429(self) -> None:
        calls: list[httpx.Request] = []

        def handler(request: httpx.Request) -> httpx.Response:
            calls.append(request)
            if len(calls) == 1:
                return httpx.Response(
                    429,
                    request=request,
                    json={"error": {"status": "RESOURCE_EXHAUSTED", "message": "quota reached", "details": [{"retryDelay": "0.01s"}]}},
                )
            return httpx.Response(
                200,
                request=request,
                json={"embeddings": [{"values": [1, 2, 3]}, {"values": [4, 5, 6]}]},
            )

        adapter = GeminiEmbeddingAdapter(gemini_config())
        adapter._client = httpx.Client(transport=httpx.MockTransport(handler))

        result = adapter.embed_documents(["first", "second"])

        self.assertEqual(result, [[1.0, 2.0, 3.0], [4.0, 5.0, 6.0]])
        self.assertEqual(len(calls), 2)
        self.assertTrue(calls[0].url.path.endswith(":batchEmbedContents"))
        payload = json.loads(calls[0].content)
        self.assertEqual(len(payload["requests"]), 2)
        self.assertTrue(all(request["model"] == "models/gemini-embedding-001" for request in payload["requests"]))

    @patch("aifactory_rag.embeddings.time.sleep", lambda _: None)
    def test_gemini_exhausted_retry_includes_api_error(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(429, request=request, json={"error": {"status": "RESOURCE_EXHAUSTED", "message": "daily quota exhausted"}})

        adapter = GeminiEmbeddingAdapter(gemini_config(maxRetries=1))
        adapter._client = httpx.Client(transport=httpx.MockTransport(handler))

        with self.assertRaisesRegex(RuntimeError, "RESOURCE_EXHAUSTED.*daily quota exhausted") as caught:
            adapter.embed_query("question")
        self.assertIn("after 2 attempts", str(caught.exception))

    def test_checkpoint_resume_requires_matching_hash_and_chunk_config(self) -> None:
        config = RagConfig.model_validate({"ingest": {"chunkSize": 1200, "chunkOverlap": 150}})
        existing = {
            "status": "processing",
            "content_hash": "same-hash",
            "metadata": {
                "chunkSize": 1200,
                "chunkOverlap": 150,
                "embeddingProvider": "openai",
                "embeddingModel": "text-embedding-3-small",
                "embeddingDimensions": 1536,
            },
        }

        self.assertTrue(_can_resume(existing, "same-hash", config))
        self.assertFalse(_can_resume(existing, "changed-hash", config))
        self.assertFalse(_can_resume({**existing, "status": "active"}, "same-hash", config))
        self.assertFalse(_can_resume({**existing, "metadata": {"chunkSize": 2000, "chunkOverlap": 150}}, "same-hash", config))
        changed_embedding = {
            **existing,
            "metadata": {**existing["metadata"], "embeddingModel": "another-model"},
        }
        self.assertFalse(_can_resume(changed_embedding, "same-hash", config))

    def test_chunk_batches_resume_after_completed_checkpoints(self) -> None:
        chunks = ["zero", "one", "two", "three", "four"]
        connection = FakeConnection([{"chunk_index": 0, "text": "zero"}, {"chunk_index": 1, "text": "one"}])
        adapter = FakeEmbeddingAdapter()

        _replace_chunks(connection, 10, "source-a", "standards/standard.pdf", chunks, adapter, batch_size=2, resume=True)  # type: ignore[arg-type]

        self.assertTrue(connection.selected)
        self.assertEqual(adapter.batches, [["two", "three"], ["four"]])
        self.assertEqual(connection.inserted_indices, [2, 3, 4])
        self.assertEqual(connection.commit_count, 2)
        self.assertTrue(
            all(
                metadata == {
                    "relativePath": "standards/standard.pdf",
                }
                for metadata in connection.inserted_metadata
            )
        )

    def test_content_type_uses_the_first_root_relative_directory_name(self) -> None:
        self.assertEqual(
            _content_type_metadata("code/devices/uart.dml"),
            {"contentType": "code"},
        )
        self.assertEqual(
            _content_type_metadata("documentation/guides/reference.pdf"),
            {"contentType": "documentation"},
        )
        self.assertEqual(_content_type_metadata("root-file.pdf"), {})
        self.assertEqual(_content_type_metadata("standards/section-one.pdf"), {})

    @patch("aifactory_rag.ingest.pipeline.sleep", lambda _: None)
    def test_database_operation_reconnects_and_retries_after_admin_shutdown(self) -> None:
        config = RagConfig.model_validate(
            {
                "database": {"connectionString": "postgresql://test"},
                "ingest": {
                    "databaseReconnectRetries": 2,
                    "databaseReconnectDelaySeconds": 0.01,
                },
            }
        )

        class RetryConnection:
            def __init__(self, name: str) -> None:
                self.name = name
                self.closed = False

            def close(self) -> None:
                self.closed = True

        interrupted = RetryConnection("interrupted")
        recovered = RetryConnection("recovered")
        attempts: list[str] = []

        def operation(connection: RetryConnection) -> str:
            attempts.append(connection.name)
            if connection.name == "interrupted":
                raise psycopg.OperationalError("terminating connection due to administrator command")
            return "inserted"

        with patch("aifactory_rag.ingest.pipeline.connect", return_value=recovered) as reconnect:
            connection, result = _run_with_database_retries(  # type: ignore[arg-type]
                interrupted, config, "ingesting example.dml", operation,  # type: ignore[arg-type]
            )

        self.assertIs(connection, recovered)
        self.assertEqual(result, "inserted")
        self.assertEqual(attempts, ["interrupted", "recovered"])
        reconnect.assert_called_once_with("postgresql://test")

    def test_safe_rollback_does_not_mask_a_lost_connection(self) -> None:
        class LostConnection:
            closed = False

            def rollback(self) -> None:
                raise psycopg.OperationalError("connection is lost")

        _safe_rollback(LostConnection())  # type: ignore[arg-type]


if __name__ == "__main__":
    unittest.main()
