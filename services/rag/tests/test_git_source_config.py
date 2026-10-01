"""A source holds a folder, GitLab repositories, or both (RQ-0023).

Each repository and group is a numbered entry under the slot's variable prefix
with its own URL and token, so a token is never shared between projects and one
source can take repositories from two GitLab servers.
"""

from __future__ import annotations

import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from aifactory_rag.config import git_entries_from_env, load_factory_config

TOKEN = "glpat-secret-value-123"


def _write_config(directory: Path, slots: int = 2) -> Path:
    sources = [
        {
            "id": f"${{RAG_SOURCE_{n}_ID:-source-{n}}}",
            "type": "filesystem",
            "rootPath": f"${{RAG_SOURCE_{n}_PATH:-}}",
            "envPrefix": f"RAG_SOURCE_{n}",
        }
        for n in range(1, slots + 1)
    ]
    path = directory / "factory.config.json"
    path.write_text(json.dumps({"rag": {"sources": sources}}), encoding="utf-8")
    return path


class GitSourceConfigTests(unittest.TestCase):
    def _load(self, env: dict[str, str]):
        with tempfile.TemporaryDirectory() as directory:
            config_path = _write_config(Path(directory))
            with patch.dict(os.environ, env, clear=True):
                return load_factory_config(config_path).rag

    def test_a_slot_holds_a_folder_and_repositories_on_two_servers(self) -> None:
        rag = self._load({
            "RAG_SOURCE_1_ID": "aselsan-bfi",
            "RAG_SOURCE_1_PATH": "/mnt/fs2/bfi",
            "RAG_SOURCE_1_REPO_1_URL": "http://gitlab.bc.int/aselsan/bfi-sw",
            "RAG_SOURCE_1_REPO_1_TOKEN": TOKEN,
            "RAG_SOURCE_1_REPO_1_REF": "main",
            "RAG_SOURCE_1_REPO_2_URL": "http://gitlab.bcintr.int/simics/aselsan-bfi",
            "RAG_SOURCE_1_REPO_2_TOKEN": "glpat-other",
        })

        [source] = rag.sources
        self.assertEqual(source.id, "aselsan-bfi")
        self.assertEqual(source.root_path, "/mnt/fs2/bfi")
        self.assertEqual(
            [(r.entry, r.url, r.token_env, r.ref) for r in source.repositories],
            [
                ("RAG_SOURCE_1_REPO_1", "http://gitlab.bc.int/aselsan/bfi-sw", "RAG_SOURCE_1_REPO_1_TOKEN", "main"),
                ("RAG_SOURCE_1_REPO_2", "http://gitlab.bcintr.int/simics/aselsan-bfi", "RAG_SOURCE_1_REPO_2_TOKEN", None),
            ],
        )

    def test_the_loaded_configuration_holds_token_names_never_values(self) -> None:
        rag = self._load({
            "RAG_SOURCE_1_ID": "code",
            "RAG_SOURCE_1_REPO_1_URL": "http://gitlab.bc.int/aselsan/bfi-sw",
            "RAG_SOURCE_1_REPO_1_TOKEN": TOKEN,
            "RAG_SOURCE_1_GROUP_1_URL": "http://gitlab.bc.int/netforge",
            "RAG_SOURCE_1_GROUP_1_TOKEN": TOKEN,
        })

        served = json.dumps([source.model_dump(by_alias=True) for source in rag.sources])
        self.assertNotIn(TOKEN, served)
        self.assertIn("RAG_SOURCE_1_REPO_1_TOKEN", served)

    def test_a_slot_with_only_repositories_takes_no_folder(self) -> None:
        rag = self._load({
            "RAG_SOURCE_1_ID": "code",
            "RAG_SOURCE_1_REPO_1_URL": "http://gitlab.bc.int/aselsan/bfi-sw",
            "RAG_SOURCE_1_REPO_1_TOKEN": TOKEN,
        })

        [source] = rag.sources
        self.assertIsNone(source.root_path)
        self.assertEqual(len(source.repositories), 1)

    def test_a_slot_with_no_input_is_not_a_source(self) -> None:
        rag = self._load({"RAG_SOURCE_1_ID": "docs", "RAG_SOURCE_1_PATH": "/mnt/docs"})

        self.assertEqual([source.id for source in rag.sources], ["docs"])

    def test_entry_numbers_may_have_gaps(self) -> None:
        entries = git_entries_from_env("RAG_SOURCE_3", "bfi", {
            "RAG_SOURCE_3_REPO_7_URL": "http://gitlab.bc.int/a/b",
            "RAG_SOURCE_3_REPO_7_TOKEN": TOKEN,
            "RAG_SOURCE_3_REPO_2_URL": "http://gitlab.bc.int/a/c",
            "RAG_SOURCE_3_REPO_2_TOKEN": TOKEN,
            "RAG_SOURCE_30_REPO_1_URL": "http://gitlab.bc.int/not/this/slot",
        })

        self.assertEqual([entry["entry"] for entry in entries["repositories"]], ["RAG_SOURCE_3_REPO_2", "RAG_SOURCE_3_REPO_7"])

    def test_an_entry_without_its_token_names_the_slot_entry_and_variable(self) -> None:
        with self.assertRaises(ValueError) as caught:
            git_entries_from_env("RAG_SOURCE_3", "aselsan-bfi", {"RAG_SOURCE_3_REPO_1_URL": "http://gitlab.bc.int/a/b"})

        message = str(caught.exception)
        self.assertIn("RAG_SOURCE_3 (aselsan-bfi)", message)
        self.assertIn("RAG_SOURCE_3_REPO_1_TOKEN", message)

    def test_a_token_without_its_url_fails(self) -> None:
        with self.assertRaisesRegex(ValueError, "RAG_SOURCE_3_GROUP_2_URL not set"):
            git_entries_from_env("RAG_SOURCE_3", "x", {"RAG_SOURCE_3_GROUP_2_TOKEN": TOKEN})

    def test_group_project_excludes_are_read(self) -> None:
        entries = git_entries_from_env("RAG_SOURCE_6", "netforge", {
            "RAG_SOURCE_6_GROUP_1_URL": "http://gitlab.bc.int/netforge",
            "RAG_SOURCE_6_GROUP_1_TOKEN": TOKEN,
            "RAG_SOURCE_6_GROUP_1_PROJECT_EXCLUDE": '["**/archive/**"]',
        })

        self.assertEqual(entries["groups"][0]["projectExclude"], ["**/archive/**"])
        self.assertEqual(entries["groups"][0]["tokenEnv"], "RAG_SOURCE_6_GROUP_1_TOKEN")


if __name__ == "__main__":
    unittest.main()
