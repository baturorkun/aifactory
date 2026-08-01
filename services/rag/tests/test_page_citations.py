from __future__ import annotations

import unittest

from aifactory_rag.query.retriever import infer_page_numbers


class PageCitationTests(unittest.TestCase):
    def test_page_marker_at_chunk_start(self) -> None:
        self.assertEqual(infer_page_numbers("[page 42]\nContent", "[page 41]\nEarlier"), (42,))

    def test_chunk_spanning_pages_includes_initial_page(self) -> None:
        self.assertEqual(
            infer_page_numbers("End of page\n[page 43]\nNext page", "[page 42]\nEarlier"),
            (42, 43),
        )

    def test_chunk_without_marker_uses_preceding_page(self) -> None:
        self.assertEqual(infer_page_numbers("Middle of page", "[page 41]\nOld\n[page 42]\nCurrent"), (42,))

    def test_duplicate_overlap_markers_are_collapsed(self) -> None:
        self.assertEqual(infer_page_numbers("Overlap\n[page 42]\nContent", "[page 42]\nEarlier"), (42,))


if __name__ == "__main__":
    unittest.main()
