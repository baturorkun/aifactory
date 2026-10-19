"""A requirement asked for by its identifier is looked up, not searched for (RQ-0038)."""

from __future__ import annotations

import unittest
from pathlib import Path
from unittest.mock import patch

from aifactory_rag.config import RagConfig
from aifactory_rag.query.retriever import identifiers_in, retrieve

MODULE = "FCS/Software/FCS_SRS.doors.jsonl"


def row(chunk_id: int, identifier: str | None, score: float, index: int = 0, path: str = MODULE) -> dict[str, object]:
    metadata = {"requirement": identifier, "doorsModule": "/FCS/Software/FCS_SRS"} if identifier else {}
    return {
        "chunk_id": chunk_id, "document_id": 1, "source_id": "fcs", "relative_path": path, "text": f"chunk {chunk_id}",
        "metadata": metadata, "chunk_index": index, "identifier": identifier.lower() if identifier else None, "score": score,
        "previous_page_text": None,
    }


class Cursor:
    """Answers the lookup with `named` and the vector search with `searched`."""

    def __init__(self, named: list[dict[str, object]], searched: list[dict[str, object]]) -> None:
        self.named, self.searched = named, searched
        self.executed: list[tuple[str, tuple[object, ...]]] = []

    def __enter__(self) -> "Cursor":
        return self

    def __exit__(self, *_: object) -> None:
        return None

    def execute(self, statement: str, params: tuple[object, ...] = ()) -> None:
        self.executed.append((statement, params))

    def fetchall(self) -> list[dict[str, object]]:
        return self.named if "metadata ? 'requirement'" in self.executed[-1][0] else self.searched

    @property
    def lookups(self) -> list[tuple[str, tuple[object, ...]]]:
        return [entry for entry in self.executed if "metadata ? 'requirement'" in entry[0]]


class Connection:
    def __init__(self, cursor: Cursor) -> None:
        self._cursor = cursor

    def __enter__(self) -> "Connection":
        return self

    def __exit__(self, *_: object) -> None:
        return None

    def cursor(self) -> Cursor:
        return self._cursor


class Embedder:
    def embed_query(self, _question: str) -> list[float]:
        return [1.0, 2.0, 3.0]


def ask(question: str, named: list[dict[str, object]], searched: list[dict[str, object]], top_k: int = 4, **options: object):
    retrieval = {"topK": top_k, **({"minScore": options.pop("min_score")} if "min_score" in options else {})}
    config = RagConfig.model_validate({
        "database": {"connectionString": "postgresql://test"},
        "embedding": {"provider": "ollama", "model": "fake", "dimensions": 3},
        "retrieval": retrieval,
    })
    cursor = Cursor(named, searched)
    with (
        patch("aifactory_rag.query.retriever.require_schema"),
        patch("aifactory_rag.query.retriever.create_embedding_adapter", return_value=Embedder()),
        patch("aifactory_rag.query.retriever.connect", return_value=Connection(cursor)),
    ):
        return retrieve(config, question, **options), cursor  # type: ignore[arg-type]


SEARCHED = [row(21, "FCS-SRS-7", 0.61), row(22, None, 0.60), row(11, "FCS-SRS-1296", 0.55), row(23, None, 0.50), row(24, None, 0.40)]


class TokenTests(unittest.TestCase):
    def test_identifiers_are_words_with_two_letters_and_a_digit(self) -> None:
        self.assertEqual(
            identifiers_in("BFI-SRS-1296 ile BFI_HLR_235'i ve REQ12'yi karşılaştır; A661_TRS_3 de var."),
            ["bfi-srs-1296", "bfi_hlr_235", "req12", "a661_trs_3"],
        )

    def test_versions_section_numbers_and_plain_words_are_not_identifiers(self) -> None:
        self.assertEqual(identifiers_in("v2.3 sürümünde 3.5.1 başlığı altında 500 ms içinde ne olur?"), [])

    def test_a_standard_or_a_part_number_is_a_candidate_that_matches_nothing(self) -> None:
        self.assertEqual(identifiers_in("DO-178C ve LS1043A ne der?"), ["do-178c", "ls1043a"])

    def test_an_identifier_named_twice_is_looked_up_once_and_a_sentence_end_is_not_part_of_it(self) -> None:
        self.assertEqual(identifiers_in("BFI-SRS-1296 nedir? bfi-srs-1296."), ["bfi-srs-1296"])


class LookupTests(unittest.TestCase):
    def test_the_named_requirement_comes_first_and_the_search_fills_the_rest(self) -> None:
        chunks, cursor = ask("FCS-SRS-1296 ne diyor?", [row(11, "FCS-SRS-1296", 0.55)], SEARCHED)

        self.assertEqual([chunk.chunk_id for chunk in chunks], [11, 21, 22, 23])  # topK 4, chunk 11 once
        self.assertEqual(chunks[0].metadata["foundBy"], "identifier")
        self.assertNotIn("foundBy", chunks[1].metadata)
        self.assertEqual(len(cursor.lookups), 1)

    def test_the_lookup_ignores_letter_case(self) -> None:
        _, cursor = ask("fcs-srs-1296 ne diyor?", [row(11, "FCS-SRS-1296", 0.55)], SEARCHED)

        statement, params = cursor.lookups[0]
        self.assertIn("lower(c.metadata->>'requirement') = ANY(%s)", statement)
        self.assertEqual(params[2], ["fcs-srs-1296"])

    def test_two_identifiers_come_in_the_order_of_the_question_and_a_missing_one_changes_nothing(self) -> None:
        named = [row(11, "FCS-SRS-1296", 0.2), row(12, "FCS-SRS-40", 0.9)]
        chunks, _ = ask("FCS-SRS-40, FCS-SRS-9999 ve FCS-SRS-1296 çelişiyor mu?", named, SEARCHED)

        self.assertEqual([chunk.chunk_id for chunk in chunks], [12, 11, 21, 22])

    def test_a_requirement_of_three_parts_comes_with_its_parts_in_order(self) -> None:
        named = [row(33, "FCS-SRS-50", 0.3, index=9), row(31, "FCS-SRS-50", 0.5, index=7), row(32, "FCS-SRS-50", 0.4, index=8)]
        chunks, _ = ask("FCS-SRS-50", named, SEARCHED)

        self.assertEqual([chunk.chunk_id for chunk in chunks], [31, 32, 33, 21])

    def test_a_requirement_two_modules_hold_comes_from_both(self) -> None:
        named = [row(42, "FCS-SRS-50", 0.5, path="FCS/Software/FCS_SRS 1.doors.jsonl"), row(41, "FCS-SRS-50", 0.5)]
        chunks, _ = ask("FCS-SRS-50", named, SEARCHED)

        self.assertEqual([chunk.chunk_id for chunk in chunks[:2]], [42, 41])  # by module path

    def test_more_identifiers_than_top_k_return_the_first_top_k(self) -> None:
        named = [row(60 + n, f"FCS-SRS-{n}", 0.5) for n in range(1, 7)]
        chunks, _ = ask(" ".join(f"FCS-SRS-{n}" for n in range(1, 7)), named, SEARCHED)

        self.assertEqual([chunk.chunk_id for chunk in chunks], [61, 62, 63, 64])

    def test_the_lookup_searches_where_the_question_may_search(self) -> None:
        _, cursor = ask(
            "FCS-SRS-1296", [], SEARCHED, source_ids=["fcs"], exclude_content_types=["requirements"], exclude_paths=["drafts/**"],
        )

        statement, params = cursor.lookups[0]
        for clause in ("c.source_id = ANY(%s)", "c.metadata->>'contentType' = ANY(%s)", "d.relative_path ~ ANY(%s)", "vector_dims(c.embedding) = %s"):
            self.assertIn(clause, statement)
        self.assertEqual(params[1:5], (3, ["fcs-srs-1296"], ["fcs"], ["requirements"]))

    def test_a_named_requirement_is_not_weighed_by_the_minimum_score(self) -> None:
        chunks, _ = ask("FCS-SRS-1296 ne diyor?", [row(11, "FCS-SRS-1296", 0.05)], SEARCHED, min_score=0.95)

        self.assertEqual([chunk.chunk_id for chunk in chunks], [11])

    def test_a_question_without_an_identifier_runs_no_lookup(self) -> None:
        chunks, cursor = ask("Güç açılış testinde ne olur?", [row(11, "FCS-SRS-1296", 0.55)], SEARCHED)

        self.assertEqual(cursor.lookups, [])
        self.assertEqual(len(cursor.executed), 3)  # the two index settings and the search, as before
        self.assertEqual([chunk.chunk_id for chunk in chunks], [21, 22, 11, 23])

    def test_a_candidate_that_is_no_identifier_changes_nothing_but_one_lookup(self) -> None:
        chunks, cursor = ask("DO-178C ne der?", [], SEARCHED)

        self.assertEqual(len(cursor.lookups), 1)
        self.assertEqual([chunk.chunk_id for chunk in chunks], [21, 22, 11, 23])


class MigrationTests(unittest.TestCase):
    def test_the_index_is_the_expression_the_lookup_asks_for_and_can_be_made_twice(self) -> None:
        sql = (Path(__file__).resolve().parents[1] / "src/aifactory_rag/migrations/009_requirement_identifier.sql").read_text()
        self.assertIn("CREATE INDEX IF NOT EXISTS", sql)
        self.assertIn("(lower(metadata->>'requirement'))", sql)
        self.assertIn("WHERE status = 'active' AND metadata ? 'requirement'", sql)


if __name__ == "__main__":
    unittest.main()


class RuleIdentifierTests(unittest.TestCase):
    """A coding-standard rule id names a chunk too (RQ-0052)."""

    def test_a_rule_id_counts_and_a_version_number_does_not(self) -> None:
        from aifactory_rag.query.retriever import identifiers_in

        self.assertEqual(identifiers_in("What does rule C-045 say, and A-013?"), ["c-045", "a-013"])
        self.assertEqual(identifiers_in("since v2.3 and 3.5.1, see BFI-SRS-1296"), ["bfi-srs-1296"])
