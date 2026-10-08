"""Paths a question leaves out (RQ-0034).

A requirement grounded against its own corpus finds its own file first: the
project repository holds `requirements/`, and the requirement text is the
question. `excludePaths` takes globs matched against a document's path inside
its input (the folder or the repository) and turns them into anchored regular
expressions both PostgreSQL (`~`) and Python's `re` read the same way.
"""

from __future__ import annotations

import re


def glob_to_regex(pattern: str) -> str:
    """`**` spans directories, `*` and `?` stay within one; anchored at both ends."""
    pattern = pattern.strip().removeprefix("./")
    out: list[str] = []
    index = 0
    while index < len(pattern):
        if pattern.startswith("**/", index):
            out.append("(.*/)?")
            index += 3
        elif pattern.startswith("**", index):
            out.append(".*")
            index += 2
        elif pattern[index] == "*":
            out.append("[^/]*")
            index += 1
        elif pattern[index] == "?":
            out.append("[^/]")
            index += 1
        else:
            out.append(re.escape(pattern[index]))
            index += 1
    return "^" + "".join(out) + "$"


def exclusion_regexes(patterns: list[str] | None) -> list[str]:
    return [glob_to_regex(pattern) for pattern in patterns or [] if pattern.strip()]


def excluded(relative_path: str, regexes: list[str]) -> bool:
    return any(re.search(regex, relative_path) for regex in regexes)
