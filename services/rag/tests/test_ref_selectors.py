"""A repository REF can follow the last release or the last version tag (RQ-0026).

A fixed REF goes stale: aselsan/bfi-sw keeps `main` as its initial commit and
publishes releases, so its corpus should move with each release without an
edit to .env.
"""

from __future__ import annotations

import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from aifactory_rag.config import RagSourceConfig, git_entries_from_env
from aifactory_rag.ingest.git_inputs import GitInputError, RepositoryInput, _last_release, repository_inputs, sync_repository

TOKEN = "glpat-test"


def git(cwd: Path, *args: str) -> str:
    return subprocess.run(
        ["git", "-c", "user.name=t", "-c", "user.email=t@t", *args],
        cwd=cwd, check=True, capture_output=True, text=True,
    ).stdout


class Response:
    def __init__(self, status_code: int, payload: object = None) -> None:
        self.status_code = status_code
        self._payload = payload

    def json(self) -> object:
        return self._payload


GITLAB_REPOSITORY = RepositoryInput(
    entry="RAG_SOURCE_3_REPO_1",
    key="gitlab.bc.int/aselsan/bfi-sw",
    project_path="aselsan/bfi-sw",
    clone_url="http://gitlab.bc.int/aselsan/bfi-sw.git",
    web_url="http://gitlab.bc.int/aselsan/bfi-sw",
    token_env="RAG_SOURCE_3_REPO_1_TOKEN",
    ref="@last-release",
)


class LastReleaseTests(unittest.TestCase):
    def test_the_newest_release_that_is_not_upcoming_is_taken(self) -> None:
        releases = [
            {"tag_name": "2.0.0", "upcoming_release": True},
            {"tag_name": "1.1.0", "upcoming_release": False},
            {"tag_name": "1.0.1", "upcoming_release": False},
        ]
        with patch("aifactory_rag.ingest.git_inputs.httpx.get", return_value=Response(200, releases)) as get:
            self.assertEqual(_last_release(GITLAB_REPOSITORY, TOKEN), "1.1.0")

        self.assertEqual(get.call_args.args[0], "http://gitlab.bc.int/api/v4/projects/aselsan%2Fbfi-sw/releases")
        self.assertEqual(get.call_args.kwargs["params"]["order_by"], "released_at")
        self.assertEqual(get.call_args.kwargs["headers"], {"PRIVATE-TOKEN": TOKEN})

    def test_a_repository_without_a_release_fails_naming_its_ref(self) -> None:
        with patch("aifactory_rag.ingest.git_inputs.httpx.get", return_value=Response(200, [])):
            with self.assertRaisesRegex(GitInputError, "RAG_SOURCE_3_REPO_1_REF=@last-release: .* has no release"):
                _last_release(GITLAB_REPOSITORY, TOKEN)

    def test_a_token_without_read_api_is_named_with_the_scope_it_needs(self) -> None:
        with patch("aifactory_rag.ingest.git_inputs.httpx.get", return_value=Response(403)):
            with self.assertRaisesRegex(GitInputError, "RAG_SOURCE_3_REPO_1_TOKEN cannot read the releases .*read_api"):
                _last_release(GITLAB_REPOSITORY, TOKEN)


class SelectorConfigTests(unittest.TestCase):
    def test_known_selectors_load_and_an_unknown_one_fails(self) -> None:
        for selector in ("@last-release", "@last-tag"):
            entries = git_entries_from_env("RAG_SOURCE_3", "bfi", {
                "RAG_SOURCE_3_REPO_1_URL": "http://gitlab.bc.int/aselsan/bfi-sw",
                "RAG_SOURCE_3_REPO_1_TOKEN": TOKEN,
                "RAG_SOURCE_3_REPO_1_REF": selector,
            })
            self.assertEqual(entries["repositories"][0]["ref"], selector)

        with self.assertRaises(ValueError) as caught:
            git_entries_from_env("RAG_SOURCE_3", "bfi", {
                "RAG_SOURCE_3_REPO_1_URL": "http://gitlab.bc.int/aselsan/bfi-sw",
                "RAG_SOURCE_3_REPO_1_TOKEN": TOKEN,
                "RAG_SOURCE_3_REPO_1_REF": "@latest",
            })
        self.assertIn("RAG_SOURCE_3_REPO_1_REF=@latest", str(caught.exception))
        self.assertIn("@last-release, @last-tag", str(caught.exception))


class LastTagTests(unittest.TestCase):
    def setUp(self) -> None:
        self._dir = tempfile.TemporaryDirectory()
        root = Path(self._dir.name)
        self.origin = root / "gitlab" / "aselsan" / "bfi-sw.git"
        self.origin.mkdir(parents=True)
        git(self.origin, "init", "-q", "--bare", "-b", "main")
        self.work = root / "work"
        git(root, "clone", "-q", str(self.origin), str(self.work))
        self.mirror = root / "mirror"
        self.commits: dict[str, str] = {}

    def tearDown(self) -> None:
        self._dir.cleanup()

    def _release(self, tag: str, filename: str) -> None:
        (self.work / filename).write_text(f"// {tag}\n", encoding="utf-8")
        git(self.work, "add", "-A")
        git(self.work, "commit", "-q", "-m", tag)
        git(self.work, "tag", "-a", tag, "-m", tag)
        git(self.work, "push", "-q", "--follow-tags", "origin", "HEAD:main")
        self.commits[tag] = git(self.work, "rev-parse", "HEAD").strip()

    def _sync(self, ref: str):
        source = RagSourceConfig.model_validate({
            "id": "bfi",
            "repositories": [{
                "entry": "RAG_SOURCE_3_REPO_1",
                "url": f"file://{self.origin}",
                "tokenEnv": "RAG_SOURCE_3_REPO_1_TOKEN",
                "ref": ref,
            }],
        })
        [repository], _ = repository_inputs(source, {"RAG_SOURCE_3_REPO_1_TOKEN": TOKEN})
        return sync_repository(repository, str(self.mirror), {"RAG_SOURCE_3_REPO_1_TOKEN": TOKEN})

    def test_the_highest_version_is_taken_numerically_and_other_tags_are_skipped(self) -> None:
        self._release("1.9.2", "a.c")
        self._release("1.10.0", "b.c")
        self._release("v0.1", "c.c")
        self._release("nightly", "d.c")

        tree = self._sync("@last-tag")

        self.assertEqual((tree.selector, tree.ref, tree.commit), ("@last-tag", "1.10.0", self.commits["1.10.0"]))
        self.assertEqual(set(tree.blobs), {"a.c", "b.c"})

    def test_a_newer_tag_moves_the_next_ingest(self) -> None:
        self._release("1.0.0", "a.c")
        first = self._sync("@last-tag")
        (self.work / "a.c").unlink()
        self._release("1.1.0", "b.c")

        second = self._sync("@last-tag")

        self.assertEqual((first.ref, second.ref), ("1.0.0", "1.1.0"))
        self.assertNotIn("a.c", second.blobs)  # removed in the release, so its document retires

    def test_a_repository_without_a_version_tag_fails_naming_its_ref(self) -> None:
        self._release("nightly", "a.c")
        with self.assertRaisesRegex(GitInputError, "RAG_SOURCE_3_REPO_1_REF=@last-tag: .* has no version tag"):
            self._sync("@last-tag")

    def test_a_branch_name_behaves_as_before(self) -> None:
        self._release("1.0.0", "a.c")
        tree = self._sync("main")
        self.assertEqual((tree.selector, tree.ref), (None, "main"))


class RelabelTests(unittest.TestCase):
    def test_an_unchanged_repository_file_is_relabelled_with_the_new_tag(self) -> None:
        from aifactory_rag.ingest.pipeline import InputContext, _backfill_metadata

        executed: list[tuple[str, tuple[object, ...]]] = []

        class Cursor:
            def __enter__(self):
                return self

            def __exit__(self, *_: object) -> None:
                return None

            def execute(self, statement: str, params: tuple[object, ...]) -> None:
                executed.append((statement, params))

        class Connection:
            def cursor(self) -> Cursor:
                return Cursor()

        release = {"input": "gitlab.bc.int/aselsan/bfi-sw", "repository": "aselsan/bfi-sw",
                   "repositoryUrl": "http://gitlab.bc.int/aselsan/bfi-sw", "ref": "1.1.0", "commit": "d5dc028f"}
        existing = {"id": 7, "metadata": {"contentType": "code", **release, "ref": "project-initialization", "commit": "640e667b"}}

        _backfill_metadata(Connection(), existing, "src/a429.c", InputContext("gitlab.bc.int/aselsan/bfi-sw", "bfi-sw", release))

        self.assertEqual(len(executed), 2)  # the document and its active chunks
        self.assertIn('"ref": "1.1.0"', str(executed[1][1][0]))
        self.assertIn("rag_chunks", executed[1][0])

        executed.clear()
        _backfill_metadata(Connection(), {"id": 7, "metadata": {"contentType": "code", **release}}, "src/a429.c",
                           InputContext("gitlab.bc.int/aselsan/bfi-sw", "bfi-sw", release))
        self.assertEqual(executed, [])  # already current: nothing written


if __name__ == "__main__":
    unittest.main()
