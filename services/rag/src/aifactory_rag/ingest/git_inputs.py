"""GitLab repositories as inputs of a source.

Each repository is kept as a working tree under the configured mirror
directory and ingested at the commit its ref points to after a fetch. Change
detection is by git blob id: a file whose blob id matches the one recorded on
its document is unchanged since the last ingest and is not parsed again, which
is exactly the set of files a diff against the recorded commit would report,
and stays correct when a previous run failed part-way.

Tokens are read from their variables when git or the GitLab API needs them and
handed to git through the environment (`GIT_CONFIG_COUNT`), so they never reach
a command line, a mirror's git config, a remote URL, a log or an error.
"""

from __future__ import annotations

import base64
import os
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import quote, urlsplit, urlunsplit

import httpx

from aifactory_rag.config import GitGroupConfig, GitRepositoryConfig, RagSourceConfig


@dataclass(frozen=True)
class RepositoryInput:
    """One repository to ingest, from a REPO entry or found through a GROUP."""

    entry: str  # RAG_SOURCE_3_REPO_1, or RAG_SOURCE_6_GROUP_1 for a group's project
    key: str  # host/group/project: the input key its documents are stored under
    project_path: str  # group/project
    clone_url: str  # no credentials, ever
    web_url: str
    token_env: str
    ref: str | None = None


@dataclass(frozen=True)
class RepositoryTree:
    worktree: Path
    ref: str
    commit: str
    blobs: dict[str, str]  # relative path -> git blob id
    # The REF selector this tree was resolved from (`@last-release`), if any;
    # `ref` is always the real branch or tag.
    selector: str | None = None
    is_tag: bool = False


class GitInputError(RuntimeError):
    """A repository or group that could not be read; its entry is named."""


def repository_inputs(source: RagSourceConfig, environ: dict[str, str] | None = None) -> tuple[list[RepositoryInput], list[GitInputError]]:
    """Resolve REPO entries and expand GROUP entries into repositories.

    A project reached both ways is taken once, from its REPO entry. A group
    that cannot be listed is returned as an error and does not stop the rest.
    """
    env = os.environ if environ is None else environ
    inputs: dict[str, RepositoryInput] = {}
    errors: list[GitInputError] = []
    for repository in source.repositories:
        item = _repository_input(repository)
        inputs.setdefault(item.key, item)
    for group in source.groups:
        try:
            for item in _group_inputs(group, env):
                inputs.setdefault(item.key, item)
        except GitInputError as exc:
            errors.append(exc)
    return list(inputs.values()), errors


def _repository_input(repository: GitRepositoryConfig) -> RepositoryInput:
    scheme, host, project_path = _split_url(repository.url, repository.entry)
    # file:// serves the tests: a bare repository on disk stands in for GitLab.
    netloc = "" if scheme == "file" else host
    return RepositoryInput(
        entry=repository.entry,
        key=f"{host}/{project_path}",
        project_path=project_path,
        clone_url=urlunsplit((scheme, netloc, f"/{project_path}.git", "", "")),
        web_url=urlunsplit((scheme, netloc, f"/{project_path}", "", "")),
        token_env=repository.token_env,
        ref=repository.ref,
    )


def _split_url(url: str, entry: str) -> tuple[str, str, str]:
    parts = urlsplit(url.strip())
    if parts.scheme not in {"http", "https", "file"} or (parts.scheme != "file" and not parts.netloc):
        raise GitInputError(f"{entry}_URL is not an http(s) GitLab URL: {url}")
    if parts.username or parts.password:
        raise GitInputError(f"{entry}_URL must not carry credentials; set {entry}_TOKEN instead")
    path = parts.path.strip("/")
    if path.endswith(".git"):
        path = path[:-4]
    if not path:
        raise GitInputError(f"{entry}_URL names no project or group: {url}")
    host = parts.netloc or "local"
    return parts.scheme, host, path


def _group_inputs(group: GitGroupConfig, env: dict[str, str] | os._Environ[str]) -> list[RepositoryInput]:
    from aifactory_rag.ingest.sources import _matches

    scheme, host, group_path = _split_url(group.url, group.entry)
    token = _token(group.token_env, env)
    api = urlunsplit((scheme, host, f"/api/v4/groups/{quote(group_path, safe='')}/projects", "", ""))
    found: list[RepositoryInput] = []
    page = 1
    while True:
        try:
            response = httpx.get(
                api,
                params={"include_subgroups": "true", "archived": "false", "per_page": 100, "page": page, "simple": "true"},
                headers={"PRIVATE-TOKEN": token},
                timeout=60,
            )
        except httpx.HTTPError as exc:
            raise GitInputError(f"{group.entry}: GitLab {host} is not reachable: {exc.__class__.__name__}") from None
        if response.status_code in {401, 403, 404}:
            raise GitInputError(
                f"{group.token_env} cannot list the projects of {group.url} (HTTP {response.status_code}); "
                "a group access token needs read_api and read_repository"
            )
        if response.status_code >= 400:
            raise GitInputError(f"{group.entry}: GitLab answered HTTP {response.status_code} listing {group.url}")
        for project in response.json():
            project_path = str(project.get("path_with_namespace") or "")
            if not project_path or any(_matches(project_path, pattern) for pattern in group.project_exclude):
                continue
            found.append(RepositoryInput(
                entry=group.entry,
                key=f"{host}/{project_path}",
                project_path=project_path,
                clone_url=urlunsplit((scheme, host, f"/{project_path}.git", "", "")),
                web_url=urlunsplit((scheme, host, f"/{project_path}", "", "")),
                token_env=group.token_env,
                ref=None,
            ))
        next_page = response.headers.get("x-next-page", "").strip()
        if not next_page:
            return found
        page = int(next_page)


def sync_repository(repository: RepositoryInput, mirror_dir: str, environ: dict[str, str] | None = None) -> RepositoryTree:
    """Fetch a repository's ref into its working tree and list its files."""
    env = os.environ if environ is None else environ
    token = _token(repository.token_env, env)
    worktree = Path(mirror_dir).expanduser() / repository.key
    git = _Git(worktree, token, repository)

    if not (worktree / ".git").is_dir():
        worktree.mkdir(parents=True, exist_ok=True)
        git.run("init", "-q")
        git.run("remote", "add", "origin", repository.clone_url)
    else:
        git.run("remote", "set-url", "origin", repository.clone_url)

    requested = repository.ref
    if requested == "@last-release":
        ref = _last_release(repository, token)
    elif requested == "@last-tag":
        ref = git.last_version_tag()
    else:
        ref = requested or git.default_branch()
    # A REF may name a branch or a tag (a firmware release is pinned by tag).
    remote_ref, local_ref = git.resolve_ref(ref)
    git.run("fetch", "-q", "--prune", "--no-tags", "origin", f"+{remote_ref}:{local_ref}", network=True)
    commit = git.run("rev-parse", f"{local_ref}^{{commit}}").strip()
    git.run("checkout", "-q", "--force", "--detach", commit)
    git.run("clean", "-q", "-ffdx")
    selector = requested if requested and requested.startswith("@") else None
    return RepositoryTree(
        worktree=worktree, ref=ref, commit=commit, blobs=git.blobs(commit),
        selector=selector, is_tag=remote_ref.startswith("refs/tags/"),
    )


SCIP_INDEX_FILE = "index.scip"


def find_scip_index(repository: RepositoryInput, tree: RepositoryTree, environ: dict[str, str] | None = None) -> tuple[bytes | None, str]:
    """The SCIP index of exactly the commit being ingested, and where it came from.

    Looked for in the generic packages whose version is the tag (a release
    publishes it there), then among the job artifacts of the commit's latest
    successful pipeline. Only the file name is the contract: no package or job
    name is configured. Every failure is a note, never an error: without an
    index the input keeps name-resolved edges.
    """
    env = os.environ if environ is None else environ
    parts = urlsplit(repository.web_url)
    if parts.scheme not in {"http", "https"}:
        return None, "no SCIP index: not a GitLab repository"
    try:
        token = _token(repository.token_env, env)
    except GitInputError as exc:
        return None, f"no SCIP index: {exc}"
    api = urlunsplit((parts.scheme, parts.netloc, f"/api/v4/projects/{quote(repository.project_path, safe='')}", "", ""))
    headers = {"PRIVATE-TOKEN": token}
    try:
        with httpx.Client(headers=headers, timeout=120, follow_redirects=True) as client:
            if tree.is_tag:
                found = _index_from_packages(client, api, tree.ref)
                if found:
                    return found
            found = _index_from_pipeline(client, api, tree.commit)
            if found:
                return found
    except _NoApiAccess as exc:
        return None, f"no SCIP index: {repository.token_env} cannot read {exc} (needs read_api)"
    except httpx.HTTPError as exc:
        return None, f"no SCIP index: GitLab {parts.netloc} is not reachable ({exc.__class__.__name__})"
    return None, f"no SCIP index for {tree.ref} ({tree.commit[:12]})"


class _NoApiAccess(Exception):
    pass


def _get(client: httpx.Client, url: str, what: str, **params: object) -> httpx.Response:
    response = client.get(url, params=params or None)
    if response.status_code in {401, 403}:
        raise _NoApiAccess(what)
    return response


def _index_from_packages(client: httpx.Client, api: str, tag: str) -> tuple[bytes, str] | None:
    response = _get(client, f"{api}/packages", "the packages", package_type="generic", package_version=tag, per_page=100)
    if response.status_code != 200:
        return None
    for package in response.json():
        files = _get(client, f"{api}/packages/{package['id']}/package_files", "the package files", per_page=100)
        if files.status_code != 200 or not any(item.get("file_name") == SCIP_INDEX_FILE for item in files.json()):
            continue
        download = _get(client, f"{api}/packages/generic/{quote(package['name'], safe='')}/{quote(tag, safe='')}/{SCIP_INDEX_FILE}", "the package")
        if download.status_code == 200 and download.content:
            return download.content, f"package {package['name']} {tag}"
    return None


def _index_from_pipeline(client: httpx.Client, api: str, commit: str) -> tuple[bytes, str] | None:
    pipelines = _get(client, f"{api}/pipelines", "the pipelines", sha=commit, status="success", order_by="id", sort="desc", per_page=1)
    if pipelines.status_code != 200 or not pipelines.json():
        return None
    pipeline = pipelines.json()[0]["id"]
    jobs = _get(client, f"{api}/pipelines/{pipeline}/jobs", "the pipeline jobs", per_page=100)
    if jobs.status_code != 200:
        return None
    for job in jobs.json():
        if not any(item.get("file_type") == "archive" for item in job.get("artifacts") or []):
            continue
        download = _get(client, f"{api}/jobs/{job['id']}/artifacts/{SCIP_INDEX_FILE}", "the job artifacts")
        if download.status_code == 200 and download.content:
            return download.content, f"pipeline {pipeline} job {job['name']}"
    return None


def _last_release(repository: RepositoryInput, token: str) -> str:
    """The tag of the newest GitLab Release by release date, upcoming ones ignored."""
    parts = urlsplit(repository.web_url)
    if parts.scheme not in {"http", "https"}:
        raise GitInputError(f"{repository.entry}_REF=@last-release needs a GitLab URL, not {repository.web_url}")
    api = urlunsplit((parts.scheme, parts.netloc, f"/api/v4/projects/{quote(repository.project_path, safe='')}/releases", "", ""))
    try:
        response = httpx.get(
            api,
            params={"order_by": "released_at", "sort": "desc", "per_page": 20},
            headers={"PRIVATE-TOKEN": token},
            timeout=60,
        )
    except httpx.HTTPError as exc:
        raise GitInputError(f"{repository.entry}: GitLab {parts.netloc} is not reachable: {exc.__class__.__name__}") from None
    if response.status_code in {401, 403}:
        raise GitInputError(
            f"{repository.token_env} cannot read the releases of {repository.web_url} (HTTP {response.status_code}); "
            "@last-release needs a token with read_api"
        )
    if response.status_code >= 400:
        raise GitInputError(f"{repository.entry}: GitLab answered HTTP {response.status_code} listing the releases of {repository.web_url}")
    for release in response.json():
        tag = release.get("tag_name")
        if tag and not release.get("upcoming_release"):
            return str(tag)
    raise GitInputError(f"{repository.entry}_REF=@last-release: {repository.web_url} has no release")



def _token(variable: str, env: dict[str, str] | os._Environ[str]) -> str:
    value = (env.get(variable) or "").strip()
    if not value:
        raise GitInputError(f"{variable} is not set")
    return value


class _Git:
    def __init__(self, worktree: Path, token: str, repository: RepositoryInput) -> None:
        self.worktree = worktree
        self.token = token
        self.repository = repository
        basic = base64.b64encode(f"oauth2:{token}".encode()).decode()
        self.env = {
            **os.environ,
            "GIT_TERMINAL_PROMPT": "0",
            # Configuration through the environment reaches only this process:
            # nothing is written to .git/config and nothing shows in `ps`.
            "GIT_CONFIG_COUNT": "2",
            "GIT_CONFIG_KEY_0": "http.extraHeader",
            "GIT_CONFIG_VALUE_0": f"Authorization: Basic {basic}",
            "GIT_CONFIG_KEY_1": "credential.helper",
            "GIT_CONFIG_VALUE_1": "",
        }

    def run(self, *args: str, network: bool = False) -> str:
        completed = subprocess.run(  # noqa: S603 - fixed git subcommands
            ["git", *args],
            cwd=self.worktree,
            env=self.env,
            capture_output=True,
            text=True,
            timeout=1800,
        )
        if completed.returncode != 0:
            detail = self._redact((completed.stderr or completed.stdout or "").strip())[-500:]
            if network and _AUTH_FAILURE.search(detail):
                raise GitInputError(
                    f"{self.repository.token_env} cannot read {self.repository.web_url}: {detail}"
                )
            raise GitInputError(f"{self.repository.entry}: git {args[0]} failed for {self.repository.web_url}: {detail}")
        return completed.stdout

    def default_branch(self) -> str:
        output = self.run("ls-remote", "--symref", "origin", "HEAD", network=True)
        for line in output.splitlines():
            if line.startswith("ref: refs/heads/") and line.endswith("\tHEAD"):
                return line[len("ref: refs/heads/"):-len("\tHEAD")]
        raise GitInputError(f"{self.repository.entry}: {self.repository.web_url} has no default branch")

    def last_version_tag(self) -> str:
        """The tag with the highest version number; tags that are not versions are skipped."""
        output = self.run("ls-remote", "--tags", "origin", network=True)
        best: tuple[tuple[int, ...], str] | None = None
        for line in output.splitlines():
            name = line.split("\t", 1)[-1]
            if not name.startswith("refs/tags/") or name.endswith("^{}"):
                continue
            tag = name[len("refs/tags/"):]
            match = _VERSION_TAG.match(tag)
            if not match:
                continue
            version = tuple(int(part) for part in match.group(1).split("."))
            if best is None or version > best[0]:
                best = (version, tag)
        if best is None:
            raise GitInputError(f"{self.repository.entry}_REF=@last-tag: {self.repository.web_url} has no version tag")
        return best[1]

    def resolve_ref(self, ref: str) -> tuple[str, str]:
        """The remote ref a REF names and where it is fetched to locally."""
        output = self.run("ls-remote", "origin", f"refs/heads/{ref}", f"refs/tags/{ref}", network=True)
        names = {line.split("\t", 1)[1] for line in output.splitlines() if "\t" in line}
        if f"refs/heads/{ref}" in names:
            return f"refs/heads/{ref}", f"refs/remotes/origin/{ref}"
        if f"refs/tags/{ref}" in names:
            return f"refs/tags/{ref}", f"refs/tags/{ref}"
        raise GitInputError(f"{self.repository.entry}_REF: {self.repository.web_url} has no branch or tag {ref}")

    def blobs(self, commit: str) -> dict[str, str]:
        output = self.run("ls-tree", "-r", "-z", "--full-tree", commit)
        blobs: dict[str, str] = {}
        for record in output.split("\0"):
            if not record:
                continue
            meta, _, path = record.partition("\t")
            mode, kind, blob = meta.split(" ")
            # Submodules and symlinks carry no content of their own here.
            if kind == "blob" and mode != "120000":
                blobs[path] = blob
        return blobs

    def _redact(self, text: str) -> str:
        return text.replace(self.token, "***") if self.token else text


_VERSION_TAG = re.compile(r"^[vV]?(\d+(?:\.\d+)*)$")

_AUTH_FAILURE = re.compile(
    r"authentication failed|could not read username|http basic: access denied|"
    r"\b40[134]\b|repository not found|not found|access denied|forbidden",
    re.IGNORECASE,
)
