"""Joern data-flow queries (RQ-0025): the parts that run without Joern."""

from __future__ import annotations

import json
import re
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from aifactory_rag import dataflow
from aifactory_rag.config import dataflow_from_env
from aifactory_rag.dataflow import JoernClient, JoernError, JoernSettings


class Reply:
    def __init__(self, stdout: str = "") -> None:
        self._stdout = stdout

    def json(self) -> dict[str, str]:
        return {"stdout": self._stdout}


class FakeJoern:
    """Stands in for the server: writes what the script would emit."""

    def __init__(self, workspace: Path, result: object | None, stdout: str = "") -> None:
        self.workspace = workspace
        self.result = result
        self.stdout = stdout
        self.scripts: list[str] = []

    def __call__(self, url: str, json: dict[str, str], timeout: float) -> Reply:  # noqa: A002 - httpx's name
        script = json["query"]
        self.scripts.append(script)
        target = re.search(r'os\.Path\("([^"]+)"\)', script).group(1)
        if self.result is not None:
            host = self.workspace / Path(target).relative_to("/workspace")
            host.parent.mkdir(parents=True, exist_ok=True)
            host.write_text(__import__("json").dumps(self.result), encoding="utf-8")
        return Reply(self.stdout)


class ClientTests(unittest.TestCase):
    def setUp(self) -> None:
        self._dir = tempfile.TemporaryDirectory()
        self.workspace = Path(self._dir.name)
        self.client = JoernClient(JoernSettings(workspace=str(self.workspace)))

    def tearDown(self) -> None:
        self._dir.cleanup()

    def test_the_result_is_read_from_the_workspace_and_removed(self) -> None:
        fake = FakeJoern(self.workspace, {"findings": [1]})
        with patch("aifactory_rag.dataflow.httpx.post", fake):
            self.assertEqual(self.client.run("emit(ujson.Obj())"), {"findings": [1]})
        self.assertEqual(list((self.workspace / "out").iterdir()), [])

    def test_a_script_that_emits_nothing_reports_the_compiler_error(self) -> None:
        fake = FakeJoern(self.workspace, None, stdout="-- [E008] Not Found Error: value x is not a member\n1 error found")
        with patch("aifactory_rag.dataflow.httpx.post", fake):
            with self.assertRaisesRegex(JoernError, "Not Found Error"):
                self.client.run("broken")

    def test_a_query_opens_its_graph_and_fails_when_it_is_missing(self) -> None:
        fake = FakeJoern(self.workspace, {"error": "graph rag-x-1 is not available"})
        with patch("aifactory_rag.dataflow.httpx.post", fake):
            with self.assertRaisesRegex(JoernError, "rag-x-1 is not available"):
                self.client.query("rag-x-1", "shared-state", {"isr": "(?i).*tick.*"})
        script = fake.scripts[0]
        self.assertIn('open("rag-x-1")', script)
        self.assertIn('val isrRe = "(?i).*tick.*"', script)  # the source's pattern, as a Scala literal

    def test_an_unknown_query_is_refused(self) -> None:
        with self.assertRaisesRegex(ValueError, "unchecked-input, shared-state, coupling"):
            self.client.query("p", "everything")

    def test_building_names_the_graph_and_deletes_the_inputs_older_ones(self) -> None:
        fake = FakeJoern(self.workspace, {"built": True, "exists": True})
        with patch("aifactory_rag.dataflow.httpx.post", fake):
            self.assertTrue(self.client.ensure_project("rag-gitlab-bc-int-aselsan-bfi-sw-d5dc028f53c2", "/srv/x"))
        self.assertIn('n.startsWith("rag-gitlab-bc-int-aselsan-bfi-sw-")', fake.scripts[0])


class NamingTests(unittest.TestCase):
    def test_one_graph_per_input_and_state(self) -> None:
        name = dataflow.project_name("gitlab.bc.int/aselsan/bfi-sw", "d5dc028f53c2bbac")
        self.assertEqual(name, "rag-gitlab-bc-int-aselsan-bfi-sw-d5dc028f53c2")
        self.assertTrue(name.startswith(dataflow.project_prefix("gitlab.bc.int/aselsan/bfi-sw")))

    def test_a_folders_state_changes_with_its_files(self) -> None:
        files = [("a.c", 10, 1.0), ("b.h", 5, 2.0)]
        self.assertEqual(dataflow.folder_state(files), dataflow.folder_state(list(reversed(files))))
        self.assertNotEqual(dataflow.folder_state(files), dataflow.folder_state([("a.c", 11, 1.0), ("b.h", 5, 2.0)]))


class ConfigTests(unittest.TestCase):
    def test_a_source_is_marked_and_given_its_patterns(self) -> None:
        values = dataflow_from_env("RAG_SOURCE_3", {
            "RAG_SOURCE_3_DATAFLOW": "on",
            "RAG_SOURCE_3_DATAFLOW_SOURCES": "halArinc429Read|halUartReceive",
            "RAG_SOURCE_3_DATAFLOW_ISR": ".*_IRQHandler",
        })
        self.assertEqual(values, {"dataflow": True, "dataflowSources": "halArinc429Read|halUartReceive", "dataflowIsr": ".*_IRQHandler"})
        self.assertEqual(dataflow_from_env("RAG_SOURCE_3", {}), {"dataflow": False})


class AnswerTests(unittest.TestCase):
    def test_questions_are_matched_to_the_prepared_queries(self) -> None:
        self.assertEqual(dataflow.classify("Which variables does the timer ISR share with the main loop?"), ["shared-state"])
        self.assertEqual(dataflow.classify("Is there an unchecked index from the ARINC bus?"), ["unchecked-input"])
        self.assertEqual(dataflow.classify("IOHandlers ile ContextConverter arasındaki data coupling nedir?"), ["coupling"])
        self.assertEqual(dataflow.classify("What does a429EncodeWord do?"), [])

    def test_findings_link_to_gitlab_and_read_as_context(self) -> None:
        finding = {
            "kind": "unchecked-input",
            "sink": {"file": "Development/IOHandlers/io_handler.c", "method": "bfiIoHandlerProcessArinc", "line": 129, "code": "wordLength"},
            "source": {"file": "Development/IOHandlers/io_handler.c", "method": "bfiIoHandlerProcessArinc", "line": 116, "code": "&word"},
            "path": [{"file": "Development/IOHandlers/io_handler.c", "method": "m", "line": 116, "code": "&word"}],
        }
        dataflow._link([finding], "http://gitlab.bc.int/aselsan/bfi-sw", "d5dc028f")
        text, anchor = dataflow.describe(finding)
        self.assertEqual(anchor["webUrl"], "http://gitlab.bc.int/aselsan/bfi-sw/-/blob/d5dc028f/Development/IOHandlers/io_handler.c#L129")
        self.assertIn("no bound check", text)
        self.assertIn("io_handler.c:116", text)


if __name__ == "__main__":
    unittest.main()
