"""The prepared queries against a running Joern (RQ-0025 and RQ-0032 acceptance fixtures).

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
        # graphs of an earlier run would hide a changed fixture
        cls.client.run('workspace.projects.map(_.name).filter(_.startsWith("test-fixture-")).toList.foreach(n => delete(n))\nemit(ujson.Obj())')
        for name in ("unchecked", "shared", "coupling"):
            cls.client.ensure_project(f"test-fixture-{name}-1", f"/workspace/fixtures-test/{name}")
        cls.client.ensure_project("test-fixture-unchecked-js-1-js", "/workspace/fixtures-test/unchecked-js", family="js")
        cls.client.ensure_project("test-fixture-unchecked-cs-1-cs", "/workspace/fixtures-test/unchecked-cs", family="cs")

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

    def test_typescript_offsets_and_sizes_read_from_a_file_unchecked_and_not_the_checked_one(self) -> None:
        result = self.client.query("test-fixture-unchecked-js-1-js", "unchecked-input", family="js")
        sinks = {(f["sink"]["method"], f["sink"]["line"]) for f in result["findings"]}
        # new Array(count), bytes[table + i], buf.slice(4, 4 + len); not the bounded subarray
        self.assertEqual(sinks, {("parseGlyphs", 8), ("parseGlyphs", 11), ("sliceRecord", 28)})
        self.assertGreaterEqual(result["checked"], 1)
        index = next(f for f in result["findings"] if f["sink"]["line"] == 11)
        self.assertEqual(index["source"]["code"], "view.getUint32(8)")

    def test_csharp_bus_values_reaching_an_index_or_a_copy_unchecked_and_not_the_checked_one(self) -> None:
        result = self.client.query("test-fixture-unchecked-cs-1-cs", "unchecked-input", family="cs")
        sinks = {(f["sink"]["method"], f["sink"]["line"]) for f in result["findings"]}
        # shadow[index], Array.Copy(..., (int)value), a register writeCallback's slots[val]
        self.assertEqual(sinks, {("WriteDoubleWord", 11), ("WriteDoubleWord", 13), ("<lambda>0", 10)})
        self.assertEqual(result["checked"], 1)  # WriteWord bounds its index
        index = next(f for f in result["findings"] if f["sink"]["line"] == 11)
        # lines as in the file: the frontend's 0-based numbers are shifted
        self.assertEqual((index["source"]["line"], index["via"]), (8, ["index"]))


if __name__ == "__main__":
    unittest.main()
