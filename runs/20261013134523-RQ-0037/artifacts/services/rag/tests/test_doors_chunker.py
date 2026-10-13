"""A DOORS module export chunked by requirement (RQ-0037)."""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from aifactory_rag.config import DEFAULT_INCLUDE, RagConfig
from aifactory_rag.ingest.doors_chunker import DOORS_CHUNKER, DoorsExportError, chunk_doors, is_doors_export, read_export
from aifactory_rag.ingest.parsers import parse_file
from aifactory_rag.ingest.pipeline import _chunks_for, _content_type_metadata, _replace_chunks, expected_chunker
from aifactory_rag.ingest.sources import selected
from aifactory_rag.query.responder import citation_label, code_location

MODULE = "/FCS/Software/FCS_SRS"
BOOKKEEPING = {
    "Created By": "ayse", "Created On": "11 June 2026", "Created Thru": "Manual Input",
    "Last Modified By": "ayse", "Last Modified On": "12 June 2026", "TableType": "TableNone", "OLE": "False",
}


def obj(absno: int, number: str, level: int, heading: str = "", text: str = "", shape: str = "object", **extra: object) -> dict:
    return {
        "kind": "object", "id": f"FCS-SRS-{absno}", "absno": absno, "number": number, "level": level, "shape": shape,
        "heading": heading, "text": text, "attributes": {**BOOKKEEPING, **extra.pop("attributes", {})},
        "outLinks": extra.pop("outLinks", []), "inLinks": extra.pop("inLinks", []),
    }


def export(*objects: dict) -> str:
    module = {"kind": "module", "format": "aifactory-doors-1", "path": MODULE, "name": "FCS_SRS", "description": "", "prefix": "FCS-SRS-", "modified": "12 June 2026"}
    return "".join(json.dumps(row, ensure_ascii=False) + "\n" for row in (module, *objects))


SRS = export(
    obj(1, "1", 1, heading="Scope"),
    obj(2, "2", 1, heading="Requirements"),
    obj(3, "2.1", 2, heading="Power-up"),
    obj(4, "2.1.0-1", 3, text="The software shall complete its power-up built-in test within 500 ms.",
        attributes={"VerMethod": "Test", "ReqType": "Functional\nOperational"},
        outLinks=[{"module": "/FCS/System/FCS_SSS", "absno": 41, "via": "/FCS/Links/satisfies"}]),
    obj(5, "2.1.0-2", 3, text="The software shall report a failed test on the maintenance bus.",
        attributes={"VerMethod": "Analysis"}, inLinks=[{"module": "/FCS/Software/FCS_HLR", "absno": 7}]),
    obj(6, "2.1.0-3", 3, shape="table"),
    obj(7, "2.1.0-3.0-1", 4, shape="row"),
    obj(8, "2.1.0-3.0-1.0-1", 5, text="Mode", shape="cell"),
    obj(9, "2.1.0-3.0-1.0-2", 5, text="Timeout", shape="cell"),
    obj(10, "2.1.0-3.0-2", 4, shape="row"),
    obj(11, "2.1.0-3.0-2.0-1", 5, text="Ground", shape="cell"),
    obj(12, "2.1.0-3.0-2.0-2", 5, text="500 ms", shape="cell"),
    obj(13, "2.1.0-3.0-3", 4, shape="row"),
    obj(14, "2.1.0-3.0-3.0-1", 5, shape="cell"),
)


class ChunkTests(unittest.TestCase):
    def test_a_requirement_is_one_chunk_with_its_identifier_headings_and_attributes(self) -> None:
        chunks = chunk_doors(SRS, 1200)

        self.assertEqual([chunk.metadata["requirement"] for chunk in chunks], ["FCS-SRS-4", "FCS-SRS-5", "FCS-SRS-6"])
        first = chunks[0]
        self.assertEqual(
            first.text,
            f"{MODULE} > 2 Requirements > 2.1 Power-up\nFCS-SRS-4\n\n"
            "The software shall complete its power-up built-in test within 500 ms.\n\n"
            "VerMethod: Test\nReqType: Functional, Operational\nLinks to: /FCS/System/FCS_SSS 41",
        )
        self.assertEqual(first.metadata, {
            "doorsModule": MODULE, "requirement": "FCS-SRS-4", "section": "2 Requirements > 2.1 Power-up", "number": "2.1.0-1",
        })
        self.assertIn("Linked from: /FCS/Software/FCS_HLR 7", chunks[1].text)

    def test_bookkeeping_attributes_are_in_no_chunk(self) -> None:
        text = "\n".join(chunk.text for chunk in chunk_doors(SRS, 1200))
        for name in BOOKKEEPING:
            self.assertNotIn(f"{name}:", text)

    def test_the_embedded_text_has_no_attribute_lines(self) -> None:
        first = chunk_doors(SRS, 1200)[0]
        self.assertEqual(
            first.embedding_text,
            f"{MODULE} > 2 Requirements > 2.1 Power-up\nFCS-SRS-4\n\n"
            "The software shall complete its power-up built-in test within 500 ms.",
        )

    def test_a_table_is_one_chunk_row_by_row(self) -> None:
        table = chunk_doors(SRS, 1200)[2]
        self.assertEqual(table.text, f"{MODULE} > 2 Requirements > 2.1 Power-up\nFCS-SRS-6\n\nMode | Timeout\nGround | 500 ms")
        self.assertIsNone(table.embedding_text)  # nothing but the text: stored and embedded alike

    def test_a_heading_closes_the_sections_at_and_below_its_level(self) -> None:
        chunks = chunk_doors(export(
            obj(1, "1", 1, heading="Scope"),
            obj(2, "1.1", 2, heading="Identification"),
            obj(3, "1.1.0-1", 3, text="This document is the SRS."),
            obj(4, "2", 1, heading="Requirements"),
            obj(5, "2.0-1", 2, text="The software shall start."),
            obj(6, "3", 1, heading="Notes", text="Notes are not requirements."),
        ), 1200)

        self.assertEqual(
            [chunk.metadata.get("section") for chunk in chunks],
            ["1 Scope > 1.1 Identification", "2 Requirements", "3 Notes"],
        )

    def test_a_long_requirement_is_split_into_parts_that_carry_heading_and_identifier(self) -> None:
        long_text = " ".join(f"Sentence {n} of a long requirement." for n in range(80))
        chunks = chunk_doors(export(obj(1, "1", 1, heading="Scope"), obj(2, "1.0-1", 2, text=long_text, attributes={"VerMethod": "Test"})), 600)

        self.assertGreater(len(chunks), 1)
        for number, chunk in enumerate(chunks, start=1):
            self.assertTrue(chunk.text.startswith(f"{MODULE} > 1 Scope\nFCS-SRS-2\n\n"))
            self.assertLessEqual(len(chunk.embedding_text or ""), 600)
            self.assertIn("VerMethod: Test", chunk.text)
            self.assertEqual((chunk.metadata["part"], chunk.metadata["parts"]), (number, len(chunks)))

    def test_a_module_of_headings_only_has_no_chunk(self) -> None:
        self.assertEqual(chunk_doors(export(obj(1, "1", 1, heading="Scope")), 1200), [])


class ExportFileTests(unittest.TestCase):
    def test_a_file_without_the_module_line_names_the_line(self) -> None:
        with self.assertRaisesRegex(DoorsExportError, "line 1: not a DOORS export"):
            read_export(json.dumps(obj(1, "1", 1, text="x")) + "\n")

    def test_a_line_that_is_not_json_names_the_line(self) -> None:
        with self.assertRaisesRegex(DoorsExportError, "line 3: not JSON"):
            read_export(export(obj(1, "1", 1, text="x")) + '{"kind": "object", "id": "FCS-SRS-2", "text": "cut\n')

    def test_an_empty_file_is_not_an_export(self) -> None:
        with self.assertRaisesRegex(DoorsExportError, "empty"):
            read_export("")

    def test_a_byte_order_mark_is_ignored(self) -> None:
        self.assertEqual(read_export("﻿" + SRS).path, MODULE)


class PipelineTests(unittest.TestCase):
    def test_an_export_file_gets_the_doors_chunker_wherever_it_lies(self) -> None:
        path = "exports/FCS_SRS.doors.jsonl"
        self.assertTrue(is_doors_export(path))
        self.assertFalse(is_doors_export("exports/FCS_SRS.jsonl"))
        self.assertEqual(expected_chunker(path), DOORS_CHUNKER)
        chunks, fallback = _chunks_for(SRS, path, RagConfig())
        self.assertEqual((len(chunks), fallback), (3, False))
        self.assertTrue(selected(path, DEFAULT_INCLUDE, []))

    def test_requirements_are_their_own_content_type(self) -> None:
        self.assertEqual(_content_type_metadata("FCS/Software/FCS_SRS.doors.jsonl"), {"contentType": "requirements"})

    def test_the_parser_hands_the_lines_to_the_chunker(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "FCS_SRS.doors.jsonl"
            path.write_text(SRS, encoding="utf-8")
            self.assertEqual(parse_file(path), SRS)

    def test_the_vector_is_made_from_the_embedded_text_and_the_whole_text_is_stored(self) -> None:
        stored: list[str] = []

        class Cursor:
            def __enter__(self) -> "Cursor":
                return self

            def __exit__(self, *_: object) -> None:
                return None

            def execute(self, statement: str, params: tuple[object, ...]) -> None:
                if "INSERT INTO rag_chunks" in statement:
                    stored.append(str(params[3]))

        class Connection:
            def cursor(self) -> Cursor:
                return Cursor()

            def commit(self) -> None:
                return None

        embedded: list[str] = []

        class Embedder:
            def embed_documents(self, texts: list[str]) -> list[list[float]]:
                embedded.extend(texts)
                return [[1.0, 0.0] for _ in texts]

        chunks = chunk_doors(SRS, 1200)
        _replace_chunks(Connection(), 1, "fcs", "FCS/Software/FCS_SRS.doors.jsonl", chunks, Embedder(), 50, False)  # type: ignore[arg-type]

        self.assertEqual(stored, [chunk.text for chunk in chunks])
        self.assertNotIn("VerMethod", "\n".join(embedded))
        self.assertIn("power-up built-in test", embedded[0])


class CitationTests(unittest.TestCase):
    def test_a_requirement_is_cited_by_module_and_identifier(self) -> None:
        metadata = chunk_doors(SRS, 1200)[0].metadata
        self.assertEqual(
            citation_label("FCS/Software/FCS_SRS.doors.jsonl", metadata),
            f"DOORS {MODULE} FCS-SRS-4 § 2.1 Power-up",
        )
        location = code_location("FCS/Software/FCS_SRS.doors.jsonl", metadata)
        self.assertEqual((location["doorsModule"], location["requirement"]), (MODULE, "FCS-SRS-4"))
        self.assertNotIn("webUrl", location)


if __name__ == "__main__":
    unittest.main()
