"""A page whose text cannot be extracted does not drop the whole PDF.

DO-330 has a Type0 font with no /DescendantFonts on 17 of its 138 pages, and
pypdf raises KeyError on each. The parser let that escape, so the file failed
to ingest and the other 121 readable pages never reached the corpus.
"""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest import mock

from pypdf import PdfWriter
from pypdf._page import PageObject

from aifactory_rag.ingest.parsers import parse_file


class PdfParseTest(unittest.TestCase):
    def test_unextractable_page_is_skipped_not_fatal(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "doc.pdf"
            writer = PdfWriter()
            writer.add_blank_page(width=200, height=200)
            writer.add_blank_page(width=200, height=200)
            with path.open("wb") as handle:
                writer.write(handle)

            calls = iter([KeyError("/DescendantFonts"), "Section 2 text"])

            def extract(self: PageObject, *args: object, **kwargs: object) -> str:
                value = next(calls)
                if isinstance(value, Exception):
                    raise value
                return value

            with mock.patch.object(PageObject, "extract_text", extract):
                text = parse_file(path)

        self.assertEqual(text, "[page 2]\nSection 2 text")


if __name__ == "__main__":
    unittest.main()
