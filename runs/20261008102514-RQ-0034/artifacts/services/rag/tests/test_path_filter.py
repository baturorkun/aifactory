"""Paths a question leaves out (RQ-0034).

Grounding RQ-0110 of arinc661-studio returned RQ-0110's own markdown as all
12 sources: the repository holds `requirements/` and the requirement text is
the question.
"""

from __future__ import annotations

import re
import unittest
from unittest.mock import patch

from aifactory_rag.query.path_filter import excluded, exclusion_regexes, glob_to_regex
from aifactory_rag.query.retriever import RetrievedChunk
from tests.test_source_filter import FakeConnection, FakeCursor, FakeEmbeddingAdapter, config


class GlobTests(unittest.TestCase):
    def test_double_star_spans_directories_and_single_star_does_not(self) -> None:
        requirements = re.compile(glob_to_regex("requirements/**"))
        self.assertTrue(requirements.search("requirements/RQ-0110-project-tabs.md"))
        self.assertTrue(requirements.search("requirements/archive/RQ-0001.md"))
        self.assertFalse(requirements.search("docs/requirements/RQ-0001.md"))
        self.assertFalse(requirements.search("requirements.md"))

        anywhere = re.compile(glob_to_regex("**/handoffs/**"))
        self.assertTrue(anywhere.search("handoffs/20261006-RQ-0110/handoff.md"))
        self.assertTrue(anywhere.search("projects/a/handoffs/x/handoff.md"))

        top = re.compile(glob_to_regex("docs/*.md"))
        self.assertTrue(top.search("docs/font-table-xml.md"))
        self.assertFalse(top.search("docs/product/notes.md"))
        self.assertTrue(re.search(glob_to_regex("RQ-00??.md"), "RQ-0044.md"))

    def test_special_characters_are_literal_and_dot_slash_is_dropped(self) -> None:
        self.assertEqual(glob_to_regex("./runs/**"), glob_to_regex("runs/**"))
        self.assertFalse(re.search(glob_to_regex("ARINC661P1-8.pdf"), "ARINC661P1-8Xpdf"))
        self.assertTrue(excluded("references/arinc-661/ARINC661P1-8..pdf", exclusion_regexes(["references/**"])))
        self.assertFalse(excluded("ARINC 661/ARINC661P1-8.pdf", exclusion_regexes(["requirements/**", ""])))


def chunk(path: str) -> RetrievedChunk:
    return RetrievedChunk(chunk_id=1, document_id=1, source_id="arinc", relative_path=path, text="t", score=0.5, metadata={})


class RetrievalTests(unittest.TestCase):
    def run_retrieve(self, **kwargs: object) -> FakeCursor:
        from aifactory_rag.query.retriever import retrieve

        cursor = FakeCursor()
        with (
            patch("aifactory_rag.query.retriever.require_schema"),
            patch("aifactory_rag.query.retriever.create_embedding_adapter", return_value=FakeEmbeddingAdapter()),
            patch("aifactory_rag.query.retriever.connect", return_value=FakeConnection(cursor)),
        ):
            retrieve(config(), "question", **kwargs)
        return cursor

    def test_excluded_paths_become_a_regex_clause_after_the_other_filters(self) -> None:
        cursor = self.run_retrieve(source_ids=["arinc"], exclude_content_types=["code"], exclude_paths=["requirements/**"])
        self.assertIn("AND NOT (d.relative_path ~ ANY(%s))", cursor.statement)
        # vector, width, sources, content types, paths, vector, limit
        self.assertEqual(cursor.params[2:5], (["arinc"], ["code"], [glob_to_regex("requirements/**")]))

    def test_without_excluded_paths_nothing_changes(self) -> None:
        cursor = self.run_retrieve(source_ids=["arinc"])
        self.assertNotIn("relative_path ~", cursor.statement)

    def test_graph_expansion_does_not_bring_an_excluded_file_back(self) -> None:
        from aifactory_rag.query import responder

        neighbors = [chunk("requirements/RQ-0110.md"), chunk("src/editor/tabs.ts")]
        with patch("aifactory_rag.query.responder.connect"), patch("aifactory_rag.query.responder.graph.neighbor_chunks", return_value=neighbors):
            result = responder._expand_with_graph(config(), [chunk("ARINC 661/ARINC661P1-8.pdf")] * 3, ["requirements/**"])
        self.assertEqual([c.relative_path for c in result][-1], "src/editor/tabs.ts")
        self.assertNotIn("requirements/RQ-0110.md", [c.relative_path for c in result])


if __name__ == "__main__":
    unittest.main()
