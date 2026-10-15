"""A PDF page's pictures are judged by their size before they are decoded.

pypdf's page.images decoded every picture, inline ones included, and spent 48 s a
page on a 2054-page Vivado guide whose pictures were all icons.
"""

from __future__ import annotations

import io
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from PIL import Image
from pypdf import PdfReader, PdfWriter

from aifactory_rag.ingest.parsers import _pdf_page_blobs, parse_file


def picture_pdf(*sizes: int) -> PdfReader:
    """One page per size, each holding a noisy (incompressible) square picture."""
    writer = PdfWriter()
    for size in sizes:
        data = io.BytesIO()
        Image.frombytes("RGB", (size, size), os.urandom(size * size * 3)).save(data, format="PDF")
        data.seek(0)
        writer.append(PdfReader(data))
    out = io.BytesIO()
    writer.write(out)
    out.seek(0)
    return PdfReader(out)


class PdfPictureTests(unittest.TestCase):
    def test_a_picture_large_enough_is_given_as_png(self) -> None:
        [blob] = _pdf_page_blobs(picture_pdf(200).pages[0])
        self.assertTrue(blob.startswith(b"\x89PNG"))
        self.assertEqual(Image.open(io.BytesIO(blob)).size, (200, 200))

    def test_an_icon_is_left_out_without_being_decoded(self) -> None:
        page = picture_pdf(40).pages[0]
        with patch("pypdf.generic.EncodedStreamObject.decode_as_image", side_effect=AssertionError("decoded")):
            self.assertEqual(_pdf_page_blobs(page), [])

    def test_the_page_images_list_is_not_used(self) -> None:
        page = picture_pdf(200).pages[0]
        with patch.object(type(page), "images", property(lambda _: (_ for _ in ()).throw(AssertionError("page.images")))):
            self.assertEqual(len(_pdf_page_blobs(page)), 1)

    def test_a_picture_used_on_many_pages_is_decoded_once(self) -> None:
        reader = picture_pdf(200)
        writer = PdfWriter()
        writer.add_page(reader.pages[0])
        writer.add_page(reader.pages[0])  # the same picture object on two pages
        out = io.BytesIO()
        writer.write(out)
        out.seek(0)
        twice = PdfReader(out)
        seen: set[tuple[int, int]] = set()

        self.assertEqual(len(_pdf_page_blobs(twice.pages[0], seen)), 1)
        self.assertEqual(_pdf_page_blobs(twice.pages[1], seen), [])

    def test_the_text_of_a_picture_reaches_the_page(self) -> None:
        reader = picture_pdf(200, 30)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "guide.pdf"
            writer = PdfWriter(clone_from=reader)
            writer.write(path)
            with (
                patch("aifactory_rag.ingest.parsers._ocr_engine", return_value=object()),
                patch("aifactory_rag.ingest.parsers.ocr_text", return_value="Timing summary WNS 0.123") as ocr,
            ):
                text = parse_file(path)

        self.assertEqual(text, "[page 1]\n(image) Timing summary WNS 0.123")
        self.assertEqual(ocr.call_count, 1, "the icon on page 2 is not read")


if __name__ == "__main__":
    unittest.main()
