from __future__ import annotations

from dataclasses import dataclass
from fnmatch import fnmatchcase
from pathlib import Path

from aifactory_rag.config import RagSourceConfig


@dataclass(frozen=True)
class SourceFile:
    path: Path
    relative_path: str
    size: int
    modified_timestamp: float


def normalize_subdir(source: RagSourceConfig, subdir: str | None) -> str | None:
    root = Path(source.root_path).expanduser().resolve()
    if not root.exists():
        raise FileNotFoundError(f"RAG source root does not exist: {root}")
    if not root.is_dir():
        raise NotADirectoryError(f"RAG source root is not a directory: {root}")
    if subdir is None or not subdir.strip() or subdir.strip() == ".":
        return None

    requested = Path(subdir.strip())
    if requested.is_absolute():
        raise ValueError("RAG ingest subdirectory must be relative to the configured source root")
    resolved = (root / requested).resolve()
    try:
        relative = resolved.relative_to(root)
    except ValueError as exc:
        raise ValueError("RAG ingest subdirectory resolves outside the configured source root") from exc
    if not resolved.exists():
        raise FileNotFoundError(f"RAG ingest subdirectory does not exist: {resolved}")
    if not resolved.is_dir():
        raise NotADirectoryError(f"RAG ingest subdirectory is not a directory: {resolved}")
    return relative.as_posix()


def scan_files(source: RagSourceConfig, subdir: str | None = None) -> list[SourceFile]:
    root = Path(source.root_path).expanduser().resolve()
    normalized_subdir = normalize_subdir(source, subdir)
    scan_root = root / normalized_subdir if normalized_subdir else root

    files: list[SourceFile] = []
    for path in scan_root.rglob("*"):
        if not path.is_file():
            continue
        relative = path.relative_to(root).as_posix()
        if not _included(relative, source.include):
            continue
        if _excluded(relative, source.exclude):
            continue
        stat = path.stat()
        files.append(
            SourceFile(
                path=path,
                relative_path=relative,
                size=stat.st_size,
                modified_timestamp=stat.st_mtime,
            )
        )
    return sorted(files, key=lambda item: item.relative_path)


def _included(relative_path: str, patterns: list[str]) -> bool:
    if not patterns:
        return True
    return any(_matches(relative_path, pattern) for pattern in patterns)


def _excluded(relative_path: str, patterns: list[str]) -> bool:
    return any(_matches(relative_path, pattern) for pattern in patterns)


def _matches(relative_path: str, pattern: str) -> bool:
    path = relative_path.lower()
    normalized_pattern = pattern.lower()
    if fnmatchcase(path, normalized_pattern):
        return True
    if normalized_pattern.startswith("**/") and fnmatchcase(path, normalized_pattern[3:]):
        return True
    return Path(path).match(normalized_pattern)
