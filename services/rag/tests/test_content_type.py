"""What a file is, decided by its name rather than by where it sits.

The directory rule this replaces ("code/" or "documentation/" as the first
segment) forced every corpus into two folders. A repository cloned from GitHub
does not come that way, and reshaping it by hand both costs work and mislabels:
a README under src/ is documentation, a build script under docs/ is not.
"""

from __future__ import annotations

import unittest

from aifactory_rag.ingest.pipeline import _content_type_metadata as classify


class ContentTypeTests(unittest.TestCase):
    def test_prose_and_documents_are_documentation(self) -> None:
        for path in (
            "docs/guide.md",
            "README.md",
            "papers/Speiser-2024.pdf",
            "1. RECEIVED/BFI_EDS.docx",
            "CHANGELOG.rst",
            "notes.txt",
            "slides/overview.pptx",
            "images/schematic.png",
        ):
            self.assertEqual(classify(path), {"contentType": "documentation"}, path)

    def test_sources_scripts_and_configuration_are_code(self) -> None:
        for path in (
            "src/Emulator/Peripherals/UART/NS16550.cs",
            "platforms/board.repl",
            "scripts/run-probe.resc",
            "dml/smartfusion2-mddr/device.dml",
            "tools/build.sh",
            "Makefile",
            "Dockerfile",
            "package.json",
            "config/settings.yaml",
        ):
            self.assertEqual(classify(path), {"contentType": "code"}, path)

    def test_the_directory_no_longer_decides(self) -> None:
        """The same file name is classified the same wherever it lives."""
        self.assertEqual(classify("documentation/live.py"), {"contentType": "code"})
        self.assertEqual(classify("code/renode/README.md"), {"contentType": "documentation"})
        self.assertEqual(classify("a/b/c/deep/guide.md"), classify("guide.md"))

    def test_an_unknown_kind_stays_unlabelled(self) -> None:
        """Unlabelled chunks survive every content-type filter, so a file type
        nobody has classified yet is never silently dropped from a retrieval."""
        self.assertEqual(classify("firmware/image.bin"), {})
        self.assertEqual(classify("archive.tar.gz"), {})
        self.assertEqual(classify("no-extension-at-all"), {})


if __name__ == "__main__":
    unittest.main()
