"""Markdown chunked by section, code blocks never split (RQ-0030)."""

from __future__ import annotations

import unittest

from aifactory_rag.config import RagConfig
from aifactory_rag.ingest.markdown_chunker import MARKDOWN_CHUNKER, chunk_markdown
from aifactory_rag.ingest.pipeline import _chunks_for, _ingest_config_matches, expected_chunker
from aifactory_rag.query.responder import citation_label

README = """# The twin on your PC

Run the firmware on the twin.

## 3. Run it

```powershell
docker run --rm -p 5429:5429/udp gitlab.bcintr.int:5050/hardware-twin/bfi-sumilator:<release> `
  --live --elf /io/bfiFirmware.elf --out /io/run
```

## 5. Debugging with GDB

The twin has a debug port the way the board has JTAG.

```powershell
docker run --rm -p 5429:5429/udp -p 3333:3333 -v "${PWD}:/io" `
  gitlab.bcintr.int:5050/hardware-twin/bfi-sumilator:<twin release> `
  --live --elf /io/bfiFirmware.elf --out /io/run `
  --gdb 3333 --gdb-wait
```

With `--gdb` the twin runs until you stop it.

### arm-none-eabi-gdb

```
# not a heading: a comment in a code block
(gdb) target remote localhost:3333
```
"""


def by_section(chunks):
    return {chunk.metadata.get("section"): chunk for chunk in chunks}


class SectionTests(unittest.TestCase):
    def test_each_section_is_a_chunk_headed_by_its_file_and_heading_path(self) -> None:
        sections = by_section(chunk_markdown(README, "twin/README.md", 1200))

        gdb = sections["The twin on your PC > 5. Debugging with GDB"]
        self.assertTrue(gdb.text.startswith("twin/README.md > The twin on your PC > 5. Debugging with GDB\n\n## 5. Debugging"))
        # the whole command, its explanation, in one chunk
        self.assertIn('docker run --rm -p 5429:5429/udp -p 3333:3333 -v "${PWD}:/io" `', gdb.text)
        self.assertIn("--gdb 3333 --gdb-wait\n```", gdb.text)
        self.assertIn("With `--gdb` the twin runs until you stop it.", gdb.text)
        self.assertEqual((gdb.metadata["headingLevel"], gdb.metadata["startLine"]), (2, 12))

    def test_a_hash_inside_a_code_block_is_not_a_heading(self) -> None:
        sections = by_section(chunk_markdown(README, "twin/README.md", 1200))
        gdb_client = sections["The twin on your PC > 5. Debugging with GDB > arm-none-eabi-gdb"]
        self.assertIn("# not a heading: a comment in a code block", gdb_client.text)
        self.assertFalse(any("not a heading" in (section or "") for section in sections))

    def test_a_long_section_is_split_between_paragraphs_and_never_inside_code(self) -> None:
        paragraphs = "\n\n".join(f"Paragraph {n} " + "word " * 40 for n in range(12))
        code = "```\n" + "\n".join(f"line {n}" for n in range(30)) + "\n```"
        text = f"# Guide\n\n## Long\n\n{paragraphs}\n\n{code}\n\nAfter the code.\n"

        parts = [c for c in chunk_markdown(text, "docs/guide.md", 600) if c.metadata.get("section") == "Guide > Long"]

        self.assertGreater(len(parts), 1)
        for part in parts:
            self.assertTrue(part.text.startswith("docs/guide.md > Guide > Long\n\n"))
            self.assertEqual(part.text.count("```") % 2, 0, part.text)  # every fence closed in its own chunk
            self.assertEqual(part.metadata["parts"], len(parts))
        self.assertEqual(sum("line 0\n" in p.text for p in parts), 1)
        self.assertTrue(any("line 0" in p.text and "line 29" in p.text for p in parts))

    def test_only_a_code_block_beyond_four_chunk_sizes_is_split_and_each_part_reopens_the_fence(self) -> None:
        code = "```c\n" + "\n".join(f"#define REG_{n} 0x{n:08x}u" for n in range(400)) + "\n```"
        parts = chunk_markdown(f"# Registers\n\n{code}\n", "regs.md", 500)

        self.assertGreater(len(parts), 1)
        for part in parts:
            body = part.text.split("\n\n", 1)[1]
            if "#define" in body:
                self.assertTrue(body.lstrip().startswith("```c") or body.startswith("# Registers"), body[:40])
                self.assertTrue(body.rstrip().endswith("```"))


class IngestTests(unittest.TestCase):
    def test_markdown_gets_the_section_chunker_and_is_re_chunked_once(self) -> None:
        config = RagConfig.model_validate({})
        self.assertEqual(expected_chunker("twin/README.md"), MARKDOWN_CHUNKER)
        chunks, fallback = _chunks_for(README, "twin/README.md", config)
        self.assertFalse(fallback)
        self.assertTrue(all("section" in c.metadata or c.metadata.get("startLine") for c in chunks))

        before = {"metadata": {"chunkSize": 1200, "chunkOverlap": 150, "embeddingProvider": "openai",
                               "embeddingModel": "text-embedding-3-small", "embeddingDimensions": 1536}}
        self.assertFalse(_ingest_config_matches(before, config, "twin/README.md"))
        self.assertTrue(_ingest_config_matches(before, config, "docs/ICD.pdf"))
        self.assertTrue(_ingest_config_matches(before, config, "docs/index.rst"))

    def test_a_section_is_cited_by_its_heading(self) -> None:
        label = citation_label("twin/README.md", {"section": "The twin > 5. Debugging with GDB", "startLine": 115, "endLine": 142})
        self.assertEqual(label, "twin/README.md:115-142 § 5. Debugging with GDB")


if __name__ == "__main__":
    unittest.main()
