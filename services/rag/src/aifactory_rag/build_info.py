"""What code this service runs and since when.

A deployment copies files into place and restarts the service; neither step
is visible from outside. So the running process reports:

- version: from the requirements the deployed tree holds: `0.<N>.0` for the
  highest completed requirement RQ-<N>, `0.<M>.0-dev` when a newer one that is
  submitted but not yet merged is deployed from its branch. Drafts and
  cancelled requirements do not count. Without a requirements directory, the
  version in pyproject.toml.
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
# services/rag/src/aifactory_rag -> the aifactory checkout (or its rsync copy)
REQUIREMENTS_DIR = PACKAGE_DIR.parents[3] / "requirements"
_RQ_FILE = re.compile(r"^RQ-(\d{4,})-.*\.md$")
_STATUS = re.compile(r"^status:\s*([A-Za-z_-]+)", re.M)


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


def requirement_version(requirements: Path = REQUIREMENTS_DIR) -> tuple[str, str] | None:
    """(version, requirement) from the requirement files, or None without any."""
    if not requirements.is_dir():
        return None
    completed = pending = 0
    for path in requirements.glob("RQ-*.md"):
        match = _RQ_FILE.match(path.name)
        if not match:
            continue
        number = int(match.group(1))
        status = _STATUS.search(path.read_text(encoding="utf-8", errors="replace")[:2000])
        state = status.group(1).lower() if status else ""
        if state == "completed":
            completed = max(completed, number)
        elif state and state not in {"draft", "cancelled"}:
            pending = max(pending, number)
    if pending > completed:
        return f"0.{pending}.0-dev", f"RQ-{pending:04d}"
    if completed:
        return f"0.{completed}.0", f"RQ-{completed:04d}"
    return None


def current_version(requirements: Path = REQUIREMENTS_DIR, pyproject: Path = PYPROJECT) -> tuple[str, str | None]:
    found = requirement_version(requirements)
    return found if found else (package_version(pyproject), None)


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
    requirement: str | None = None

    def restart_pending(self) -> bool:
        # One second of slack: some filesystems round mtimes.
        return latest_mtime(list(self.files)) > self.updated_at + 1.0

    def as_dict(self) -> dict[str, object]:
        return {
            "version": self.version,
            "requirement": self.requirement,
            "build": self.build,
            "updatedAt": _iso(self.updated_at),
            "startedAt": _iso(self.started_at),
            "restartPending": self.restart_pending(),
        }


def capture(
    package_dir: Path = PACKAGE_DIR,
    pyproject: Path = PYPROJECT,
    started_at: float | None = None,
    requirements: Path = REQUIREMENTS_DIR,
) -> BuildInfo:
    files = code_files(package_dir, pyproject)
    root = package_dir.parent
    version, requirement = current_version(requirements, pyproject)
    return BuildInfo(
        version=version,
        requirement=requirement,
        build=fingerprint(files, root),
        updated_at=latest_mtime(files),
        started_at=datetime.now(tz=timezone.utc).timestamp() if started_at is None else started_at,
        files=tuple(files),
    )
