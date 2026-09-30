"""C, C++, TS and JS are chunked one symbol per chunk, from any input.

Size-based chunks cut a function in half and carry no name, so a question
about a function retrieved whatever sat near its name (RQ-0023).
"""

from __future__ import annotations

import unittest
from unittest.mock import patch

from aifactory_rag.config import RagConfig
from aifactory_rag.ingest import code_chunker
from aifactory_rag.ingest.code_chunker import SIZE_CHUNKER, SYMBOL_CHUNKER, chunk_code, expected_chunker
from aifactory_rag.ingest.pipeline import _chunks_for, _ingest_config_matches
from aifactory_rag.query.responder import citation_label, code_location

C_HEADER = """#ifndef A429_H
#define A429_H
#include <stdint.h>

#define A429_CTRL (*(volatile uint32_t *)0x30040000u)
#define A429_STAT (*(volatile uint32_t *)0x30040004u)

typedef struct { uint32_t label; } a429_word_t;
enum a429_speed { A429_LOW, A429_HIGH };

static int rx_count;

/* Receive interrupt: drains the FIFO. */
void a429_rx_isr(void)
{
    rx_count++;
}
#endif
"""


def by_symbol(chunks):
    return {chunk.metadata.get("symbol"): chunk for chunk in chunks if chunk.metadata.get("symbol")}


class CodeChunkerTests(unittest.TestCase):
    def test_c_functions_types_and_macros_become_their_own_chunks(self) -> None:
        chunks = chunk_code(C_HEADER, "drivers/a429.h", 1200, 150)
        symbols = by_symbol(chunks)

        isr = symbols["a429_rx_isr"]
        self.assertEqual(isr.metadata["symbolKind"], "function")
        self.assertEqual(isr.metadata["signature"], "void a429_rx_isr(void)")
        self.assertEqual((isr.metadata["startLine"], isr.metadata["endLine"]), (13, 17))
        self.assertEqual(isr.metadata["language"], "c")
        self.assertIn("Receive interrupt", isr.text)  # the comment above comes along
        self.assertTrue(isr.text.startswith("// drivers/a429.h: function a429_rx_isr"))

        self.assertEqual(symbols["a429_word_t"].metadata["symbolKind"], "typedef")
        self.assertEqual(symbols["a429_speed"].metadata["symbolKind"], "enum")
        # Adjacent register macros are read together, as a register map is.
        self.assertEqual(symbols["A429_CTRL"].metadata["symbols"], ["A429_CTRL", "A429_STAT"])

        # What lies between symbols stays, in file-level chunks.
        file_level = [chunk for chunk in chunks if chunk.metadata["symbolKind"] == "file"]
        self.assertTrue(any("#include <stdint.h>" in chunk.text and "static int rx_count;" in chunk.text for chunk in file_level))

    def test_cpp_methods_and_namespaces_are_qualified(self) -> None:
        source = """namespace hw {
class Uart {
 public:
  int recv();
 private:
  int reg;
};
int Uart::recv() { return reg; }
int clamp(int v) { return v; }
}
"""
        symbols = by_symbol(chunk_code(source, "src/uart.cpp", 1200, 150))

        self.assertEqual(symbols["hw::Uart"].metadata["symbolKind"], "class")
        self.assertEqual(symbols["hw::Uart::recv"].metadata["symbolKind"], "method")
        self.assertEqual(symbols["hw::clamp"].metadata["symbolKind"], "function")

    def test_typescript_and_javascript_declarations(self) -> None:
        ts = """import { x } from './x';
/** Handles one request. */
export async function handle(req: Req): Promise<void> { await x(req); }
export const add = (a: number, b: number) => a + b;
export class Service { run(): void {} }
interface Req { id: string }
type Id = string;
enum Color { Red }
"""
        symbols = by_symbol(chunk_code(ts, "src/service.ts", 1200, 150))
        self.assertEqual(
            {name: chunk.metadata["symbolKind"] for name, chunk in symbols.items()},
            {"handle": "function", "add": "function", "Service": "class", "Req": "interface", "Id": "type", "Color": "enum"},
        )
        self.assertIn("export async function handle", symbols["handle"].text)

        js = "function main() { return 1; }\nclass A { go() {} }\n"
        self.assertEqual(set(by_symbol(chunk_code(js, "bin/run.mjs", 1200, 150))), {"main", "A"})

    def test_an_over_long_function_is_split_and_every_part_opens_with_its_signature(self) -> None:
        body = "\n".join(f"    value += {index};" for index in range(200))
        source = f"int accumulate(int value)\n{{\n{body}\n    return value;\n}}\n"

        parts = [chunk for chunk in chunk_code(source, "src/sum.c", 600, 50) if chunk.metadata.get("symbol") == "accumulate"]

        self.assertGreater(len(parts), 1)
        self.assertEqual([part.metadata["part"] for part in parts], list(range(1, len(parts) + 1)))
        for part in parts:
            self.assertLessEqual(len(part.text), 600)
            self.assertIn("int accumulate(int value)", part.text)
        self.assertEqual(parts[0].metadata["startLine"], 1)
        self.assertEqual(parts[-1].metadata["endLine"], 204)  # signature, {, 200 lines, return, }

    def test_a_large_class_is_split_into_its_methods(self) -> None:
        methods = "\n".join(f"  m{index}(): number {{ return {index} + {'1 + ' * 20}0; }}" for index in range(12))
        source = f"export class Big {{\n  private n = 0;\n{methods}\n}}\n"

        symbols = by_symbol(chunk_code(source, "src/big.ts", 600, 50))

        self.assertIn("Big.m0", symbols)
        self.assertEqual(symbols["Big.m11"].metadata["symbolKind"], "method")
        self.assertIn("private n = 0;", symbols["Big"].text)

    def test_a_file_the_parser_cannot_read_falls_back_to_size_chunks(self) -> None:
        config = RagConfig.model_validate({"ingest": {"chunkSize": 200, "chunkOverlap": 20}})
        with patch.object(code_chunker, "_chunk", side_effect=RuntimeError("grammar crashed")):
            chunks, fallback = _chunks_for("int main(void) { return 0; }\n" * 20, "src/main.c", config)

        self.assertTrue(fallback)
        self.assertTrue(chunks)
        self.assertTrue(all(chunk.metadata == {} for chunk in chunks))

    def test_other_types_keep_size_chunks(self) -> None:
        config = RagConfig.model_validate({"ingest": {"chunkSize": 200, "chunkOverlap": 20}})
        chunks, fallback = _chunks_for("dml 1.4;\ndevice sample;\n", "models/sample.dml", config)

        self.assertFalse(fallback)
        self.assertEqual([chunk.metadata for chunk in chunks], [{}])
        self.assertIsNone(chunk_code("x", "models/sample.dml", 200, 20))


class RechunkTests(unittest.TestCase):
    def _existing(self, **metadata: object) -> dict[str, object]:
        return {"metadata": {
            "chunkSize": 1200,
            "chunkOverlap": 150,
            "embeddingProvider": "openai",
            "embeddingModel": "text-embedding-3-small",
            "embeddingDimensions": 1536,
            **metadata,
        }}

    def test_code_chunked_by_size_before_is_chunked_again_without_force(self) -> None:
        config = RagConfig.model_validate({})
        self.assertEqual(expected_chunker("src/a.c"), SYMBOL_CHUNKER)
        # Ingested before the chunker was recorded: it was chunked by size.
        self.assertFalse(_ingest_config_matches(self._existing(), config, "src/a.c"))
        self.assertTrue(_ingest_config_matches(self._existing(chunker=SYMBOL_CHUNKER), config, "src/a.c"))

    def test_documents_are_not_re_embedded(self) -> None:
        config = RagConfig.model_validate({})
        self.assertEqual(expected_chunker("docs/ICD.pdf"), SIZE_CHUNKER)
        self.assertTrue(_ingest_config_matches(self._existing(), config, "docs/ICD.pdf"))
        self.assertTrue(_ingest_config_matches(self._existing(), config, "models/sample.dml"))


class CodeCitationTests(unittest.TestCase):
    REPOSITORY = {
        "repository": "aselsan/bfi-sw",
        "repositoryUrl": "http://gitlab.bc.int/aselsan/bfi-sw",
        "commit": "b23470fda3ff642d443c4f94397176301e9e411d",
        "symbol": "a429_rx_isr",
        "symbolKind": "function",
        "startLine": 13,
        "endLine": 17,
    }

    def test_a_repository_chunk_is_cited_with_repository_commit_path_and_lines(self) -> None:
        self.assertEqual(
            citation_label("drivers/a429.c", self.REPOSITORY),
            "aselsan/bfi-sw@b23470fd:drivers/a429.c:13-17 (a429_rx_isr)",
        )
        self.assertEqual(
            code_location("drivers/a429.c", self.REPOSITORY)["webUrl"],
            "http://gitlab.bc.int/aselsan/bfi-sw/-/blob/b23470fda3ff642d443c4f94397176301e9e411d/drivers/a429.c#L13-17",
        )

    def test_a_folder_chunk_is_cited_with_path_and_lines(self) -> None:
        metadata = {"symbol": "a429_rx_isr", "startLine": 13, "endLine": 17}
        self.assertEqual(citation_label("src/a429.c", metadata), "src/a429.c:13-17 (a429_rx_isr)")
        self.assertNotIn("webUrl", code_location("src/a429.c", metadata))

    def test_a_document_keeps_its_page_label(self) -> None:
        self.assertEqual(citation_label("ICD.pdf", {}, (3, 4)), "ICD.pdf; pages 3, 4")


if __name__ == "__main__":
    unittest.main()
