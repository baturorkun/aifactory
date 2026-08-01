from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from aifactory_rag.api import resolve_source_file
from aifactory_rag.config import RagSourceConfig


class DocumentDownloadTests(unittest.TestCase):
    def source(self, root: Path) -> RagSourceConfig:
        return RagSourceConfig.model_validate({"id": "docs", "rootPath": str(root)})

    def test_resolves_a_document_inside_the_source(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            document = root / "manuals" / "guide.pdf"
            document.parent.mkdir()
            document.write_bytes(b"pdf")

            self.assertEqual(
                resolve_source_file(self.source(root), "manuals/guide.pdf"),
                document.resolve(),
            )

    def test_rejects_absolute_and_traversal_paths(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = self.source(root)

            with self.assertRaisesRegex(ValueError, "must be relative"):
                resolve_source_file(source, "/etc/passwd")
            with self.assertRaisesRegex(ValueError, "outside"):
                resolve_source_file(source, "../secret.pdf")

    def test_rejects_a_symlink_that_escapes_the_source(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            root = base / "source"
            root.mkdir()
            outside = base / "secret.pdf"
            outside.write_bytes(b"secret")
            (root / "linked.pdf").symlink_to(outside)

            with self.assertRaisesRegex(ValueError, "outside"):
                resolve_source_file(self.source(root), "linked.pdf")


if __name__ == "__main__":
    unittest.main()
