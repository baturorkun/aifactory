"""IBM DOORS modules as an input of a source (RQ-0037).

Classic DOORS has no web interface: its data comes out through a DOORS client
running a DXL script. The service reaches such a client over SSH, by default
on the DOORS server itself: it copies the scripts of `doors_client/` into a directory of its own
there, starts `doors.exe` in batch mode, once to list the modules and once to
export the selected ones, fetches the result and removes the directory. What
comes back is mirrored as `<module full name>.doors.jsonl` files, which the
pipeline ingests like the files of any other input.
"""

from __future__ import annotations

import base64
import json
import os
import shutil
import subprocess
import tempfile
import uuid
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Any, Callable

from aifactory_rag.config import RagDoorsConfig, RagSourceConfig
from aifactory_rag.ingest.doors_chunker import DOORS_SUFFIX, DoorsExportError, read_export
from aifactory_rag.ingest.sources import SourceFile, selected

CLIENT_SCRIPTS = Path(__file__).resolve().parent / "doors_client"
# The service's directory on a client, under the SSH account's home; each
# export works in a directory of its own below it.
REMOTE_ROOT = "aifactory-doors"
SSH_OPTIONS = ("-o", "BatchMode=yes", "-o", "ConnectTimeout=10", "-o", "StrictHostKeyChecking=accept-new")
# ssh and scp answer 255 when the connection itself failed.
SSH_CONNECTION_FAILED = 255
# Copying and tidying up, as opposed to a doors.exe run (rag.doors.timeoutSeconds).
TRANSFER_TIMEOUT_SECONDS = 120.0
MAX_LOG_CHARACTERS = 600

Run = Callable[..., "subprocess.CompletedProcess[str]"]


@dataclass(frozen=True)
class DoorsInput:
    entry: str  # RAG_SOURCE_3_DOORS_1
    key: str  # doors:36677@192.168.2.101, what tells this input's documents apart
    database: str
    client: str  # the SSH destination of the server itself, where its DOORS client runs
    user: str
    password_env: str
    paths: tuple[str, ...]
    exclude: tuple[str, ...]


@dataclass(frozen=True)
class DoorsTree:
    """The mirrored exports of one database."""

    root: Path
    files: list[SourceFile]
    client: str
    listed: int  # formal modules under the paths, before the excludes


class DoorsInputError(RuntimeError):
    """A DOORS entry that could not be read; its documents are left as they were."""


class _ClientAway(Exception):
    """The client could not be reached; the next one is tried."""


def doors_inputs(source: RagSourceConfig) -> list[DoorsInput]:
    return [
        DoorsInput(
            entry=entry.entry,
            key=f"doors:{entry.database}",
            database=entry.database,
            client=entry.client,
            user=entry.user,
            password_env=entry.password_env,
            paths=tuple(entry.paths),
            exclude=tuple(entry.exclude),
        )
        for entry in source.doors
    ]


def sync_doors(
    source_id: str,
    doors_input: DoorsInput,
    config: RagDoorsConfig,
    environ: dict[str, str] | None = None,
    run: Run = subprocess.run,
) -> DoorsTree:
    """Export the entry's modules through the DOORS client on its server (or
    the first of rag.doors.clients that answers) and bring the mirror in line
    with them."""
    env = os.environ if environ is None else environ
    password = (env.get(doors_input.password_env) or "").strip()
    if not password:
        raise DoorsInputError(f"{doors_input.entry}: {doors_input.password_env} is not set")
    # The client is on the DOORS server itself unless other PCs are named for it.
    clients = [client.strip() for client in config.clients.split(",") if client.strip()] or [doors_input.client]
    mirror = Path(config.mirror_dir) / _safe_name(source_id) / _safe_name(doors_input.database)
    mirror.mkdir(parents=True, exist_ok=True, mode=0o700)
    staging = Path(tempfile.mkdtemp(prefix=".staging-", dir=mirror.parent))
    try:
        away: list[str] = []
        for client in clients:
            session = _Session(client, config, run)
            try:
                listed, exports = _export(session, doors_input, password, staging)
            except _ClientAway as exc:
                away.append(f"{client}: {exc}")
                print(f"RAG DOORS client  : {client} is away ({exc})", flush=True)
                continue
            except DoorsInputError as exc:
                raise DoorsInputError(f"{doors_input.entry} on {client}: {exc}") from exc
            finally:
                session.close()
            return DoorsTree(root=mirror, files=_mirror(mirror, exports), client=client, listed=listed)
        raise DoorsInputError(f"{doors_input.entry}: no DOORS client answered ({'; '.join(away)})")
    finally:
        shutil.rmtree(staging, ignore_errors=True)


def _export(session: "_Session", doors_input: DoorsInput, password: str, staging: Path) -> tuple[int, list[tuple[str, Path]]]:
    """(modules listed, [(full name, exported file)]) from one client."""
    job = {"database": doors_input.database, "user": doors_input.user, "password": password}
    session.open()
    session.put("paths.txt", "".join(f"{path}\n" for path in doors_input.paths))
    session.run("list", job)
    listing = session.fetch("out/modules.txt", staging)
    modules: list[str] = []
    for line in listing.read_text(encoding="utf-8-sig").splitlines():
        mark, _, name = line.partition("\t")
        if mark == "E":
            raise DoorsInputError(f"the database has no {name} ({doors_input.entry}_PATHS)")
        if mark == "M" and name and name not in modules:
            modules.append(name)
    wanted = [name for name in modules if selected(name.lstrip("/"), [], list(doors_input.exclude))]
    print(f"RAG DOORS modules : {len(modules)} under {', '.join(doors_input.paths)}, {len(wanted)} selected", flush=True)
    if not wanted:
        return len(modules), []

    session.put("selected.txt", "".join(f"{name}\n" for name in wanted))
    session.run("export", job)
    out = session.fetch("out", staging)
    reported: dict[int, tuple[int, str]] = {}
    for line in (out / "export.txt").read_text(encoding="utf-8-sig").splitlines():
        number, _, rest = line.partition("\t")
        count, _, name = rest.partition("\t")
        if number.strip().isdigit():
            reported[int(number)] = (int(count), name)
    exports: list[tuple[str, Path]] = []
    for number, name in enumerate(wanted, start=1):
        count, reported_name = reported.get(number, (-1, name))
        if count < 0:
            raise DoorsInputError(f"module {name} could not be opened")
        path = out / f"m{number}.jsonl"
        try:
            export = read_export(path.read_text(encoding="utf-8", errors="replace"))
        except (OSError, DoorsExportError) as exc:
            raise DoorsInputError(f"the export of {name} is not usable: {exc}") from exc
        if reported_name != name or export.path != name or len(export.objects) != count:
            raise DoorsInputError(
                f"the export of {name} is incomplete: {len(export.objects)} objects of {export.path} fetched, "
                f"{count} of {reported_name} written"
            )
        exports.append((name, path))
    return len(modules), exports


def _mirror(mirror: Path, exports: list[tuple[str, Path]]) -> list[SourceFile]:
    """Write what changed, remove what is gone, and list what is there.

    An unchanged export keeps its file, modification time included, so the
    pipeline skips it without hashing it.
    """
    kept: set[Path] = set()
    files: list[SourceFile] = []
    for name, exported in exports:
        parts = [part for part in name.split("/") if part]
        if not parts or any(part in {".", ".."} or "\x00" in part for part in parts):
            raise DoorsInputError(f"module name {name!r} cannot be a file path")
        relative = PurePosixPath(*parts[:-1], parts[-1] + DOORS_SUFFIX)
        target = mirror / relative
        content = exported.read_bytes()
        if not target.is_file() or target.read_bytes() != content:
            target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            partial = target.with_name(target.name + ".part")
            partial.write_bytes(content)
            partial.chmod(0o600)
            partial.replace(target)
        kept.add(target)
        stat = target.stat()
        files.append(SourceFile(path=target, relative_path=relative.as_posix(), size=stat.st_size, modified_timestamp=stat.st_mtime))
    for path in sorted(mirror.rglob("*"), reverse=True):
        if path.is_file() and path not in kept:
            path.unlink()
        elif path.is_dir() and not any(path.iterdir()):
            path.rmdir()
    return sorted(files, key=lambda file: file.relative_path)


def _safe_name(value: str) -> str:
    return "".join(character if character.isalnum() or character in "-_.@" else "_" for character in value) or "_"


class _Session:
    """One working directory on one client, for one export."""

    def __init__(self, client: str, config: RagDoorsConfig, run: Run) -> None:
        self.client = client
        self.config = config
        self._run = run
        self.directory = f"{REMOTE_ROOT}/{uuid.uuid4().hex[:12]}"
        self._opened = False

    def open(self) -> None:
        windows = self.directory.replace("/", "\\")
        self._powershell(f"New-Item -ItemType Directory -Force '{windows}\\out' | Out-Null", "creating its working directory")
        self._opened = True  # from here on there is something to remove
        self._call(
            ["scp", "-q", *SSH_OPTIONS, *(str(path) for path in sorted(CLIENT_SCRIPTS.iterdir()) if path.is_file()),
             f"{self.client}:{self.directory}/"],
            "copying the scripts",
        )

    def put(self, name: str, content: str) -> None:
        with tempfile.TemporaryDirectory() as directory:
            local = Path(directory) / name
            local.write_text(content, encoding="utf-8")
            self._call(["scp", "-q", *SSH_OPTIONS, str(local), f"{self.client}:{self.directory}/{name}"], f"copying {name}")

    def run(self, mode: str, job: dict[str, Any]) -> None:
        """One doors.exe run; a DOORS error carries what DOORS logged."""
        settings = {
            **job, "mode": mode, "executable": self.config.executable,
            "timeoutSeconds": int(self.config.timeout_seconds),
        }
        script = f"{self.directory}/run.ps1".replace("/", "\\")
        result = self._call(
            ["ssh", *SSH_OPTIONS, self.client, "powershell", "-NoProfile", "-NonInteractive",
             "-ExecutionPolicy", "Bypass", "-File", script],
            f"running the {mode} script",
            stdin=json.dumps(settings) + "\n",  # ASCII: json escapes the rest
            timeout=self.config.timeout_seconds + TRANSFER_TIMEOUT_SECONDS,
        )
        answer: dict[str, Any] = {}
        for line in reversed(result.stdout.splitlines()):
            if line.strip().startswith("{"):
                try:
                    answer = json.loads(line)
                except json.JSONDecodeError:
                    continue
                break
        if answer.get("ok"):
            return
        password = str(job.get("password") or "")
        log = " ".join(str(answer.get("log") or "").split())
        if password:
            log = log.replace(password, "***")
        if answer.get("error"):
            reason = str(answer["error"])
        elif answer.get("timedOut"):
            reason = f"doors.exe did not finish in {int(self.config.timeout_seconds)} s and was stopped"
        elif answer:
            reason = f"the {mode} script did not finish (doors.exe exit {answer.get('exitCode')})"
        else:
            reason = f"the client did not report on the {mode} script (ssh exit {result.returncode})"
        raise DoorsInputError(f"{reason}; DOORS: {log[:MAX_LOG_CHARACTERS]}" if log else reason)

    def fetch(self, name: str, into: Path) -> Path:
        self._call(["scp", "-q", "-r", *SSH_OPTIONS, f"{self.client}:{self.directory}/{name}", str(into)], f"fetching {name}")
        return into / PurePosixPath(name).name

    def close(self) -> None:
        """Remove the working directory, and the service's own when that leaves
        it empty; requirement text does not stay on a client."""
        if not self._opened:
            return
        windows = self.directory.replace("/", "\\")
        try:
            self._powershell(
                f"Remove-Item -Recurse -Force '{windows}' -ErrorAction SilentlyContinue; "
                f"if (-not (Get-ChildItem '{REMOTE_ROOT}' -ErrorAction SilentlyContinue)) "
                f"{{ Remove-Item '{REMOTE_ROOT}' -ErrorAction SilentlyContinue }}",
                "removing its working directory",
            )
        except (_ClientAway, DoorsInputError) as exc:
            print(f"RAG DOORS client  : {self.client}: {self.directory} could not be removed ({exc})", flush=True)

    def _powershell(self, command: str, what: str) -> None:
        encoded = base64.b64encode(f"$ProgressPreference = 'SilentlyContinue'; {command}".encode("utf-16-le")).decode("ascii")
        self._call(
            ["ssh", *SSH_OPTIONS, self.client, "powershell", "-NoProfile", "-NonInteractive", "-EncodedCommand", encoded],
            what,
        )

    def _call(
        self, command: list[str], what: str, stdin: str | None = None, timeout: float = TRANSFER_TIMEOUT_SECONDS,
    ) -> "subprocess.CompletedProcess[str]":
        try:
            # Without input ssh must not wait on, or eat, the service's own stdin.
            feed: dict[str, Any] = {"input": stdin} if stdin is not None else {"stdin": subprocess.DEVNULL}
            result = self._run(
                command, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=timeout, **feed,
            )
        except subprocess.TimeoutExpired as exc:
            raise DoorsInputError(f"{what} took longer than {int(timeout)} s") from exc
        except OSError as exc:
            raise DoorsInputError(f"{what}: {exc}") from exc
        if result.returncode == SSH_CONNECTION_FAILED:
            raise _ClientAway(_last_line(result.stderr) or "no SSH connection")
        if result.returncode != 0 and command[0] == "scp":
            raise DoorsInputError(f"{what} failed: {_last_line(result.stderr) or f'scp exit {result.returncode}'}")
        if result.returncode != 0 and "-EncodedCommand" in command:
            raise DoorsInputError(f"{what} failed: {_last_line(result.stderr) or _last_line(result.stdout)}")
        return result


def _last_line(text: str) -> str:
    lines = [line.strip() for line in (text or "").splitlines() if line.strip() and not line.startswith("**")]
    return lines[-1][:200] if lines else ""
