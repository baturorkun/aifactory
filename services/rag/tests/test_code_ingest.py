from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from aifactory_rag.config import RagSourceConfig
from aifactory_rag.ingest.parsers import parse_file
from aifactory_rag.ingest.sources import scan_files


class CodeIngestTests(unittest.TestCase):
    def test_parse_file_reads_source_code_as_utf8_text(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "service.ts"
            path.write_text("export const greeting = 'merhaba';\n", encoding="utf-8")

            self.assertEqual(parse_file(path), "export const greeting = 'merhaba';\n")

    def test_parse_file_supports_extensionless_build_files(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "Dockerfile"
            path.write_text("FROM python:3.12-slim\n", encoding="utf-8")

            self.assertEqual(parse_file(path), "FROM python:3.12-slim\n")

    def test_parse_file_supports_simics_dml_and_command_scripts(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            dml = root / "sample-device.dml"
            script = root / "launch.simics"
            dml.write_text("dml 1.4;\ndevice sample_device;\n", encoding="utf-8")
            script.write_text("run-command-file setup.simics\n", encoding="utf-8")

            self.assertIn("device sample_device", parse_file(dml))
            self.assertIn("run-command-file", parse_file(script))

    def test_default_source_scans_code_and_skips_generated_trees(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "src").mkdir()
            (root / "src" / "main.py").write_text("print('hello')\n", encoding="utf-8")
            (root / "Dockerfile").write_text("FROM scratch\n", encoding="utf-8")
            (root / "node_modules" / "pkg").mkdir(parents=True)
            (root / "node_modules" / "pkg" / "index.js").write_text("generated\n", encoding="utf-8")
            (root / "dist").mkdir()
            (root / "dist" / "bundle.js").write_text("generated\n", encoding="utf-8")
            source = RagSourceConfig.model_validate({"id": "code", "rootPath": str(root)})

            self.assertEqual(
                [file.relative_path for file in scan_files(source)],
                ["Dockerfile", "src/main.py"],
            )


if __name__ == "__main__":
    unittest.main()
