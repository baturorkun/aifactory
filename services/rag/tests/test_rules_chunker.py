"""A coding standard's rules file: one chunk per rule (RQ-0052)."""

from __future__ import annotations

import unittest

from aifactory_rag.ingest.rules_chunker import RULES_CHUNKER, chunk_rules, is_rules_file

RULES = """# cstd Rev.AA — group misra (2 rules)

## C-045 | Safety | misra

**Description:** The value of an expression shall not be assigned to an object with a narrower essential type.

**Rationale:** Refer to Ref. [2] Rule 10.3

**MISRA:** 10.3

**Example:**

```c
uint8_t small = wide; /* not compliant */
```

**Notes:** Assignment to a narrower type can lose information.

## C-002 | Safety | misra, do178c

**Description:** A project shall not contain unreachable code.

**Rationale:** Refer to Ref. [1] and Ref. [2] Rule 2.1

**MISRA:** 2.1
"""


class RulesChunkerTests(unittest.TestCase):
    def test_a_rules_file_is_known_by_its_suffix(self) -> None:
        self.assertTrue(is_rules_file("cstd/misra.rules.md"))
        self.assertFalse(is_rules_file("cstd/index.md"))
        self.assertEqual(RULES_CHUNKER, "rules-v1")

    def test_each_rule_is_one_chunk_with_its_metadata(self) -> None:
        chunks = chunk_rules(RULES, "cstd/misra.rules.md", 300)
        self.assertEqual([c.metadata["ruleId"] for c in chunks], ["C-045", "C-002"])
        first = chunks[0]
        self.assertEqual(first.metadata, {
            "section": "C-045", "ruleId": "C-045", "requirement": "C-045", "standard": "cstd", "version": "Rev.AA",
            "groups": ["misra"], "class": "Safety", "misra": ["10.3"], "startLine": 3, "endLine": 17,
        })
        self.assertTrue(first.text.startswith("cstd/misra.rules.md > C-045\n\n## C-045 | Safety | misra\n\n**Description:**"))
        self.assertIn("uint8_t small = wide;", first.text, "the example is stored with the rule")
        self.assertNotIn("uint8_t small", first.embedding_text or "", "but not embedded")
        self.assertIn("narrower essential type", first.embedding_text or "")
        self.assertIn("Assignment to a narrower type", first.embedding_text or "", "the notes are")
        second = chunks[1]
        self.assertEqual(second.metadata["groups"], ["misra", "do178c"])
        self.assertEqual(second.metadata["misra"], ["2.1"])
        self.assertNotIn("Example", second.text)

    def test_a_file_without_rules_gives_nothing(self) -> None:
        self.assertEqual(chunk_rules("# cstd Rev.AA — rule index\n\n- C-001 — …\n", "cstd/index.rules.md", 300), [])


if __name__ == "__main__":
    unittest.main()
