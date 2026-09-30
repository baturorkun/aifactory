"""Repositories are mirrored, fetched by commit and never store their token.

A bare repository on disk (file://) stands in for GitLab: the same git
commands run, and the token handling is the same because it goes through the
environment whatever the transport.
"""

from __future__ import annotations

import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from aifactory_rag.config import GitRepositoryConfig, RagSourceConfig
from aifactory_rag.ingest.git_inputs import GitInputError, _Git, repository_inputs, sync_repository
from aifactory_rag.ingest.pipeline import _repository_files

TOKEN = "glpat-never-written-anywhere"


def git(cwd: Path, *args: str) -> str:
    return subprocess.run(
        ["git", "-c", "user.name=t", "-c", "user.email=t@t", *args],
        cwd=cwd, check=True, capture_output=True, text=True,
    ).stdout


class GitInputTests(unittest.TestCase):
    def setUp(self) -> None:
        self._dir = tempfile.TemporaryDirectory()
        self.root = Path(self._dir.name)
        self.origin = self.root / "gitlab" / "aselsan" / "bfi-sw.git"
        self.origin.mkdir(parents=True)
        git(self.origin, "init", "-q", "--bare", "-b", "main")
        self.work = self.root / "work"
        git(self.root, "clone", "-q", str(self.origin), str(self.work))
        (self.work / "src").mkdir()
        (self.work / "src" / "a429.c").write_text("void a429_rx_isr(void) {}\n", encoding="utf-8")
        (self.work / "README.md").write_text("# BFI\n", encoding="utf-8")
        (self.work / "build").mkdir()
        (self.work / "build" / "out.c").write_text("int x;\n", encoding="utf-8")
        self._commit("first")
        self.mirror = self.root / "mirror"
        self.source = RagSourceConfig.model_validate({
            "id": "aselsan-bfi",
            "repositories": [{
                "entry": "RAG_SOURCE_3_REPO_1",
                "url": f"file://{self.origin}",
                "tokenEnv": "RAG_SOURCE_3_REPO_1_TOKEN",
            }],
        })
        self.env = {"RAG_SOURCE_3_REPO_1_TOKEN": TOKEN}

    def tearDown(self) -> None:
        self._dir.cleanup()

    def _commit(self, message: str) -> None:
        git(self.work, "add", "-A")
        git(self.work, "commit", "-q", "-m", message)
        git(self.work, "push", "-q", "origin", "HEAD:main")

    def _sync(self):
        [repository], errors = repository_inputs(self.source, self.env)
        self.assertEqual(errors, [])
        return repository, sync_repository(repository, str(self.mirror), self.env)

    def test_a_repository_is_fetched_at_its_default_branch_commit(self) -> None:
        repository, tree = self._sync()

        self.assertEqual(tree.ref, "main")
        self.assertEqual(tree.commit, git(self.work, "rev-parse", "HEAD").strip())
        self.assertEqual(set(tree.blobs), {"src/a429.c", "README.md", "build/out.c"})
        self.assertTrue((tree.worktree / "src" / "a429.c").is_file())
        self.assertTrue(str(tree.worktree).startswith(str(self.mirror)))
        # The slot's excludes still apply: build/ is excluded by default.
        self.assertEqual([file.relative_path for file in _repository_files(self.source, tree)], ["README.md", "src/a429.c"])

    def test_a_second_sync_fetches_and_only_changed_files_get_new_blob_ids(self) -> None:
        _, first = self._sync()
        (self.work / "src" / "a429.c").write_text("void a429_rx_isr(void) { /* changed */ }\n", encoding="utf-8")
        (self.work / "README.md").unlink()
        self._commit("second")

        _, second = self._sync()

        self.assertNotEqual(first.commit, second.commit)
        self.assertNotIn("README.md", second.blobs)  # deleted, so its document retires
        self.assertNotEqual(first.blobs["src/a429.c"], second.blobs["src/a429.c"])
        self.assertEqual(first.blobs["build/out.c"], second.blobs["build/out.c"])  # unchanged, skipped
        self.assertIn("changed", (second.worktree / "src" / "a429.c").read_text(encoding="utf-8"))

    def test_a_ref_may_name_a_branch_or_a_tag(self) -> None:
        released = git(self.work, "rev-parse", "HEAD").strip()
        git(self.work, "tag", "1.0.0")
        git(self.work, "push", "-q", "origin", "1.0.0")
        git(self.work, "checkout", "-q", "-b", "feature")
        (self.work / "src" / "new.c").write_text("int added;\n", encoding="utf-8")
        self._commit_to("feature")

        for ref, expected in (("1.0.0", released), ("feature", git(self.work, "rev-parse", "HEAD").strip())):
            source = self.source.model_copy(update={"repositories": [self.source.repositories[0].model_copy(update={"ref": ref})]})
            [repository], _ = repository_inputs(source, self.env)
            tree = sync_repository(repository, str(self.mirror), self.env)
            self.assertEqual((tree.ref, tree.commit), (ref, expected))

        [repository], _ = repository_inputs(
            self.source.model_copy(update={"repositories": [self.source.repositories[0].model_copy(update={"ref": "nope"})]}),
            self.env,
        )
        with self.assertRaisesRegex(GitInputError, "RAG_SOURCE_3_REPO_1_REF: .* has no branch or tag nope"):
            sync_repository(repository, str(self.mirror), self.env)

    def _commit_to(self, branch: str) -> None:
        git(self.work, "add", "-A")
        git(self.work, "commit", "-q", "-m", branch)
        git(self.work, "push", "-q", "origin", f"HEAD:{branch}")

    def test_the_token_is_written_nowhere_in_the_mirror(self) -> None:
        _, tree = self._sync()

        for path in tree.worktree.joinpath(".git").rglob("*"):
            if path.is_file():
                self.assertNotIn(TOKEN.encode(), path.read_bytes(), path)
        self.assertNotIn("glpat", git(tree.worktree, "remote", "get-url", "origin"))

    def test_a_missing_token_names_its_variable(self) -> None:
        [repository], _ = repository_inputs(self.source, {})
        with self.assertRaisesRegex(GitInputError, "RAG_SOURCE_3_REPO_1_TOKEN is not set"):
            sync_repository(repository, str(self.mirror), {})

    def test_git_errors_are_redacted(self) -> None:
        [repository], _ = repository_inputs(self.source, self.env)
        runner = _Git(self.root, TOKEN, repository)
        self.assertEqual(runner._redact(f"fatal: bad header Basic {TOKEN}"), "fatal: bad header Basic ***")

    def test_a_url_with_credentials_is_refused(self) -> None:
        source = RagSourceConfig.model_validate({
            "id": "x",
            "repositories": [{"entry": "RAG_SOURCE_1_REPO_1", "url": f"http://oauth2:{TOKEN}@gitlab.bc.int/a/b", "tokenEnv": "T"}],
        })
        with self.assertRaisesRegex(GitInputError, "must not carry credentials") as caught:
            repository_inputs(source, {})
        self.assertNotIn(TOKEN, str(caught.exception))

    def test_a_project_listed_and_in_a_group_is_taken_once(self) -> None:
        source = RagSourceConfig.model_validate({
            "id": "x",
            "repositories": [{"entry": "RAG_SOURCE_1_REPO_1", "url": "http://gitlab.bc.int/aselsan/bfi-sw", "tokenEnv": "T1"}],
            "groups": [{"entry": "RAG_SOURCE_1_GROUP_1", "url": "http://gitlab.bc.int/aselsan", "tokenEnv": "T2", "projectExclude": ["**/old-*"]}],
        })

        class Response:
            status_code = 200
            headers: dict[str, str] = {}

            @staticmethod
            def json() -> list[dict[str, str]]:
                return [
                    {"path_with_namespace": "aselsan/bfi-sw"},
                    {"path_with_namespace": "aselsan/bfi-drivers"},
                    {"path_with_namespace": "aselsan/old-tools"},
                ]

        with patch("aifactory_rag.ingest.git_inputs.httpx.get", return_value=Response()) as get:
            repositories, errors = repository_inputs(source, {"T1": "a", "T2": "b"})

        self.assertEqual(errors, [])
        self.assertEqual([(r.key, r.entry) for r in repositories], [
            ("gitlab.bc.int/aselsan/bfi-sw", "RAG_SOURCE_1_REPO_1"),
            ("gitlab.bc.int/aselsan/bfi-drivers", "RAG_SOURCE_1_GROUP_1"),
        ])
        self.assertEqual(get.call_args.kwargs["headers"], {"PRIVATE-TOKEN": "b"})

    def test_a_group_the_token_cannot_list_fails_alone_and_names_the_variable(self) -> None:
        source = RagSourceConfig.model_validate({
            "id": "x",
            "repositories": [{"entry": "RAG_SOURCE_1_REPO_1", "url": "http://gitlab.bc.int/a/b", "tokenEnv": "T1"}],
            "groups": [{"entry": "RAG_SOURCE_1_GROUP_1", "url": "http://gitlab.bc.int/netforge", "tokenEnv": "RAG_SOURCE_1_GROUP_1_TOKEN"}],
        })

        class Denied:
            status_code = 401
            headers: dict[str, str] = {}

        with patch("aifactory_rag.ingest.git_inputs.httpx.get", return_value=Denied()):
            repositories, errors = repository_inputs(source, {"T1": "a", "RAG_SOURCE_1_GROUP_1_TOKEN": "b"})

        self.assertEqual([r.key for r in repositories], ["gitlab.bc.int/a/b"])
        self.assertIn("RAG_SOURCE_1_GROUP_1_TOKEN cannot list", str(errors[0]))


if __name__ == "__main__":
    unittest.main()
