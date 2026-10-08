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


STAMPED_PAGE = """3.6.2.2.3 RECEIVE_QUEUING_MESSAGE
The RECEIVE_QUEUING_MESSAGE service request is used to receive a message.
Copyright Aeronautical Radio Inc.
Provided by IHS under license with ARINC
Order Number: 01991696
Sold to:MIKRO BILGI KAYIT VE DAGITIM A [048289107703] - SAMI.CATAR@MIKROBILGI.CO
Not for Resale,2014-01-10 14:16:57 UTC
No reproduction or networking permitted without license from IHS
--````,,``,,`,,,,,`,,,,-`-``,```,,,`---
ARINC SPECIFICATION 653, PART 1 – Page 79
"""


class StampTest(unittest.TestCase):
    """The IHS licence stamp on every ARINC page is not content."""

    def test_the_stamp_lines_go_and_the_text_stays(self) -> None:
        from aifactory_rag.ingest.parsers import strip_page_stamps

        text = strip_page_stamps(STAMPED_PAGE)
        self.assertEqual(text.splitlines(), [
            "3.6.2.2.3 RECEIVE_QUEUING_MESSAGE",
            "The RECEIVE_QUEUING_MESSAGE service request is used to receive a message.",
            "ARINC SPECIFICATION 653, PART 1 – Page 79",
        ])
        # a line that merely mentions a resale or an order is kept
        self.assertEqual(strip_page_stamps("The LSP is not for resale in this sense.\nOrder Number: see 4.2"), "The LSP is not for resale in this sense.\nOrder Number: see 4.2")

    def test_a_page_that_is_only_a_stamp_leaves_no_page_block(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "doc.pdf"
            writer = PdfWriter()
            writer.add_blank_page(width=200, height=200)
            writer.add_blank_page(width=200, height=200)
            with path.open("wb") as handle:
                writer.write(handle)
            pages = iter(["Provided by IHS under license with ARINC\nSold to:TAI\n", STAMPED_PAGE])
            with mock.patch.object(PageObject, "extract_text", lambda self, *a, **k: next(pages)):
                text = parse_file(path)
        self.assertNotIn("[page 1]", text)
        self.assertIn("[page 2]\n3.6.2.2.3 RECEIVE_QUEUING_MESSAGE", text)
        self.assertNotIn("IHS", text)


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
