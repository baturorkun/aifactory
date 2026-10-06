"""A GitLab push webhook keeps a repository source current (RQ-0028)."""

from __future__ import annotations

import threading
import time
import unittest

from aifactory_rag.config import RagConfig, git_entries_from_env
from aifactory_rag.webhook import IngestQueue, authentic, entries_for, follows

SECRET = "webhook-secret-123"


def config(ref: str | None = "project-initialization") -> RagConfig:
    entries = git_entries_from_env("RAG_SOURCE_3", "aselsan-bfi", {
        "RAG_SOURCE_3_REPO_1_URL": "http://gitlab.bc.int/aselsan/bfi-sw",
        "RAG_SOURCE_3_REPO_1_TOKEN": "glpat-x",
        **({"RAG_SOURCE_3_REPO_1_REF": ref} if ref else {}),
        "RAG_SOURCE_3_REPO_1_WEBHOOK_SECRET": SECRET,
    })
    return RagConfig.model_validate({"sources": [
        {"id": "aselsan-bfi", "rootPath": "/mnt/x", **entries},
        {"id": "other", "repositories": [{"entry": "RAG_SOURCE_4_REPO_1", "url": "http://gitlab.bc.int/netforge/x", "tokenEnv": "T"}]},
    ]})


def push(ref: str = "refs/heads/project-initialization", kind: str = "push", path: str = "aselsan/bfi-sw") -> dict:
    return {
        "object_kind": kind, "ref": ref,
        "project": {"path_with_namespace": path, "web_url": f"http://gitlab.bc.int/{path}", "default_branch": "main"},
    }


class MatchingTests(unittest.TestCase):
    def test_the_secret_is_read_by_variable_name(self) -> None:
        repository = config().sources[0].repositories[0]
        self.assertEqual(repository.webhook_secret_env, "RAG_SOURCE_3_REPO_1_WEBHOOK_SECRET")
        self.assertNotIn(SECRET, config().model_dump_json())

    def test_the_project_is_matched_to_its_entries(self) -> None:
        self.assertEqual([m.source.id for m in entries_for(config(), push())], ["aselsan-bfi"])
        self.assertEqual(entries_for(config(), push(path="aselsan/other")), [])

    def test_only_the_followed_branch_starts_an_ingest(self) -> None:
        repository = config().sources[0].repositories[0]
        self.assertTrue(follows(repository, push()))
        self.assertFalse(follows(repository, push("refs/heads/a429-driver")))
        self.assertFalse(follows(repository, push("refs/tags/1.2.0", "tag_push")))

    def test_without_a_ref_the_default_branch_is_followed(self) -> None:
        repository = config(ref=None).sources[0].repositories[0]
        self.assertTrue(follows(repository, push("refs/heads/main")))
        self.assertFalse(follows(repository, push()))

    def test_a_release_selector_follows_tag_pushes_only(self) -> None:
        repository = config(ref="@last-release").sources[0].repositories[0]
        self.assertTrue(follows(repository, push("refs/tags/1.2.0", "tag_push")))
        self.assertFalse(follows(repository, push("refs/heads/main")))

    def test_the_secret_must_match_and_must_exist(self) -> None:
        repository = config().sources[0].repositories[0]
        env = {"RAG_SOURCE_3_REPO_1_WEBHOOK_SECRET": SECRET}
        self.assertTrue(authentic(repository, SECRET, env))
        self.assertFalse(authentic(repository, "wrong", env))
        self.assertFalse(authentic(repository, None, env))
        self.assertFalse(authentic(repository, SECRET, {}))  # no secret configured: never trusted
        other = config().sources[1].repositories[0]
        self.assertFalse(authentic(other, SECRET, env))


class PipelineTests(unittest.TestCase):
    def pipeline(self, ref: str, status: str = "success", tag: bool = False) -> dict:
        return {**push(), "object_kind": "pipeline", "object_attributes": {"ref": ref, "status": status, "tag": tag}}

    def test_a_successful_pipeline_on_the_followed_branch_starts_an_ingest(self) -> None:
        repository = config().sources[0].repositories[0]
        self.assertTrue(follows(repository, self.pipeline("project-initialization")))
        # finished but failed on an unrelated job: still worth an ingest
        self.assertTrue(follows(repository, self.pipeline("project-initialization", status="failed")))
        self.assertFalse(follows(repository, self.pipeline("project-initialization", status="running")))
        self.assertFalse(follows(repository, self.pipeline("a429-driver")))
        self.assertFalse(follows(repository, self.pipeline("1.2.0", tag=True)))

    def test_a_release_selector_follows_successful_tag_pipelines(self) -> None:
        repository = config(ref="@last-release").sources[0].repositories[0]
        self.assertTrue(follows(repository, self.pipeline("1.2.0", tag=True)))
        self.assertFalse(follows(repository, self.pipeline("main")))


class QueueTests(unittest.TestCase):
    def test_pushes_during_a_run_fold_into_one_follow_up_run(self) -> None:
        release = threading.Event()
        runs: list[str] = []

        def ingest(source_id: str) -> None:
            runs.append(source_id)
            release.wait(5)

        queue = IngestQueue(ingest)
        self.assertEqual(queue.trigger("aselsan-bfi"), "started")
        time.sleep(0.05)
        self.assertEqual([queue.trigger("aselsan-bfi") for _ in range(5)], ["pending"] * 5)
        self.assertEqual(queue.trigger("other"), "started")  # sources are independent
        release.set()
        deadline = time.time() + 5
        while (queue.busy("aselsan-bfi") or queue.busy("other")) and time.time() < deadline:
            time.sleep(0.02)
        self.assertEqual(sorted(runs), ["aselsan-bfi", "aselsan-bfi", "other"])

    def test_a_failed_run_does_not_stop_the_queue(self) -> None:
        calls: list[int] = []

        def ingest(source_id: str) -> None:
            calls.append(1)
            raise RuntimeError("database down")

        queue = IngestQueue(ingest)
        queue.trigger("s")
        deadline = time.time() + 5
        while queue.busy("s") and time.time() < deadline:
            time.sleep(0.02)
        self.assertEqual(queue.trigger("s"), "started")


if __name__ == "__main__":
    unittest.main()
