"""What code this service runs and since when.

A deployment copies files into place and restarts the service; neither step
is visible from outside. So the running process reports:

- version: the package version from pyproject.toml
- build: a fingerprint of its own source (every .py under the package plus
  pyproject.toml). The same code always gives the same build, so two hosts,
  or a host and a commit, can be compared without a git checkout.
- updatedAt: when those files last changed. rsync.sh keeps the source
  mtimes, so this is when the code itself last changed, not the copy time
- startedAt: when this process started (diagnostic; not shown on the page)
- restartPending: the files changed after the process started, so the code
  on disk is not the code that is running

The fingerprint and updatedAt are taken once at start-up and describe the
running code; restartPending looks at the disk again on every call.
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

PACKAGE_DIR = Path(__file__).resolve().parent
PYPROJECT = PACKAGE_DIR.parent.parent / "pyproject.toml"


def code_files(package_dir: Path = PACKAGE_DIR, pyproject: Path = PYPROJECT) -> list[Path]:
    files = sorted(p for p in package_dir.rglob("*.py") if "__pycache__" not in p.parts)
    if pyproject.is_file():
        files.append(pyproject)
    return files


def fingerprint(files: list[Path], root: Path) -> str:
    digest = hashlib.sha256()
    for path in files:
        try:
            name = path.relative_to(root).as_posix()
        except ValueError:
            name = path.name
        digest.update(name.encode("utf-8") + b"\0" + path.read_bytes() + b"\0")
    return digest.hexdigest()[:12]


def latest_mtime(files: list[Path]) -> float:
    return max((path.stat().st_mtime for path in files if path.exists()), default=0.0)


def package_version(pyproject: Path = PYPROJECT) -> str:
    if pyproject.is_file():
        match = re.search(r'^version\s*=\s*"([^"]+)"', pyproject.read_text(encoding="utf-8"), re.M)
        if match:
            return match.group(1)
    return "unknown"


def _iso(timestamp: float) -> str:
    return datetime.fromtimestamp(timestamp, tz=timezone.utc).isoformat(timespec="seconds")


@dataclass(frozen=True)
class BuildInfo:
    version: str
    build: str
    updated_at: float
    started_at: float
    files: tuple[Path, ...]

    def restart_pending(self) -> bool:
        # One second of slack: some filesystems round mtimes.
        return latest_mtime(list(self.files)) > self.updated_at + 1.0

    def as_dict(self) -> dict[str, object]:
        return {
            "version": self.version,
            "build": self.build,
            "updatedAt": _iso(self.updated_at),
            "startedAt": _iso(self.started_at),
            "restartPending": self.restart_pending(),
        }


def capture(
    package_dir: Path = PACKAGE_DIR,
    pyproject: Path = PYPROJECT,
    started_at: float | None = None,
) -> BuildInfo:
    files = code_files(package_dir, pyproject)
    root = package_dir.parent
    return BuildInfo(
        version=package_version(pyproject),
        build=fingerprint(files, root),
        updated_at=latest_mtime(files),
        started_at=datetime.now(tz=timezone.utc).timestamp() if started_at is None else started_at,
        files=tuple(files),
    )
