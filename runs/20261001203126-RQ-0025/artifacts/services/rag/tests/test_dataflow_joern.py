"""The prepared queries against a running Joern (RQ-0025 acceptance fixtures).

Runs only where Joern is reachable: set RAG_JOERN_URL and RAG_JOERN_WORKSPACE
(on the RAG host: http://127.0.0.1:8090 and /srv/rag-sources/joern).
"""

from __future__ import annotations

import os
import shutil
import unittest
from pathlib import Path

from aifactory_rag.dataflow import JoernClient, JoernSettings

URL = os.environ.get("RAG_JOERN_URL")
WORKSPACE = os.environ.get("RAG_JOERN_WORKSPACE")
FIXTURES = Path(__file__).parent / "fixtures" / "dataflow"


@unittest.skipUnless(URL and WORKSPACE, "needs a running Joern (RAG_JOERN_URL, RAG_JOERN_WORKSPACE)")
class JoernFixtureTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.client = JoernClient(JoernSettings(url=URL, workspace=WORKSPACE))
        target = Path(WORKSPACE) / "fixtures-test"
        shutil.rmtree(target, ignore_errors=True)
        shutil.copytree(FIXTURES, target)
        for name in ("unchecked", "shared", "coupling"):
            cls.client.ensure_project(f"test-fixture-{name}-1", f"/workspace/fixtures-test/{name}")

    def test_unchecked_input_reports_the_unchecked_index_and_size_not_the_checked_one(self) -> None:
        result = self.client.query("test-fixture-unchecked-1", "unchecked-input")
        sinks = {(f["sink"]["method"], f["sink"]["line"]) for f in result["findings"]}
        self.assertEqual(sinks, {("storeLabelUnchecked", 16), ("copyFrame", 39)})
        self.assertGreaterEqual(result["checked"], 1)
        path = next(f for f in result["findings"] if f["sink"]["line"] == 16)["path"]
        self.assertEqual((path[0]["line"], path[-1]["line"]), (13, 16))  # from the read to the index

    def test_shared_state_reports_the_shared_variables_and_the_non_volatile_one(self) -> None:
        findings = {f["variable"]: f for f in self.client.query("test-fixture-shared-1", "shared-state")["findings"]}
        self.assertEqual(set(findings), {"tickCount", "tickFlag"})  # `untouched` is never written in the ISR
        self.assertFalse(findings["tickCount"]["volatile"])
        self.assertTrue(findings["tickFlag"]["volatile"])
        accesses = {(a["method"], a["access"], a["inInterrupt"]) for a in findings["tickCount"]["accesses"]}
        self.assertEqual(accesses, {("TIMER_IRQHandler", "write", True), ("mainLoop", "read", False)})

    def test_coupling_lists_the_exchanged_data_and_the_conditional_call(self) -> None:
        findings = {(f["from"], f["to"]): f for f in self.client.query("test-fixture-coupling-1", "coupling")["findings"]}
        call = findings[("radio", "display")]["calls"][0]
        self.assertEqual((call["method"], call["callee"], call["conditional"]), ("radioPoll", "displayUpdate", True))
        self.assertTrue(call["returnUsed"])
        self.assertEqual([g["variable"] for g in findings[("display", "radio")]["globals"]], ["radioLastWord"])
        only = self.client.query("test-fixture-coupling-1", "coupling", {"component": "display"})["findings"]
        self.assertTrue(all("display" in (f["from"], f["to"]) for f in only))


if __name__ == "__main__":
    unittest.main()
