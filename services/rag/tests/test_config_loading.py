from __future__ import annotations

import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from aifactory_rag.config import load_factory_config


class ConfigLoadingTests(unittest.TestCase):
    def write_config(self, directory: str, config: dict[str, object]) -> Path:
        path = Path(directory) / "factory.config.json"
        path.write_text(json.dumps(config), encoding="utf-8")
        return path

    def test_rag_config_ignores_unset_agent_pipeline_variables(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = self.write_config(
                directory,
                {
                    "model": {"provider": "${UNSET_AGENT_ONLY_TEST_VAR}"},
                    "rag": {
                        "database": {"connectionString": "postgresql://test"},
                        "sources": [{"id": "simics-code", "rootPath": "/tmp/simics"}],
                        "embedding": {"provider": "ollama"},
                    },
                },
            )

            config = load_factory_config(path)

            self.assertEqual(config.rag.sources[0].id, "simics-code")

    def test_rag_config_still_requires_variables_used_inside_rag(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = self.write_config(
                directory,
                {"rag": {"database": {"connectionString": "${UNSET_RAG_TEST_VAR}"}}},
            )

            with self.assertRaisesRegex(RuntimeError, "UNSET_RAG_TEST_VAR"):
                load_factory_config(path)

    def test_the_root_config_has_twelve_source_slots_and_an_unset_one_is_left_out(self) -> None:
        # RQ-0072: slots 1-8 were all taken (DO-254 is slot 9); a slot with no
        # path, repository, group or DOORS module is dropped when loaded.
        root = Path(__file__).resolve().parents[3] / "factory.config.json"
        slots = json.loads(root.read_text(encoding="utf-8"))["rag"]["sources"]
        self.assertEqual([slot["envPrefix"] for slot in slots], [f"RAG_SOURCE_{n}" for n in range(1, 13)])
        for n, slot in enumerate(slots, start=1):
            self.assertEqual(slot["rootPath"], f"${{RAG_SOURCE_{n}_PATH:-}}")
        with tempfile.TemporaryDirectory() as directory:
            path = self.write_config(directory, {"rag": {"sources": [
                {"id": "${T_ID_9:-source-9}", "rootPath": "${T_PATH_9:-}"},
                {"id": "${T_ID_10:-source-10}", "rootPath": "${T_PATH_10:-}"},
            ]}})
            with patch.dict(os.environ, {"T_ID_9": "do254", "T_PATH_9": "/srv/do254"}):
                config = load_factory_config(path)
            self.assertEqual([(source.id, source.root_path) for source in config.rag.sources], [("do254", "/srv/do254")])

    def test_source_exclude_additions_accepts_json_array_from_environment(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = self.write_config(
                directory,
                {
                    "rag": {
                        "sources": [
                            {
                                "id": "simics",
                                "rootPath": "/tmp/simics",
                                "excludeAdditions": "${TEST_RAG_EXCLUDES:-[]}",
                            }
                        ]
                    }
                },
            )

            with patch.dict(os.environ, {"TEST_RAG_EXCLUDES": '["**/*.txt","**/win64/**"]'}):
                config = load_factory_config(path)

            self.assertEqual(
                config.rag.sources[0].exclude_additions,
                ["**/*.txt", "**/win64/**"],
            )

    def test_source_exclude_additions_rejects_invalid_environment_value(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = self.write_config(
                directory,
                {
                    "rag": {
                        "sources": [
                            {
                                "id": "simics",
                                "rootPath": "/tmp/simics",
                                "excludeAdditions": "${TEST_RAG_EXCLUDES}",
                            }
                        ]
                    }
                },
            )

            with patch.dict(os.environ, {"TEST_RAG_EXCLUDES": "**/*.txt"}):
                with self.assertRaisesRegex(ValueError, "JSON array of glob strings"):
                    load_factory_config(path)


if __name__ == "__main__":
    unittest.main()
