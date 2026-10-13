"""DOORS modules exported through a DOORS client over SSH (RQ-0037).

The lab below stands in for the DOORS server and the Windows PCs: it answers the ssh and scp
commands the service runs, keeps each client's files in a directory, and plays
doors.exe from the files the service copied there.
"""

from __future__ import annotations

import base64
import json
import os
import re
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from aifactory_rag.config import RagDoorsConfig, doors_entries_from_env, load_factory_config
from aifactory_rag.ingest.doors_inputs import SSH_OPTIONS, DoorsInput, DoorsInputError, doors_inputs, sync_doors
from aifactory_rag.status import summarize

PASSWORD = "s3cret-doors-password"
SERVER = "svc@192.168.2.101"  # the DOORS server itself, where its client runs
BS010, BS011 = "reader@192.168.1.57", "reader@192.168.1.111"
MODULES = {
    "/FCS/Software/FCS_SRS": 3,
    "/FCS/Software/Türkçe Gereksinimler": 2,
    "/FCS/Templates/SRS Template": 1,
    "/OTHER/Notes": 1,
}


def export_text(name: str, objects: int) -> str:
    rows = [{"kind": "module", "path": name, "name": name.rsplit("/", 1)[-1], "prefix": "R-"}]
    rows += [{"kind": "object", "id": f"R-{n}", "absno": n, "level": 1, "shape": "object", "heading": "", "text": f"Requirement {n} of {name}."} for n in range(1, objects + 1)]
    return "".join(json.dumps(row, ensure_ascii=False) + "\n" for row in rows)


class Lab:
    def __init__(self, root: Path, away: tuple[str, ...] = (), login_error: str = "") -> None:
        self.root = root
        self.away = set(away)
        self.login_error = login_error
        self.modules = dict(MODULES)
        self.commands: list[list[str]] = []
        self.jobs: list[tuple[str, dict]] = []
        self.selected: list[str] = []
        self.lose_objects = 0

    def contacted(self) -> list[str]:
        return list(dict.fromkeys(self._client(command) for command in self.commands))

    def left_on(self, client: str) -> list[str]:
        home = self.root / client
        return sorted(str(path.relative_to(home)) for path in home.rglob("*") if path.is_file()) if home.exists() else []

    def _client(self, command: list[str]) -> str:
        if command[0] == "ssh":
            return command[len(SSH_OPTIONS) + 1]
        return next(argument.split(":", 1)[0] for argument in command if re.match(r"^[^/\s]+@[^:]+:", argument))

    def __call__(self, command: list[str], **kwargs: object) -> "subprocess.CompletedProcess[str]":
        self.commands.append(command)
        client = self._client(command)
        if client in self.away:
            return subprocess.CompletedProcess(command, 255, "", f"ssh: connect to host {client.split('@')[1]} port 22: Connection refused\n")
        home = self.root / client
        if command[0] == "scp":
            *sources, target = [argument for argument in command[1:] if argument not in SSH_OPTIONS and argument not in {"-q", "-r"}]
            if target.startswith(f"{client}:"):
                remote = home / target.split(":", 1)[1]
                for source in sources:
                    shutil.copy(source, remote / Path(source).name if target.endswith("/") else remote)
            else:
                remote = home / sources[0].split(":", 1)[1]
                if remote.is_dir():
                    shutil.copytree(remote, Path(target) / remote.name)
                else:
                    shutil.copy(remote, Path(target) / remote.name)
            return subprocess.CompletedProcess(command, 0, "", "")
        if "-EncodedCommand" in command:
            script = base64.b64decode(command[-1]).decode("utf-16-le")
            directory = home / re.search(r"'(aifactory-doors[^']+)'", script).group(1).replace("\\", "/")
            if "New-Item" in script:
                directory.mkdir(parents=True)
            elif "Remove-Item" in script:
                shutil.rmtree(directory, ignore_errors=True)
            return subprocess.CompletedProcess(command, 0, "", "")
        # doors.exe, as run.ps1 starts it
        job = json.loads(str(kwargs["input"]))
        directory = home / Path(command[-1].replace("\\", "/")).parent
        self.jobs.append((client, job))
        if self.login_error:
            answer = {"ok": False, "timedOut": False, "exitCode": 1, "log": f"-E- DOORS: {self.login_error} (tried {job['password']})", "error": ""}
            return subprocess.CompletedProcess(command, 0, json.dumps(answer) + "\n", "")
        if job["mode"] == "list":
            lines = []
            for path in (directory / "paths.txt").read_text(encoding="utf-8").splitlines():
                found = [name for name in self.modules if name == path or name.startswith(path.rstrip("/") + "/")]
                lines += [f"M\t{name}" for name in found] or [f"E\t{path}"]
            (directory / "out" / "modules.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")
        else:
            self.selected = (directory / "selected.txt").read_text(encoding="utf-8").splitlines()
            report = []
            for number, name in enumerate(self.selected, start=1):
                (directory / "out" / f"m{number}.jsonl").write_text(export_text(name, self.modules[name] - self.lose_objects), encoding="utf-8")
                report.append(f"{number}\t{self.modules[name]}\t{name}")
            (directory / "out" / "export.txt").write_text("\n".join(report) + "\n", encoding="utf-8")
        (directory / "out" / f"{job['mode']}.ok").write_text("ok\n")
        answer = {"ok": True, "timedOut": False, "exitCode": 0, "log": "", "error": ""}
        return subprocess.CompletedProcess(command, 0, "noise before the answer\n" + json.dumps(answer) + "\n", "")


class SyncTests(unittest.TestCase):
    def setUp(self) -> None:
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        root = Path(self.directory.name)
        self.lab_root = root / "lab"
        self.config = RagDoorsConfig(clients=f"{BS010}, {BS011}", mirrorDir=str(root / "mirror"))
        self.entry = DoorsInput(
            entry="RAG_SOURCE_3_DOORS_1", key="doors:36677@192.168.2.101", database="36677@192.168.2.101",
            client=SERVER, user="reader", password_env="RAG_SOURCE_3_DOORS_1_PASSWORD", paths=("/FCS",), exclude=("**/TEMPLATES/**",),
        )
        self.environ = {"RAG_SOURCE_3_DOORS_1_PASSWORD": PASSWORD}

    def sync(self, lab: Lab, **changes: object):
        config = self.config.model_copy(update=changes) if changes else self.config
        return sync_doors("fcs", self.entry, config, self.environ, run=lab)

    def test_the_export_runs_on_the_doors_server_itself_when_no_other_client_is_named(self) -> None:
        lab = Lab(self.lab_root)
        tree = self.sync(lab, clients="")

        self.assertEqual(tree.client, SERVER)
        self.assertEqual(lab.contacted(), [SERVER])
        self.assertEqual(len(tree.files), 2)
        self.assertEqual(lab.left_on(SERVER), [])

    def test_the_selected_modules_are_exported_and_mirrored_by_their_full_name(self) -> None:
        lab = Lab(self.lab_root)
        tree = self.sync(lab)

        self.assertEqual((tree.client, tree.listed), (BS010, 3))
        self.assertEqual(
            [file.relative_path for file in tree.files],
            ["FCS/Software/FCS_SRS.doors.jsonl", "FCS/Software/Türkçe Gereksinimler.doors.jsonl"],
        )
        self.assertEqual(tree.files[0].path.read_text(encoding="utf-8"), export_text("/FCS/Software/FCS_SRS", 3))
        self.assertEqual(tree.files[0].path.stat().st_mode & 0o777, 0o600)
        self.assertEqual(lab.contacted(), [BS010])

    def test_modules_matched_by_exclude_are_listed_but_not_exported(self) -> None:
        lab = Lab(self.lab_root)
        self.sync(lab)
        self.assertEqual(lab.selected, ["/FCS/Software/FCS_SRS", "/FCS/Software/Türkçe Gereksinimler"])

    def test_the_password_reaches_the_runner_on_stdin_and_is_on_no_command_line(self) -> None:
        lab = Lab(self.lab_root)
        self.sync(lab)
        self.assertEqual({job["password"] for _, job in lab.jobs}, {PASSWORD})
        self.assertEqual([job["mode"] for _, job in lab.jobs], ["list", "export"])
        self.assertFalse([command for command in lab.commands if any(PASSWORD in argument for argument in command)])

    def test_the_working_directory_is_removed_after_an_export(self) -> None:
        lab = Lab(self.lab_root)
        self.sync(lab)
        self.assertEqual(lab.left_on(BS010), [])

    def test_a_client_that_refuses_the_connection_is_stepped_over(self) -> None:
        lab = Lab(self.lab_root, away=(BS010,))
        tree = self.sync(lab)
        self.assertEqual(tree.client, BS011)
        self.assertEqual(len(tree.files), 2)

    def test_no_client_answering_names_them_all(self) -> None:
        with self.assertRaisesRegex(DoorsInputError, "no DOORS client answered.*192.168.1.57.*192.168.1.111"):
            self.sync(Lab(self.lab_root, away=(BS010, BS011)))

    def test_a_doors_error_is_not_tried_on_the_next_client(self) -> None:
        lab = Lab(self.lab_root, login_error="Invalid username or password")
        with self.assertRaises(DoorsInputError) as raised:
            self.sync(lab)

        message = str(raised.exception)
        self.assertIn("Invalid username or password", message)
        self.assertIn(BS010, message)
        self.assertNotIn(PASSWORD, message)
        self.assertEqual(lab.contacted(), [BS010])
        self.assertEqual(len(lab.jobs), 1)  # one login
        self.assertEqual(lab.left_on(BS010), [])  # tidied up after a failure too

    def test_a_path_the_database_does_not_have_is_named(self) -> None:
        self.entry = DoorsInput(**{**self.entry.__dict__, "paths": ("/FCS", "/MISSING")})
        with self.assertRaisesRegex(DoorsInputError, "no /MISSING .RAG_SOURCE_3_DOORS_1_PATHS."):
            self.sync(Lab(self.lab_root))

    def test_an_unchanged_module_keeps_its_file_and_a_removed_one_leaves_the_mirror(self) -> None:
        lab = Lab(self.lab_root)
        first = self.sync(lab)
        for file in first.files:
            os.utime(file.path, (1_700_000_000, 1_700_000_000))

        lab.modules["/FCS/Software/FCS_SRS"] = 4  # a requirement was added
        del lab.modules["/FCS/Software/Türkçe Gereksinimler"]
        lab.modules["/FCS/Software/FCS_ICD"] = 1
        second = self.sync(lab)

        by_path = {file.relative_path: file for file in second.files}
        self.assertEqual(sorted(by_path), ["FCS/Software/FCS_ICD.doors.jsonl", "FCS/Software/FCS_SRS.doors.jsonl"])
        self.assertNotEqual(by_path["FCS/Software/FCS_SRS.doors.jsonl"].modified_timestamp, 1_700_000_000)
        self.assertFalse((second.root / "FCS/Software/Türkçe Gereksinimler.doors.jsonl").exists())

        third = self.sync(lab)
        self.assertEqual(
            [file.modified_timestamp for file in third.files],
            [file.modified_timestamp for file in second.files],
        )

    def test_an_export_with_fewer_objects_than_reported_is_refused_and_the_mirror_kept(self) -> None:
        lab = Lab(self.lab_root)
        first = self.sync(lab)
        before = {file.relative_path: file.path.read_bytes() for file in first.files}

        lab.lose_objects = 1
        with self.assertRaisesRegex(DoorsInputError, "incomplete: 2 objects .* fetched, 3 .* written"):
            self.sync(lab)
        self.assertEqual({file.relative_path: file.path.read_bytes() for file in first.files}, before)
        self.assertEqual(lab.left_on(BS010), [])

    def test_no_selected_module_empties_the_mirror(self) -> None:
        lab = Lab(self.lab_root)
        self.sync(lab)
        self.entry = DoorsInput(**{**self.entry.__dict__, "exclude": ("**",)})
        tree = self.sync(lab)
        self.assertEqual((tree.files, tree.listed), ([], 3))
        self.assertEqual([path for path in tree.root.rglob("*") if path.is_file()], [])

    def test_no_password_fails_before_any_connection(self) -> None:
        lab = Lab(self.lab_root)
        self.environ = {}
        with self.assertRaisesRegex(DoorsInputError, "RAG_SOURCE_3_DOORS_1_PASSWORD is not set"):
            self.sync(lab)
        self.assertEqual(lab.commands, [])


class ConfigTests(unittest.TestCase):
    ENV = {
        "RAG_SOURCE_1_ID": "fcs",
        "RAG_SOURCE_1_DOORS_1_SERVER": "192.168.2.101",
        "RAG_SOURCE_1_DOORS_1_USER": "reader",
        "RAG_SOURCE_1_DOORS_1_PASSWORD": PASSWORD,
    }

    def _load(self, env: dict[str, str]):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "factory.config.json"
            path.write_text(json.dumps({"rag": {
                "sources": [{"id": "${RAG_SOURCE_1_ID:-source-1}", "rootPath": "${RAG_SOURCE_1_PATH:-}", "envPrefix": "RAG_SOURCE_1"}],
                "doors": {"clients": "${RAG_DOORS_CLIENTS:-}", "timeoutSeconds": "${RAG_DOORS_TIMEOUT_SECONDS:-600}"},
            }}), encoding="utf-8")
            with patch.dict(os.environ, env, clear=True):
                return load_factory_config(path).rag

    def test_a_slot_with_only_a_doors_entry_is_a_source(self) -> None:
        rag = self._load({**self.ENV, "RAG_SOURCE_1_DOORS_1_SSH_USER": "LAB\\svc"})

        [source] = rag.sources
        [entry] = doors_inputs(source)
        self.assertEqual(
            (entry.entry, entry.key, entry.database, entry.client, entry.user, entry.password_env, entry.paths, entry.exclude),
            ("RAG_SOURCE_1_DOORS_1", "doors:36677@192.168.2.101", "36677@192.168.2.101", "LAB\\svc@192.168.2.101", "reader",
             "RAG_SOURCE_1_DOORS_1_PASSWORD", ("/",), ()),
        )
        self.assertEqual((rag.doors.clients, rag.doors.timeout_seconds), ("", 600.0))

    def test_the_server_is_an_address_with_the_port_only_when_it_is_not_the_usual_one(self) -> None:
        def entry(server: str) -> tuple[str, str]:
            found = doors_entries_from_env("RAG_SOURCE_1", "fcs", {**self.ENV, "RAG_SOURCE_1_DOORS_1_SERVER": server})["doors"][0]
            return found["database"], found["client"]

        self.assertEqual(entry("192.168.2.101"), ("36677@192.168.2.101", "192.168.2.101"))
        self.assertEqual(entry("doors.lab.example:36700"), ("36700@doors.lab.example", "doors.lab.example"))
        self.assertEqual(entry("36677@192.168.2.101"), ("36677@192.168.2.101", "192.168.2.101"))  # as DOORS writes it
        for wrong in ("192.168.2.101:port", "http://192.168.2.101", "@192.168.2.101"):
            with self.assertRaisesRegex(ValueError, "RAG_SOURCE_1_DOORS_1_SERVER=.* is not a server address"):
                entry(wrong)

    def test_other_pcs_can_be_named_as_clients(self) -> None:
        self.assertEqual(self._load({**self.ENV, "RAG_DOORS_CLIENTS": BS010}).doors.clients, BS010)

    def test_the_loaded_configuration_holds_the_password_variable_never_the_password(self) -> None:
        rag = self._load(self.ENV)
        self.assertNotIn(PASSWORD, json.dumps([source.model_dump(by_alias=True) for source in rag.sources]))

    def test_paths_and_excludes_are_json_arrays(self) -> None:
        entry = doors_entries_from_env("RAG_SOURCE_1", "fcs", {
            **self.ENV, "RAG_SOURCE_1_DOORS_1_PATHS": '["/FCS", "/OTHER/Notes"]', "RAG_SOURCE_1_DOORS_1_EXCLUDE": '["**/TEMPLATES/**"]',
        })["doors"][0]
        self.assertEqual((entry["paths"], entry["exclude"]), (["/FCS", "/OTHER/Notes"], ["**/TEMPLATES/**"]))

        for variable, value in (("PATHS", "/FCS"), ("EXCLUDE", '{"a": 1}'), ("PATHS", '["FCS"]')):
            with self.assertRaisesRegex(ValueError, f"RAG_SOURCE_1_DOORS_1_{variable}"):
                doors_entries_from_env("RAG_SOURCE_1", "fcs", {**self.ENV, f"RAG_SOURCE_1_DOORS_1_{variable}": value})

    def test_an_incomplete_entry_names_the_missing_variable(self) -> None:
        env = {key: value for key, value in self.ENV.items() if not key.endswith("_PASSWORD")}
        with self.assertRaisesRegex(ValueError, "RAG_SOURCE_1_DOORS_1 is incomplete, RAG_SOURCE_1_DOORS_1_PASSWORD not set"):
            doors_entries_from_env("RAG_SOURCE_1", "fcs", env)

    def test_a_database_is_listed_once_in_a_slot(self) -> None:
        env = {**self.ENV, "RAG_SOURCE_1_DOORS_2_SERVER": "192.168.2.101:36677", "RAG_SOURCE_1_DOORS_2_USER": "reader", "RAG_SOURCE_1_DOORS_2_PASSWORD": "x"}
        with self.assertRaisesRegex(ValueError, "RAG_SOURCE_1_DOORS_2_SERVER.*is also RAG_SOURCE_1_DOORS_1_SERVER"):
            doors_entries_from_env("RAG_SOURCE_1", "fcs", env)

    def test_a_slot_without_a_doors_entry_is_as_before(self) -> None:
        rag = self._load({"RAG_SOURCE_1_ID": "docs", "RAG_SOURCE_1_PATH": "/mnt/docs"})
        self.assertEqual(rag.sources[0].doors, [])


class StatusTests(unittest.TestCase):
    def test_a_doors_entry_is_listed_with_its_database_and_paths(self) -> None:
        from datetime import datetime, timezone

        checked = datetime(2026, 10, 12, 18, 0, tzinfo=timezone.utc)
        inputs = [{
            "source_id": "fcs", "input_key": "doors:36677@192.168.2.101", "url": "36677@192.168.2.101", "ref": "/FCS",
            "commit_sha": "", "committed_at": None, "ingested_at": checked, "file_count": 2,
        }]
        changes = [{"source_id": "fcs", "input_key": "doors:36677@192.168.2.101", "documents": 2, "last_change": checked}]

        [item] = summarize(["fcs"], [], [], inputs, [], changes=changes)[0]["inputs"]

        self.assertEqual(
            {key: item.get(key) for key in ("kind", "label", "database", "paths", "documents", "checkedAt")},
            {"kind": "doors", "label": "doors: 192.168.2.101", "database": "36677@192.168.2.101", "paths": "/FCS",
             "documents": 2, "checkedAt": checked.isoformat()},
        )
        self.assertNotIn("commit", item)


if __name__ == "__main__":
    unittest.main()
