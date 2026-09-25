"""A deployment is visible: which code runs, when it was deployed, and whether
the process was restarted onto it."""

from __future__ import annotations

import os
import tempfile
import time
import unittest
from pathlib import Path

from aifactory_rag import build_info


def _package(root: Path) -> tuple[Path, Path]:
    package = root / "src" / "pkg"
    (package / "ingest").mkdir(parents=True)
    (package / "__init__.py").write_text("")
    (package / "ingest" / "parsers.py").write_text("READERS = ['pdf']\n")
    (package / "__pycache__").mkdir()
    (package / "__pycache__" / "x.cpython-313.pyc").write_bytes(b"ignored")
    pyproject = root / "pyproject.toml"
    pyproject.write_text('[project]\nname = "x"\nversion = "0.3.1"\n')
    return package, pyproject


class BuildInfoTests(unittest.TestCase):
    def test_the_same_code_gives_the_same_build_and_new_code_a_new_one(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            package, pyproject = _package(Path(tmp))
            first = build_info.capture(package, pyproject, started_at=time.time())
            again = build_info.capture(package, pyproject, started_at=time.time())
            self.assertEqual(first.build, again.build)
            self.assertEqual(first.version, "0.3.1")
            self.assertEqual(len(first.build), 12)

            (package / "ingest" / "parsers.py").write_text("READERS = ['pdf', 'xlsx']\n")
            updated = build_info.capture(package, pyproject, started_at=time.time())
            self.assertNotEqual(first.build, updated.build)

    def test_files_changed_after_start_mean_a_restart_is_pending(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            package, pyproject = _package(Path(tmp))
            running = build_info.capture(package, pyproject, started_at=time.time())
            self.assertFalse(running.as_dict()["restartPending"])

            # A deployment copies a newer file in while the old process runs.
            later = running.deployed_at + 60
            target = package / "ingest" / "parsers.py"
            target.write_text("READERS = ['pdf', 'xlsx']\n")
            os.utime(target, (later, later))
            info = running.as_dict()
            self.assertTrue(info["restartPending"])
            self.assertEqual(info["build"], running.build, "the reported build is the running one")

    def test_the_report_carries_dates_and_ignores_bytecode(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            package, pyproject = _package(Path(tmp))
            info = build_info.capture(package, pyproject, started_at=0.0).as_dict()
            self.assertEqual(info["startedAt"], "1970-01-01T00:00:00+00:00")
            self.assertRegex(str(info["deployedAt"]), r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+00:00$")
            files = build_info.code_files(package, pyproject)
            self.assertFalse(any("__pycache__" in f.parts for f in files))
            self.assertIn(pyproject, files)

    def test_the_real_package_reports_itself(self) -> None:
        info = build_info.capture().as_dict()
        self.assertNotEqual(info["version"], "unknown")
        self.assertFalse(info["restartPending"])


if __name__ == "__main__":
    unittest.main()
