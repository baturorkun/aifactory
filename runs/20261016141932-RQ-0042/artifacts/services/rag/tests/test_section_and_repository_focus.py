"""A RAG answer gets the section and the repository the question is about (RQ-0042)."""

from __future__ import annotations

import unittest
from unittest.mock import patch

from aifactory_rag.config import RagConfig
from aifactory_rag.query import responder
from aifactory_rag.query.retriever import RetrievedChunk, repositories_named, retrieve

REPOSITORIES = ["hardware-twin/bfi-sumilator", "aselsan/bfi-sw", "ha-paty/arinc661-studio", "kavci/bytecraft-dev-environment"]
QUESTION = "bfi-simulator kodunda arinc 429 ip davranislari nasil"


def config(top_k: int = 6, section_parts: int = 2) -> RagConfig:
    return RagConfig.model_validate({
        "database": {"connectionString": "postgresql://test"},
        "embedding": {"provider": "ollama", "model": "fake", "dimensions": 3},
        "retrieval": {"topK": top_k, "sectionParts": section_parts},
    })


def hit(chunk_id: int, path: str = "doc.md", score: float = 0.5, document_id: int = 1, **metadata: object) -> RetrievedChunk:
    return RetrievedChunk(chunk_id=chunk_id, document_id=document_id, source_id="s", relative_path=path,
                          text=f"chunk {chunk_id}", score=score, metadata=dict(metadata))


class Cursor:
    """Answers each statement from `answers`, a list of (marker, rows) tried in order."""

    def __init__(self, answers: list[tuple[str, list[dict[str, object]]]]) -> None:
        self.answers = answers
        self.executed: list[tuple[str, tuple[object, ...]]] = []

    def __enter__(self) -> "Cursor":
        return self

    def __exit__(self, *_: object) -> None:
        return None

    def execute(self, statement: str, params: tuple[object, ...] = ()) -> None:
        self.executed.append((statement, params))

    def fetchall(self) -> list[dict[str, object]]:
        statement = self.executed[-1][0]
        for marker, rows in self.answers:
            if marker in statement:
                return rows
        return []


class Connection:
    def __init__(self, cursor: Cursor) -> None:
        self._cursor = cursor

    def __enter__(self) -> "Connection":
        return self

    def __exit__(self, *_: object) -> None:
        return None

    def cursor(self) -> Cursor:
        return self._cursor


class NameTests(unittest.TestCase):
    def test_a_misspelt_long_name_names_its_repository(self) -> None:
        self.assertEqual(repositories_named(QUESTION, REPOSITORIES), ["hardware-twin/bfi-sumilator"])

    def test_a_short_name_must_be_exact(self) -> None:
        self.assertEqual(repositories_named("bfi-sw'de label filtresi", REPOSITORIES), ["aselsan/bfi-sw"])
        self.assertEqual(repositories_named("bfi-sx ne yapiyor", REPOSITORIES), [])

    def test_a_question_without_a_name_names_none(self) -> None:
        self.assertEqual(repositories_named("arinc 429 ip davranislari nasil", REPOSITORIES), [])


class RetrieveFilterTests(unittest.TestCase):
    def test_repositories_keep_the_search_to_their_chunks_and_limit_is_its_top_k(self) -> None:
        cursor = Cursor([])

        class Embedder:
            def embed_query(self, _question: str) -> list[float]:
                return [1.0, 2.0, 3.0]

        with (
            patch("aifactory_rag.query.retriever.require_schema"),
            patch("aifactory_rag.query.retriever.create_embedding_adapter", return_value=Embedder()),
            patch("aifactory_rag.query.retriever.connect", return_value=Connection(cursor)),
        ):
            retrieve(config(top_k=12), QUESTION, repositories=["hardware-twin/bfi-sumilator"], limit=6)
        statement, params = cursor.executed[-1]
        self.assertIn("c.metadata->>'repository' = ANY(%s)", statement)
        self.assertIn(["hardware-twin/bfi-sumilator"], params)
        self.assertEqual(params[-1], 6)


class FocusTests(unittest.TestCase):
    def focus(self, question: str, general: list[RetrievedChunk], scoped: list[RetrievedChunk], top_k: int = 6):
        cursor = Cursor([("DISTINCT metadata->>'repository'", [{"repository": name} for name in REPOSITORIES])])
        calls: list[dict[str, object]] = []

        def fake_retrieve(_config, _question, **options):
            calls.append(options)
            return scoped

        with (
            patch.object(responder, "connect", return_value=Connection(cursor)),
            patch.object(responder, "retrieve", side_effect=fake_retrieve),
        ):
            return responder._focus_repositories(config(top_k=top_k), question, general, None, None, None), calls

    def test_the_named_repository_takes_up_to_half_of_top_k_after_what_was_named_by_identifier(self) -> None:
        general = [hit(1, foundBy="identifier"), hit(2, "prototype/main.c", 0.7), hit(3, "prototype/a.c", 0.6), hit(4), hit(5), hit(6)]
        scoped = [hit(10, "peripherals/A429Lite.cs", 0.4, document_id=9), hit(3, "prototype/a.c", 0.6), hit(11, "docs/twin-developer-guide.md", 0.3)]

        (chunks, named), calls = self.focus(QUESTION, general, scoped)

        self.assertEqual(named, ["hardware-twin/bfi-sumilator"])
        self.assertEqual(calls[0]["repositories"], ["hardware-twin/bfi-sumilator"])
        self.assertEqual(calls[0]["limit"], 3)
        self.assertEqual([c.chunk_id for c in chunks], [1, 10, 3, 11, 2, 4])
        self.assertEqual(chunks[1].metadata["foundBy"], "repository")
        self.assertEqual(len({c.chunk_id for c in chunks}), len(chunks))

    def test_a_question_that_names_no_repository_is_answered_as_before(self) -> None:
        general = [hit(1), hit(2)]
        (chunks, named), calls = self.focus("arinc 429 ip davranislari nasil", general, [hit(9)])
        self.assertEqual((chunks, named), (general, []))
        self.assertEqual(calls, [])


def part_row(chunk_id: int, part: int, section: str = "Guide > Ports > ARINC 429 in: UDP 5429") -> dict[str, object]:
    return {"chunk_id": chunk_id, "document_id": 1, "source_id": "s", "relative_path": "docs/twin-developer-guide.md",
            "text": f"part {part}", "metadata": {"section": section, "part": part, "parts": 3}}


class SectionTests(unittest.TestCase):
    def expand(self, chunks: list[RetrievedChunk], rows: list[dict[str, object]], top_k: int = 6, section_parts: int = 2):
        cursor = Cursor([("c.metadata->>'section' = %s", rows)])
        with patch.object(responder, "connect", return_value=Connection(cursor)):
            return responder._expand_sections(config(top_k=top_k, section_parts=section_parts), chunks), cursor

    def test_a_part_brings_the_section_s_other_parts_right_after_it(self) -> None:
        section = "Guide > Ports > ARINC 429 in: UDP 5429"
        heading_part = hit(8, "docs/twin-developer-guide.md", 0.8, section=section, part=1, parts=3)
        chunks = [heading_part, hit(20), hit(21), hit(22), hit(23), hit(24)]
        rows = [part_row(8, 1), part_row(9, 2), part_row(10, 3)]

        expanded, cursor = self.expand(chunks, rows)

        self.assertEqual([c.chunk_id for c in expanded], [8, 9, 10, 20, 21, 22])
        self.assertEqual(expanded[1].metadata["foundBy"], "section")
        statement, params = cursor.executed[0]
        self.assertEqual(params, (1, section, 1, 3))

    def test_a_part_already_retrieved_is_not_added_twice_and_the_limit_holds(self) -> None:
        section = "Guide > Ports > ARINC 429 in: UDP 5429"
        chunks = [hit(9, section=section, part=2, parts=3), hit(8, section=section, part=1, parts=3)]
        expanded, _ = self.expand(chunks, [part_row(9, 2), part_row(8, 1), part_row(10, 3)], section_parts=1)
        self.assertEqual([c.chunk_id for c in expanded], [9, 10, 8])

    def test_all_hits_together_bring_at_most_a_quarter_of_top_k(self) -> None:
        chunks = [hit(i, section=f"S{i}", part=1, parts=3) for i in range(1, 9)]
        rows = [part_row(100 + n, 2, "x") for n in range(3)]
        expanded, _ = self.expand(chunks, rows, top_k=12)
        self.assertEqual(sum(c.metadata.get("foundBy") == "section" for c in expanded), 3)

    def test_a_chunk_that_is_no_part_brings_nothing_and_zero_turns_it_off(self) -> None:
        chunks = [hit(1), hit(2, section="A", part=1, parts=2)]
        unchanged, cursor = self.expand([hit(1)], [part_row(3, 2)])
        self.assertEqual([c.chunk_id for c in unchanged], [1])
        self.assertEqual(cursor.executed, [])
        off, cursor = self.expand(chunks, [part_row(3, 2, "A")], section_parts=0)
        self.assertEqual([c.chunk_id for c in off], [1, 2])
        self.assertEqual(cursor.executed, [])


def plan_config(**retrieval: object) -> RagConfig:
    return RagConfig.model_validate({
        "database": {"connectionString": "postgresql://test"},
        "embedding": {"provider": "ollama", "model": "fake", "dimensions": 3},
        "retrieval": {"topK": 12, **retrieval},
    })


class RewriteTests(unittest.TestCase):
    def test_the_question_is_also_searched_in_english_with_the_model_s_terms(self) -> None:
        reply = 'Sure: {"query": "How does the twin model the ARINC 429 IP?", "terms": ["A429", "ARINC 429", "fifo", "src", "timetag"]}'
        with patch.object(responder, "_complete", return_value=reply) as complete:
            plan = responder._search_plan(plan_config(rewriteModel="claude-haiku-5-5"), QUESTION)
        self.assertEqual(plan.queries, [QUESTION, "How does the twin model the ARINC 429 IP?"])
        self.assertEqual(plan.terms, ["a429", "fifo", "timetag"])  # a term with a space, and "src", are no path words
        self.assertEqual(complete.call_args.args[0].llm.model, "claude-haiku-5-5")

    def test_a_failed_or_disabled_rewrite_searches_the_question_alone(self) -> None:
        with patch.object(responder, "_complete", side_effect=RuntimeError("no model")):
            self.assertEqual(responder._search_plan(plan_config(), QUESTION).queries, [QUESTION])
        with patch.object(responder, "_complete") as complete:
            self.assertEqual(responder._search_plan(plan_config(rewrite=False), QUESTION).queries, [QUESTION])
        complete.assert_not_called()

    def test_the_queries_results_are_merged_by_their_best_score(self) -> None:
        answers = {
            "q1": [hit(1, foundBy="identifier"), hit(2, score=0.6), hit(3, score=0.5)],
            "q2": [hit(3, score=0.9), hit(4, score=0.7), hit(2, score=0.4)],
        }
        with patch.object(responder, "retrieve", side_effect=lambda _c, query, **_o: answers[query]):
            merged = responder._retrieve_all(plan_config(), ["q1", "q2"])
        self.assertEqual([(c.chunk_id, c.score) for c in merged], [(1, 0.5), (3, 0.9), (4, 0.7), (2, 0.6)])


class PathTests(unittest.TestCase):
    def match(self, terms: list[str], chunks: list[RetrievedChunk], rows: list[dict[str, object]], repositories: list[str]):
        cursor = Cursor([("WITH docs AS MATERIALIZED", rows)])

        class Embedder:
            def embed_query(self, _question: str) -> list[float]:
                return [1.0, 2.0, 3.0]

        plan = responder.SearchPlan(queries=[QUESTION, "english"], terms=terms)
        with (
            patch.object(responder, "connect", return_value=Connection(cursor)),
            patch.object(responder, "create_embedding_adapter", return_value=Embedder()),
        ):
            return responder._add_path_matches(plan_config(), plan, chunks, None, None, None, repositories), cursor

    def test_files_named_for_the_terms_bring_their_best_chunk_after_what_was_named(self) -> None:
        rows = [
            {"chunk_id": 50, "document_id": 5, "source_id": "s", "relative_path": "peripherals/A429Lite.cs",
             "text": "class A429Lite", "metadata": {"symbol": "A429Lite"}, "hits": 1, "score": 0.68},
            {"chunk_id": 2, "document_id": 1, "source_id": "s", "relative_path": "doc.md", "text": "x", "metadata": {}, "hits": 1, "score": 0.6},
        ]
        chunks = [hit(1, foundBy="identifier"), hit(2), hit(3)]
        merged, cursor = self.match(["a429", "fifo"], chunks, rows, ["hardware-twin/bfi-sumilator"])
        self.assertEqual([c.chunk_id for c in merged], [1, 50, 2, 3])
        self.assertEqual(merged[1].metadata["foundBy"], "path")
        statement, params = cursor.executed[0]
        self.assertIn("d.metadata->>'repository' = ANY(%(repositories)s)", statement)
        self.assertEqual((params["terms"], params["limit"]), (["a429", "fifo"], 3))

    def test_no_terms_no_search(self) -> None:
        merged, cursor = self.match([], [hit(1)], [], [])
        self.assertEqual([c.chunk_id for c in merged], [1])
        self.assertEqual(cursor.executed, [])


if __name__ == "__main__":
    unittest.main()
