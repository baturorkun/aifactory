"""Local embeddings on Ollama and passive sources (RQ-0033).

Gemini's prepaid credits ran out on 6 October and every ingest and question
failed with HTTP 402. Embeddings move to Qwen3-Embedding served by Ollama in
the lab; simics, embedded long ago by another model, is kept but left out.
"""

from __future__ import annotations

import json
import math
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import httpx

from aifactory_rag import status
from aifactory_rag.config import RagConfig, RagEmbeddingConfig, load_factory_config, searchable_source_ids
from aifactory_rag.embeddings import QWEN3_QUERY_INSTRUCTION, OllamaEmbeddingAdapter, fit_dimensions
from aifactory_rag.ingest.pipeline import PassiveSourceError, ingest_source


class FakeOllama:
    def __init__(self, width: int = 8, failures: int = 0) -> None:
        self.width = width
        self.failures = failures
        self.requests: list[dict] = []

    def __call__(self, url: str, json: dict) -> httpx.Response:  # noqa: A002 - httpx's name
        if self.failures:
            self.failures -= 1
            raise httpx.ConnectError("connection refused")
        self.requests.append({"url": url, **json})
        vectors = [[float(i + 1)] * self.width for i, _ in enumerate(json["input"])]
        return httpx.Response(200, json={"embeddings": vectors})


def adapter(model: str = "qwen3-embedding:8b", dimensions: int = 8, **extra: object) -> OllamaEmbeddingAdapter:
    return OllamaEmbeddingAdapter(RagEmbeddingConfig.model_validate({
        "provider": "ollama", "model": model, "dimensions": dimensions,
        "baseUrl": "http://builder:11434", "retryBaseSeconds": 0.01, **extra,
    }))


class OllamaAdapterTests(unittest.TestCase):
    def test_a_batch_is_one_request(self) -> None:
        fake = FakeOllama()
        client = adapter()
        with patch.object(client._client, "post", fake):
            vectors = client.embed_documents(["a", "b", "c"])
        self.assertEqual(len(vectors), 3)
        self.assertEqual(len(fake.requests), 1)
        self.assertEqual(fake.requests[0]["url"], "http://builder:11434/api/embed")
        self.assertEqual(fake.requests[0]["input"], ["a", "b", "c"])

    def test_a_dropped_connection_is_retried(self) -> None:
        fake = FakeOllama(failures=2)
        client = adapter()
        with patch.object(client._client, "post", fake), patch("aifactory_rag.embeddings.time.sleep"):
            self.assertEqual(len(client.embed_documents(["a"])), 1)
        self.assertEqual(len(fake.requests), 1)

    def test_a_batch_with_a_nan_text_is_split_until_the_text_is_alone(self) -> None:
        requests: list[list[str]] = []

        def post(url: str, json: dict) -> httpx.Response:  # noqa: A002
            requests.append(json["input"])
            if any("bad\n\n" in text for text in json["input"]):
                return httpx.Response(500, json={"error": "failed to encode response: json: unsupported value: NaN"})
            return httpx.Response(200, json={"embeddings": [[1.0] * 8 for _ in json["input"]]})

        client = adapter()
        with patch.object(client._client, "post", post):
            vectors = client.embed_documents(["a", "b", "bad\n\n  text", "d"])
        self.assertEqual(len(vectors), 4)
        # the whole batch, its halves, the bad text alone and cleaned; the rest as they were
        self.assertEqual(requests, [["a", "b", "bad\n\n  text", "d"], ["a", "b"], ["bad\n\n  text", "d"], ["bad\n\n  text"], ["bad text"], ["d"]])

    def test_qwen3_questions_carry_the_instruction_and_documents_do_not(self) -> None:
        fake = FakeOllama()
        client = adapter()
        with patch.object(client._client, "post", fake):
            client.embed_query("Where is the A429 label mask written?")
            client.embed_documents(["void a429_init(void) {}"])
        self.assertEqual(fake.requests[0]["input"], [f"Instruct: {QWEN3_QUERY_INSTRUCTION}\nQuery: Where is the A429 label mask written?"])
        self.assertEqual(fake.requests[1]["input"], ["void a429_init(void) {}"])

    def test_other_models_get_no_instruction_unless_one_is_set(self) -> None:
        fake = FakeOllama()
        plain, custom = adapter("bge-m3"), adapter("bge-m3", queryInstruction="Find the register")
        with patch.object(plain._client, "post", fake), patch.object(custom._client, "post", fake):
            plain.embed_query("q")
            custom.embed_query("q")
        self.assertEqual([r["input"] for r in fake.requests], [["q"], ["Instruct: Find the register\nQuery: q"]])


class WidthTests(unittest.TestCase):
    def test_a_wider_vector_is_cut_and_normalised(self) -> None:
        cut = fit_dimensions([3.0, 4.0, 12.0, 0.5], 2)
        self.assertEqual(len(cut), 2)
        self.assertAlmostEqual(cut[0], 0.6)
        self.assertAlmostEqual(math.sqrt(sum(v * v for v in cut)), 1.0)
        self.assertEqual(len(fit_dimensions([0.1] * 4096, 2000)), 2000)

    def test_a_narrower_vector_is_refused(self) -> None:
        with self.assertRaisesRegex(RuntimeError, "expected 2000, received 1024"):
            fit_dimensions([0.1] * 1024, 2000)


def rag_config(simics_enabled: bool = False) -> RagConfig:
    return RagConfig.model_validate({
        "database": {"connectionString": "postgresql://test"},
        "embedding": {"provider": "ollama", "model": "qwen3-embedding:8b", "dimensions": 2000},
        "sources": [
            {"id": "aselsan-bfi", "rootPath": "/srv/bfi"},
            {"id": "simics", "rootPath": "/srv/simics", "enabled": simics_enabled},
        ],
    })


class PassiveSourceTests(unittest.TestCase):
    def test_a_passive_source_is_not_searched(self) -> None:
        config = rag_config()
        self.assertEqual(searchable_source_ids(config), ["aselsan-bfi"])
        self.assertEqual(searchable_source_ids(config, ["simics"]), [])
        self.assertEqual(searchable_source_ids(config, ["simics", "aselsan-bfi"]), ["aselsan-bfi"])
        # nothing passive and nothing asked for: no filter at all, as before
        self.assertIsNone(searchable_source_ids(rag_config(simics_enabled=True)))

    def test_a_passive_source_is_not_ingested(self) -> None:
        with self.assertRaisesRegex(PassiveSourceError, "simics is passive"):
            ingest_source(rag_config(), "simics")

    def test_its_status_is_passive_not_failed(self) -> None:
        runs = [{"id": 73, "source_id": "simics", "status": "failed", "started_at": None, "finished_at": None, "error_count": 0, "scanned_count": 0}]
        entry = status.summarize(["simics"], runs, runs, [], [], passive={"simics"})[0]
        self.assertEqual(entry["state"], "passive")

    def test_enabled_off_in_the_environment_makes_a_source_passive(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "factory.config.json"
            path.write_text(json.dumps({"rag": {
                "database": {"connectionString": "postgresql://test"},
                "sources": [{"id": "simics", "rootPath": "/srv/simics", "envPrefix": "RAG_SOURCE_2"}],
            }}), encoding="utf-8")
            with patch.dict(os.environ, {"RAG_SOURCE_2_ENABLED": "off"}):
                off = load_factory_config(path).rag.sources[0]
            with patch.dict(os.environ, {"RAG_SOURCE_2_ENABLED": "on"}):
                on = load_factory_config(path).rag.sources[0]
        self.assertFalse(off.enabled)
        self.assertTrue(on.enabled)


class FakeLockConnection:
    def __init__(self, held: bool) -> None:
        self.held = held
        self.statements: list[str] = []

    def __enter__(self) -> "FakeLockConnection":
        return self

    def __exit__(self, *_: object) -> None:
        return None

    def execute(self, statement: str, params: tuple) -> "FakeLockConnection":
        self.statements.append(statement.split("(")[0].replace("SELECT ", ""))
        self.last = statement
        return self

    def fetchone(self) -> tuple:
        return (not self.held,)


class IngestLockTests(unittest.TestCase):
    """A CLI re-embedding and a webhook ingest of one source must not overlap."""

    def test_a_second_ingest_waits_for_the_first_and_the_lock_is_released(self) -> None:
        from aifactory_rag.ingest import pipeline

        lock = FakeLockConnection(held=True)
        with patch("aifactory_rag.ingest.pipeline.psycopg.connect", return_value=lock), \
                patch("aifactory_rag.ingest.pipeline._ingest_source", return_value="summary") as body:
            self.assertEqual(pipeline.ingest_source(rag_config(), "aselsan-bfi"), "summary")
        body.assert_called_once()
        self.assertEqual(lock.statements, ["pg_try_advisory_lock", "pg_advisory_lock", "pg_advisory_unlock"])

    def test_a_free_source_is_ingested_at_once(self) -> None:
        from aifactory_rag.ingest import pipeline

        lock = FakeLockConnection(held=False)
        with patch("aifactory_rag.ingest.pipeline.psycopg.connect", return_value=lock), \
                patch("aifactory_rag.ingest.pipeline._ingest_source", return_value="summary"):
            pipeline.ingest_source(rag_config(), "aselsan-bfi")
        self.assertEqual(lock.statements, ["pg_try_advisory_lock", "pg_advisory_unlock"])


class FakeHousekeepingConnection:
    """Two sources with running runs: arinc's lock is held (live), simics's is free."""

    def __init__(self) -> None:
        self.updated: list[str] = []
        self.unlocked: list[str] = []

    def __enter__(self) -> "FakeHousekeepingConnection":
        return self

    def __exit__(self, *_: object) -> None:
        return None

    def execute(self, statement: str, params: tuple = ()) -> "FakeHousekeepingConnection":
        self.statement, self.params = statement, params
        if "UPDATE" in statement:
            self.updated.append(params[0])
        if "pg_advisory_unlock" in statement:
            self.unlocked.append(params[0])
        return self

    def fetchall(self) -> list[tuple]:
        if "DISTINCT source_id" in self.statement:
            return [("arinc",), ("simics",)]
        return [(183,), (160,)] if self.params[0] == "simics" else []

    def fetchone(self) -> tuple:
        return (self.params[0] != "aifactory-rag-ingest:arinc",)


class InterruptedRunTests(unittest.TestCase):
    def test_runs_of_sources_nobody_ingests_are_closed_and_live_ones_kept(self) -> None:
        from aifactory_rag.ingest.pipeline import close_interrupted_runs

        fake = FakeHousekeepingConnection()
        with patch("aifactory_rag.ingest.pipeline.psycopg.connect", return_value=fake):
            closed = close_interrupted_runs("postgresql://test")
        self.assertEqual(closed, [183, 160])
        self.assertEqual(fake.updated, ["simics"])  # arinc's lock is held: a live ingest
        self.assertEqual(fake.unlocked, ["aifactory-rag-ingest:simics"])


if __name__ == "__main__":
    unittest.main()
