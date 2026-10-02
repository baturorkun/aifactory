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
            first = build_info.capture(package, pyproject, started_at=time.time(), requirements=package / "no-requirements")
            again = build_info.capture(package, pyproject, started_at=time.time(), requirements=package / "no-requirements")
            self.assertEqual(first.build, again.build)
            self.assertEqual(first.version, "0.3.1")
            self.assertEqual(len(first.build), 12)

            (package / "ingest" / "parsers.py").write_text("READERS = ['pdf', 'xlsx']\n")
            updated = build_info.capture(package, pyproject, started_at=time.time(), requirements=package / "no-requirements")
            self.assertNotEqual(first.build, updated.build)

    def test_files_changed_after_start_mean_a_restart_is_pending(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            package, pyproject = _package(Path(tmp))
            running = build_info.capture(package, pyproject, started_at=time.time(), requirements=package / "no-requirements")
            self.assertFalse(running.as_dict()["restartPending"])

            # A deployment copies a newer file in while the old process runs.
            later = running.updated_at + 60
            target = package / "ingest" / "parsers.py"
            target.write_text("READERS = ['pdf', 'xlsx']\n")
            os.utime(target, (later, later))
            info = running.as_dict()
            self.assertTrue(info["restartPending"])
            self.assertEqual(info["build"], running.build, "the reported build is the running one")

    def test_the_report_carries_dates_and_ignores_bytecode(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            package, pyproject = _package(Path(tmp))
            info = build_info.capture(package, pyproject, started_at=0.0, requirements=package / "no-requirements").as_dict()
            self.assertEqual(info["startedAt"], "1970-01-01T00:00:00+00:00")
            self.assertRegex(str(info["updatedAt"]), r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+00:00$")
            files = build_info.code_files(package, pyproject)
            self.assertFalse(any("__pycache__" in f.parts for f in files))
            self.assertIn(pyproject, files)

    def test_the_real_package_reports_itself(self) -> None:
        info = build_info.capture().as_dict()
        self.assertNotEqual(info["version"], "unknown")
        self.assertFalse(info["restartPending"])


if __name__ == "__main__":
    unittest.main()


class RequirementVersionTests(unittest.TestCase):
    """The version follows the requirements: 0.<N>.0 for the last merged RQ-<N>."""

    def _write(self, directory: Path, number: int, status: str) -> None:
        (directory / f"RQ-{number:04d}-something.md").write_text(f"---\nid: RQ-{number:04d}\nstatus: {status}\n---\n# x\n", encoding="utf-8")

    def test_the_highest_completed_requirement_names_the_version(self) -> None:
        from aifactory_rag.build_info import requirement_version

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for number, status in ((22, "completed"), (28, "completed"), (30, "draft"), (31, "cancelled")):
                self._write(root, number, status)
            self.assertEqual(requirement_version(root), ("0.28.0", "RQ-0028"))

            # deployed from the branch of a submitted, unmerged requirement
            self._write(root, 29, "ready")
            self.assertEqual(requirement_version(root), ("0.29.0-dev", "RQ-0029"))

            self._write(root, 29, "completed")
            self.assertEqual(requirement_version(root), ("0.29.0", "RQ-0029"))

    def test_without_requirements_the_package_version_is_used(self) -> None:
        from aifactory_rag.build_info import current_version

        with tempfile.TemporaryDirectory() as directory:
            pyproject = Path(directory) / "pyproject.toml"
            pyproject.write_text('[project]\nversion = "1.2.3"\n', encoding="utf-8")
            self.assertEqual(current_version(Path(directory) / "missing", pyproject), ("1.2.3", None))
