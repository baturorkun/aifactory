"""One chunk per rule of a coding standard (RQ-0052).

`factory standard import` turns a standard's Word document into
`<group>.rules.md` files: a heading line `# <standard> <version> — group …`,
then one `## C-045 | Safety | misra, do178c` section per rule with its
**Description**, **Rationale**, **MISRA** rule, **Example** and **Notes**. A
rule is the unit a question asks for ("what does C-045 say", "the essential
type assignment rule"), so each section is its own chunk whatever its length,
carrying the rule id, standard, groups, class and MISRA rule in its metadata.
The example code is stored with the rule but not embedded: a dozen lines of
C would outweigh the sentence that is the rule.
"""

from __future__ import annotations

import re

from aifactory_rag.ingest.code_chunker import CodeChunk

RULES_CHUNKER = "rules-v1"
RULES_SUFFIX = ".rules.md"

_TITLE = re.compile(r"^# (\S+) (\S+) ")
_RULE = re.compile(r"^## ([A-Z]+-\d{3}) \| ([^|]+?) \| (.+?)\s*$")
_FIELD = re.compile(r"^\*\*([A-Za-z ]+):\*\*\s*(.*)$")


def is_rules_file(relative_path: str) -> bool:
    return relative_path.lower().endswith(RULES_SUFFIX)


def chunk_rules(text: str, relative_path: str, chunk_size: int) -> list[CodeChunk]:
    del chunk_size  # a rule is one chunk however long its example is
    lines = text.splitlines()
    standard = version = None
    if lines:
        title = _TITLE.match(lines[0])
        if title:
            standard, version = title.group(1), title.group(2)
    chunks: list[CodeChunk] = []
    index = 0
    while index < len(lines):
        head = _RULE.match(lines[index])
        if not head:
            index += 1
            continue
        start = index
        index += 1
        while index < len(lines) and not _RULE.match(lines[index]):
            index += 1
        body = lines[start + 1:index]
        while body and not body[-1].strip():
            body.pop()
        rule_id, cls, groups = head.group(1), head.group(2).strip(), [g.strip() for g in head.group(3).split(",")]
        misra: list[str] = []
        for line in body:
            field = _FIELD.match(line)
            if field and field.group(1) == "MISRA":
                misra = [part.strip() for part in field.group(2).split(",") if part.strip()]
        section = "\n".join(body).strip("\n")
        chunks.append(CodeChunk(
            f"{relative_path} > {rule_id}\n\n{lines[start]}\n\n{section}",
            {
                "section": rule_id,
                "ruleId": rule_id,
                # The identifier a question names ("what does C-045 say"): the
                # retriever looks a chunk up by metadata.requirement (RQ-0038).
                "requirement": rule_id,
                "standard": standard,
                "version": version,
                "groups": groups,
                "class": cls,
                "misra": misra or None,
                "startLine": start + 1,
                "endLine": start + 1 + len(body),
            },
            embedding_text=f"{rule_id} {cls}\n{_without_example(body)}",
        ))
    return [CodeChunk(c.text, {k: v for k, v in c.metadata.items() if v is not None}, c.embedding_text) for c in chunks]


def _without_example(body: list[str]) -> str:
    kept: list[str] = []
    skipping = False
    for line in body:
        field = _FIELD.match(line)
        if field:
            skipping = field.group(1) == "Example"
        if not skipping and line.strip():
            kept.append(line)
    return "\n".join(kept)
