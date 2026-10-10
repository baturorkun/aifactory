"""Embeddings on several Ollama hosts (RQ-0035).

The RAG embedded on one Ollama, builder, at about 200 tokens a second. The
same model on a PC with an RTX 4060 does about 1700, and there is a second PC
like it. `rag.embedding.baseUrl` becomes a list: a batch is shared out between
the hosts that answer, a host that is away is stepped over, and a host with
another model is refused.
"""

from __future__ import annotations

import contextlib
import io
import threading
import time
import unittest
from unittest.mock import patch

import httpx
from aifactory_rag import embeddings
from aifactory_rag.config import RagEmbeddingConfig
from aifactory_rag.embeddings import (
    OllamaEmbeddingAdapter,
    OllamaHost,
    ollama_urls,
    share_out,
)

FAST, SLOW, THIRD = "http://rtx:11434", "http://builder:11434", "http://rtx2:11434"
MODEL = "qwen3-embedding:8b"
DIGEST, OTHER_DIGEST = "64b933495768aaaa", "0f0f0f0f0f0fbbbb"


class Lab:
    """Fake Ollamas by address. A text `t<n>` embeds to a vector of n."""

    def __init__(self, *urls: str) -> None:
        self.digests: dict[str, str | None] = {url: DIGEST for url in urls}
        self.down: set[str] = set()
        self.failing: set[str] = set()
        self.requests: list[tuple[str, list[str]]] = []
        self.asked_for_tags: list[str] = []
        self.together: threading.Barrier | None = None

    def post(self, url: str, json: dict) -> httpx.Response:
        host = url.removesuffix("/api/embed")
        if host in self.down:
            raise httpx.ConnectError("connection refused")
        self.requests.append((host, list(json["input"])))
        if host in self.failing:
            return httpx.Response(500, json={"error": "model requires more system memory"})
        if self.together is not None:
            self.together.wait(timeout=5)
        return httpx.Response(200, json={"embeddings": [[float(text.split("t")[-1])] * 8 for text in json["input"]]})

    def get(self, url: str) -> httpx.Response:
        host = url.removesuffix("/api/tags")
        self.asked_for_tags.append(host)
        if host in self.down:
            raise httpx.ConnectError("connection refused")
        digest = self.digests[host]
        return httpx.Response(200, json={"models": [{"name": MODEL, "digest": digest}] if digest else []})

    def sent_to(self, host: str) -> list[list[str]]:
        return [texts for url, texts in self.requests if url == host]


def texts(count: int) -> list[str]:
    return [f"t{index}" for index in range(count)]


def numbers(vectors: list[list[float]]) -> list[int]:
    return [int(vector[0]) for vector in vectors]


class SeveralHostsTests(unittest.TestCase):
    def setUp(self) -> None:
        embeddings._OLLAMA_HOSTS.clear()
        embeddings._OLLAMA_MODEL_DIGESTS.clear()
        self.printed = io.StringIO()
        self.enterContext(contextlib.redirect_stdout(self.printed))

    def adapter(self, lab: Lab, *urls: str, **extra: object) -> OllamaEmbeddingAdapter:
        client = OllamaEmbeddingAdapter(RagEmbeddingConfig.model_validate({
            "provider": "ollama", "model": MODEL, "dimensions": 8,
            "baseUrl": ",".join(urls), "retryBaseSeconds": 0.01, **extra,
        }))
        self.enterContext(patch.object(client._client, "post", lab.post))
        self.enterContext(patch.object(client._client, "get", lab.get))
        return client

    def host(self, client: OllamaEmbeddingAdapter, url: str) -> OllamaHost:
        return next(host for host in client.hosts if host.url == url)

    def test_the_address_is_one_or_several_separated_by_commas(self) -> None:
        self.assertEqual(ollama_urls("http://rtx:11434/, http://builder:11434 ,http://rtx:11434"), [FAST, SLOW])
        self.assertEqual(ollama_urls("http://builder:11434"), [SLOW])
        self.assertEqual(ollama_urls(None), ["http://localhost:11434"])

    def test_one_address_is_one_request_and_no_question_about_the_model(self) -> None:
        lab = Lab(SLOW)
        vectors = self.adapter(lab, SLOW).embed_documents(texts(50))
        self.assertEqual(numbers(vectors), list(range(50)))
        self.assertEqual(lab.requests, [(SLOW, texts(50))])
        self.assertEqual(lab.asked_for_tags, [])

    def test_two_unmeasured_hosts_get_half_a_batch_each_at_the_same_time(self) -> None:
        lab = Lab(FAST, SLOW)
        # Both requests must be in flight together, or the barrier breaks.
        lab.together = threading.Barrier(2)
        vectors = self.adapter(lab, FAST, SLOW).embed_documents(texts(50))
        self.assertEqual(numbers(vectors), list(range(50)))
        self.assertEqual(lab.sent_to(FAST), [texts(50)[:25]])
        self.assertEqual(lab.sent_to(SLOW), [texts(50)[25:]])

    def test_a_batch_is_split_by_measured_speed(self) -> None:
        lab = Lab(SLOW, FAST)
        client = self.adapter(lab, SLOW, FAST)
        self.host(client, SLOW).rate, self.host(client, FAST).rate = 800.0, 6400.0
        vectors = client.embed_documents(texts(45))
        self.assertEqual(numbers(vectors), list(range(45)))
        self.assertEqual([len(part) for part in lab.sent_to(SLOW)], [5])
        self.assertEqual([len(part) for part in lab.sent_to(FAST)], [40])

    def test_a_single_text_and_a_question_go_to_the_faster_host(self) -> None:
        lab = Lab(SLOW, FAST)
        client = self.adapter(lab, SLOW, FAST)
        self.host(client, SLOW).rate, self.host(client, FAST).rate = 800.0, 6400.0
        client.embed_documents(["t1"])
        client.embed_query("t2")
        self.assertEqual(lab.sent_to(SLOW), [])
        self.assertEqual(len(lab.sent_to(FAST)), 2)

    def test_a_question_goes_to_the_first_listed_host_until_speeds_are_known(self) -> None:
        lab = Lab(FAST, SLOW)
        self.adapter(lab, FAST, SLOW).embed_query("t1")
        self.assertEqual((len(lab.sent_to(FAST)), len(lab.sent_to(SLOW))), (1, 0))

    def test_an_unmeasured_host_counts_as_an_average_one(self) -> None:
        hosts = [OllamaHost(FAST), OllamaHost(SLOW), OllamaHost(THIRD)]
        hosts[0].rate, hosts[1].rate = 8.0, 1.0
        self.assertEqual([end - start for _, start, end in share_out(27, hosts)], [16, 2, 9])

    def test_only_a_request_with_enough_text_measures_a_host(self) -> None:
        host = OllamaHost(FAST)
        host.measured(60, 0.2)
        self.assertIsNone(host.rate)
        host.measured(10_000, 2.0)
        self.assertEqual(host.rate, 5000.0)
        host.measured(10_000, 1.0)
        self.assertAlmostEqual(host.rate, 0.7 * 5000 + 0.3 * 10_000)

    def test_a_host_that_refuses_the_connection_is_stepped_over(self) -> None:
        lab = Lab(FAST, SLOW)
        client = self.adapter(lab, FAST, SLOW)
        client.embed_documents(texts(4))
        lab.down.add(FAST)
        lab.requests.clear()
        lab.asked_for_tags.clear()

        vectors = client.embed_documents(texts(10))  # no error for the caller
        self.assertEqual(numbers(vectors), list(range(10)))
        self.assertEqual(lab.sent_to(SLOW), [texts(10)[5:], texts(10)[:5]])
        self.assertGreater(self.host(client, FAST).away_until, time.monotonic())

        # Left alone while its pause lasts, even by a new adapter (the API makes one per question).
        lab.down.clear()
        another = self.adapter(lab, FAST, SLOW)
        another.embed_documents(texts(10))
        another.embed_query("t1")
        self.assertEqual(lab.sent_to(FAST), [])
        self.assertEqual(lab.asked_for_tags, [])

        # Used again once the pause is over.
        self.host(client, FAST).away_until = 0.0
        another.embed_documents(texts(10))
        self.assertEqual(lab.sent_to(FAST), [texts(10)[:5]])
        printed = self.printed.getvalue()
        self.assertEqual(printed.count(f"Ollama at {FAST} is away (ConnectError)"), 1)
        self.assertEqual(printed.count(f"Ollama at {FAST} is back"), 1)

    def test_a_host_that_answers_with_a_server_error_hands_its_texts_over(self) -> None:
        lab = Lab(FAST, SLOW)
        lab.failing.add(FAST)
        vectors = self.adapter(lab, FAST, SLOW).embed_documents(texts(10))
        self.assertEqual(numbers(vectors), list(range(10)))

    def test_a_server_error_of_the_only_host_is_reported_at_once(self) -> None:
        lab = Lab(SLOW)
        lab.failing.add(SLOW)
        with self.assertRaisesRegex(RuntimeError, "HTTP 500: .*more system memory"):
            self.adapter(lab, SLOW).embed_documents(texts(3))
        self.assertEqual(len(lab.requests), 1)

    def test_when_no_host_answers_the_call_backs_off_and_then_names_the_hosts(self) -> None:
        lab = Lab(FAST, SLOW)
        lab.down.update({FAST, SLOW})
        client = self.adapter(lab, FAST, SLOW, maxRetries=3)
        unreachable = self.assertRaisesRegex(RuntimeError, f"Ollama at {FAST}, {SLOW} is not reachable: ConnectError")
        with patch("aifactory_rag.embeddings.time.sleep") as sleep, unreachable:
            client.embed_documents(texts(4))
        self.assertEqual([call.args[0] for call in sleep.call_args_list], [0.01, 0.02, 0.04])

    def test_the_hosts_are_tried_again_on_every_backoff_step(self) -> None:
        lab = Lab(FAST, SLOW)
        lab.down.update({FAST, SLOW})
        client = self.adapter(lab, FAST, SLOW)
        with patch("aifactory_rag.embeddings.time.sleep", side_effect=lambda _: lab.down.discard(SLOW)):
            vectors = client.embed_documents(texts(4))
        self.assertEqual(numbers(vectors), list(range(4)))
        self.assertEqual(lab.sent_to(SLOW), [texts(4)])

    def test_a_host_with_another_model_digest_gets_no_text(self) -> None:
        lab = Lab(FAST, SLOW)
        lab.digests[SLOW] = OTHER_DIGEST
        client = self.adapter(lab, FAST, SLOW)
        vectors = client.embed_documents(texts(10))
        client.embed_documents(texts(10))
        self.assertEqual(numbers(vectors), list(range(10)))
        self.assertEqual(lab.sent_to(SLOW), [])
        self.assertEqual(lab.sent_to(FAST), [texts(10), texts(10)])
        refusal = f"Ollama at {SLOW} refused: it has {MODEL} {OTHER_DIGEST[:12]}, {FAST} has {DIGEST[:12]}"
        self.assertEqual(self.printed.getvalue().count(refusal), 1)

    def test_a_host_without_the_model_gets_no_text(self) -> None:
        lab = Lab(FAST, SLOW)
        lab.digests[SLOW] = None
        self.adapter(lab, FAST, SLOW).embed_documents(texts(10))
        self.assertEqual(lab.sent_to(SLOW), [])
        self.assertIn(f"Ollama at {SLOW} refused: it does not have {MODEL}, {FAST} has {DIGEST[:12]}", self.printed.getvalue())

    def test_the_digest_stays_when_the_host_that_set_it_goes_away(self) -> None:
        lab = Lab(FAST, SLOW)
        lab.digests[SLOW] = OTHER_DIGEST
        client = self.adapter(lab, FAST, SLOW, maxRetries=0)
        client.embed_documents(texts(4))
        lab.down.add(FAST)
        self.host(client, SLOW).away_until = 0.0
        with self.assertRaisesRegex(RuntimeError, "is not reachable"):
            client.embed_documents(texts(4))
        self.assertEqual(lab.sent_to(SLOW), [])

    def test_a_host_is_asked_for_its_model_again_after_it_was_away(self) -> None:
        lab = Lab(FAST, SLOW)
        client = self.adapter(lab, FAST, SLOW)
        client.embed_documents(texts(4))
        lab.down.add(SLOW)
        client.embed_documents(texts(4))
        lab.down.clear()
        lab.digests[SLOW] = OTHER_DIGEST  # it came back with another model
        self.host(client, SLOW).away_until = 0.0
        lab.requests.clear()
        client.embed_documents(texts(4))
        self.assertEqual(lab.sent_to(SLOW), [])

    def test_a_switched_off_host_costs_a_question_five_seconds_at_most(self) -> None:
        client = self.adapter(Lab(FAST, SLOW), FAST, SLOW, timeoutSeconds=900)
        self.assertEqual(client._client.timeout.connect, 5.0)
        self.assertEqual(client._client.timeout.read, 900)


if __name__ == "__main__":
    unittest.main()
