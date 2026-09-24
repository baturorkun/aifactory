"""The claude-cli answer provider: how it invokes the CLI and how it fails.

The CLI is never actually started here. What matters is the shape of the call
(a print-mode completion with every tool denied) and that the JSON envelope,
not the exit code, decides success: an unauthenticated run exits 0 and reports
itself inside the envelope.
"""

from __future__ import annotations

import json
import subprocess
import unittest
from unittest import mock

from aifactory_rag.config import RagConfig, RagLlmConfig
from aifactory_rag.query import responder


def _config(**llm: object) -> RagConfig:
    return RagConfig(llm=RagLlmConfig(provider="claude-cli", model="claude-opus-5", **llm))


def _completed(stdout: str, returncode: int = 0, stderr: str = "") -> subprocess.CompletedProcess:
    return subprocess.CompletedProcess(args=[], returncode=returncode, stdout=stdout, stderr=stderr)


ENVELOPE = json.dumps({"result": "  the answer  ", "is_error": False})


class ClaudeCliResponderTests(unittest.TestCase):
    def test_builds_a_tool_free_print_mode_call_and_returns_the_result(self) -> None:
        with mock.patch.object(responder.subprocess, "run", return_value=_completed(ENVELOPE)) as run:
            answer = responder._complete_with_claude_cli(_config(), "QUESTION AND CONTEXT")

        self.assertEqual(answer, "the answer")
        command = run.call_args.args[0]
        self.assertEqual(command[0], "claude")
        self.assertIn("--print", command)
        self.assertEqual(command[command.index("--output-format") + 1], "json")
        self.assertEqual(command[command.index("--model") + 1], "claude-opus-5")
        self.assertEqual(command[command.index("--permission-prompts") + 1], "none")
        denied = command[command.index("--disallowedTools") + 1]
        for tool in ("Bash", "Edit", "Write", "Read", "WebFetch"):
            self.assertIn(tool, denied)
        # The prompt goes in on stdin, so its size is not an argument-list limit.
        self.assertEqual(run.call_args.kwargs["input"], "QUESTION AND CONTEXT")
        self.assertIn("aifactory-rag-claude-cli-", run.call_args.kwargs["cwd"])

    def test_honours_a_configured_executable_and_timeout(self) -> None:
        config = _config(executable="/opt/bin/claude", timeoutSeconds=12.5)
        with mock.patch.object(responder.subprocess, "run", return_value=_completed(ENVELOPE)) as run:
            responder._complete_with_claude_cli(config, "Q")

        self.assertEqual(run.call_args.args[0][0], "/opt/bin/claude")
        self.assertEqual(run.call_args.kwargs["timeout"], 12.5)

    def test_an_error_envelope_fails_even_though_the_exit_code_is_zero(self) -> None:
        envelope = json.dumps({"result": "Not logged in · Please run /login", "is_error": True})
        with mock.patch.object(responder.subprocess, "run", return_value=_completed(envelope)):
            with self.assertRaisesRegex(RuntimeError, "Not logged in"):
                responder._complete_with_claude_cli(_config(), "Q")

    def test_a_missing_executable_is_reported_as_a_setup_problem(self) -> None:
        with mock.patch.object(responder.subprocess, "run", side_effect=FileNotFoundError()):
            with self.assertRaisesRegex(RuntimeError, "Install Claude Code on the host"):
                responder._complete_with_claude_cli(_config(), "Q")

    def test_a_timeout_names_the_limit(self) -> None:
        error = subprocess.TimeoutExpired(cmd="claude", timeout=300.0)
        with mock.patch.object(responder.subprocess, "run", side_effect=error):
            with self.assertRaisesRegex(RuntimeError, "did not answer within 300"):
                responder._complete_with_claude_cli(_config(), "Q")

    def test_non_json_output_is_rejected(self) -> None:
        with mock.patch.object(responder.subprocess, "run", return_value=_completed("not json at all")):
            with self.assertRaisesRegex(RuntimeError, "did not return JSON"):
                responder._complete_with_claude_cli(_config(), "Q")

    def test_a_nonzero_exit_reports_stderr(self) -> None:
        failed = _completed("", returncode=2, stderr="something broke")
        with mock.patch.object(responder.subprocess, "run", return_value=failed):
            with self.assertRaisesRegex(RuntimeError, "exited with 2: something broke"):
                responder._complete_with_claude_cli(_config(), "Q")

    def test_the_first_call_seeds_a_session_and_later_calls_fork_it(self) -> None:
        """One seed per source set: cheap prefix reuse without accumulating history."""
        responder._CLAUDE_CLI_SEEDS.clear()
        first = json.dumps({"result": "one", "is_error": False, "session_id": "SEED-1"})
        later = json.dumps({"result": "two", "is_error": False, "session_id": "FORK-9"})
        with mock.patch.object(
            responder.subprocess, "run",
            side_effect=[_completed(first), _completed(later)],
        ) as run:
            responder._complete_with_claude_cli(_config(), "Q1", session_key="renode")
            responder._complete_with_claude_cli(_config(), "Q2", session_key="renode")

        opening, forking = (call.args[0] for call in run.call_args_list)
        self.assertNotIn("--resume", opening)
        self.assertEqual(forking[forking.index("--resume") + 1], "SEED-1")
        self.assertIn("--fork-session", forking)
        # The fork's own session id must not replace the seed, or the prefix
        # would drift and grow with every answer.
        self.assertEqual(responder._CLAUDE_CLI_SEEDS["renode"], "SEED-1")
        # Sessions are directory-scoped, so both calls must share one stable cwd.
        cwds = {call.kwargs["cwd"] for call in run.call_args_list}
        self.assertEqual(len(cwds), 1)

    def test_each_source_set_gets_its_own_seed(self) -> None:
        responder._CLAUDE_CLI_SEEDS.clear()
        a = json.dumps({"result": "a", "is_error": False, "session_id": "SEED-A"})
        b = json.dumps({"result": "b", "is_error": False, "session_id": "SEED-B"})
        with mock.patch.object(
            responder.subprocess, "run", side_effect=[_completed(a), _completed(b)],
        ) as run:
            responder._complete_with_claude_cli(_config(), "Q", session_key="renode")
            responder._complete_with_claude_cli(_config(), "Q", session_key="aselsan-bfi")

        self.assertEqual(responder._CLAUDE_CLI_SEEDS, {"renode": "SEED-A", "aselsan-bfi": "SEED-B"})
        self.assertEqual(len({call.kwargs["cwd"] for call in run.call_args_list}), 2)

    def test_a_lost_seed_falls_back_to_a_clean_session(self) -> None:
        """After a host restart the seed is gone; the answer must still arrive."""
        responder._CLAUDE_CLI_SEEDS.clear()
        responder._CLAUDE_CLI_SEEDS["renode"] = "STALE"
        good = json.dumps({"result": "recovered", "is_error": False, "session_id": "SEED-NEW"})
        with mock.patch.object(
            responder.subprocess, "run",
            side_effect=[_completed("", returncode=1, stderr="no such session"), _completed(good)],
        ) as run:
            answer = responder._complete_with_claude_cli(_config(), "Q", session_key="renode")

        self.assertEqual(answer, "recovered")
        self.assertEqual(responder._CLAUDE_CLI_SEEDS["renode"], "SEED-NEW")
        self.assertNotIn("--resume", run.call_args_list[1].args[0])

    def test_effort_is_passed_only_when_configured(self) -> None:
        responder._CLAUDE_CLI_SEEDS.clear()
        ok = json.dumps({"result": "a", "is_error": False, "session_id": "S"})
        with mock.patch.object(responder.subprocess, "run", return_value=_completed(ok)) as run:
            responder._complete_with_claude_cli(_config(effort="medium"), "Q", session_key="e1")
        command = run.call_args.args[0]
        self.assertEqual(command[command.index("--effort") + 1], "medium")

        responder._CLAUDE_CLI_SEEDS.clear()
        with mock.patch.object(responder.subprocess, "run", return_value=_completed(ok)) as run:
            responder._complete_with_claude_cli(_config(), "Q", session_key="e2")
        self.assertNotIn("--effort", run.call_args.args[0])

    def test_a_blank_effort_means_the_cli_default(self) -> None:
        self.assertIsNone(_config(effort="").llm.effort)

    def test_the_provider_is_selected_by_configuration(self) -> None:
        """A claude-cli project must not fall through to an API client."""
        chunk = responder.RetrievedChunk(
            chunk_id=1, document_id=1, source_id="s", relative_path="doc.md",
            text="CONTEXT", score=0.9, metadata={},
        )
        with mock.patch.object(responder, "_complete_with_claude_cli", return_value="ok") as selected:
            answer = responder._generate_answer(_config(), "QUESTION", [chunk])

        self.assertEqual(answer, "ok")
        selected.assert_called_once()
        prompt = selected.call_args.args[1]
        self.assertEqual(selected.call_args.kwargs["session_key"], "s")
        self.assertIn("QUESTION", prompt)
        self.assertIn("CONTEXT", prompt)


if __name__ == "__main__":
    unittest.main()
