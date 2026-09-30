"""The symbol graph of a file: definitions and the edges that leave them (RQ-0024)."""

from __future__ import annotations

import unittest
from unittest.mock import patch

from aifactory_rag.ingest import code_graph
from aifactory_rag.ingest.code_graph import GraphEdge, extract_graph, short_name

C_SOURCE = r'''#include "a429.h"
#include <stdint.h>
#define A429_CTRL (*(volatile uint32_t *)0x30040000u)
static int rx_count;
struct a429_state { int label; };
int a429_encode(int label);

void a429_rx_isr(int channel, struct a429_state *state)
{
    int word = rx_count + channel;
    word++;
    A429_CTRL = 1;
    state->label = 3;
    rx_count = state->label;
    a429_encode(word);
    a429_rx_isr(channel, state);
}
'''


def edges_of(graph, kind: str) -> set[tuple[str | None, str, int]]:
    return {(edge.from_symbol, edge.to_name, edge.line) for edge in graph.edges if edge.kind == kind}


class CGraphTests(unittest.TestCase):
    def setUp(self) -> None:
        self.graph = extract_graph(C_SOURCE, "drivers/a429.c")

    def test_definitions_include_functions_types_macros_and_globals(self) -> None:
        kinds = {(symbol.name, symbol.kind) for symbol in self.graph.symbols}
        self.assertTrue({("a429_rx_isr", "function"), ("a429_state", "struct"), ("A429_CTRL", "macro"), ("rx_count", "variable")} <= kinds)
        isr = next(symbol for symbol in self.graph.symbols if symbol.name == "a429_rx_isr")
        self.assertEqual((isr.start_line, isr.end_line), (8, 17))

    def test_calls_including_recursion(self) -> None:
        self.assertEqual(edges_of(self.graph, "calls"), {("a429_rx_isr", "a429_encode", 15), ("a429_rx_isr", "a429_rx_isr", 16)})

    def test_reads_and_writes_of_globals_registers_and_fields_but_not_locals(self) -> None:
        self.assertEqual(edges_of(self.graph, "writes"), {
            ("a429_rx_isr", "A429_CTRL", 12),
            ("a429_rx_isr", "label", 13),
            ("a429_rx_isr", "rx_count", 14),
        })
        reads = edges_of(self.graph, "reads")
        self.assertIn(("a429_rx_isr", "rx_count", 10), reads)
        self.assertIn(("a429_rx_isr", "label", 14), reads)
        names = {name for _, name, _ in reads | edges_of(self.graph, "writes")}
        self.assertFalse({"word", "channel", "state"} & names)  # locals and parameters

    def test_includes_and_prototypes(self) -> None:
        self.assertEqual(edges_of(self.graph, "includes"), {(None, "a429.h", 1), (None, "stdint.h", 2)})
        self.assertEqual(edges_of(self.graph, "declares"), {(None, "a429_encode", 6)})


class OtherLanguageTests(unittest.TestCase):
    def test_cpp_member_calls_and_class_contents(self) -> None:
        graph = extract_graph("""namespace hw {
class Uart {
 public:
  void send(int b) { write_reg(b); }
};
int Uart_recv(Uart *u) { u->send(1); return 0; }
}
""", "src/uart.cpp")
        self.assertIn(GraphEdge("hw::Uart", "contains", "send", 4), graph.edges)
        self.assertIn(("hw::Uart::send", "write_reg", 4), edges_of(graph, "calls"))
        self.assertIn(("hw::Uart_recv", "send", 6), edges_of(graph, "calls"))

    def test_typescript_imports_calls_and_property_writes(self) -> None:
        graph = extract_graph("""import { encode } from './a429';
const fs = require('fs');
export function publish(value: number): void {
  const word = encode(value);
  this.sent = word;
  bus.write(word);
}
""", "src/publish.ts")
        self.assertEqual({name for _, name, _ in edges_of(graph, "imports")}, {"./a429", "fs"})
        self.assertEqual({name for _, name, _ in edges_of(graph, "calls")}, {"encode", "write"})
        self.assertIn(("publish", "sent", 5), edges_of(graph, "writes"))
        self.assertNotIn("word", {name for _, name, _ in edges_of(graph, "reads")})

    def test_two_functions_of_one_name_are_both_definitions(self) -> None:
        first = extract_graph("static int init(void) { return 0; }\n", "a/init.c")
        second = extract_graph("static int init(void) { return 1; }\n", "b/init.c")
        self.assertEqual([s.short_name for s in first.symbols + second.symbols if s.kind == "function"], ["init", "init"])

    def test_names_are_matched_by_their_last_component(self) -> None:
        self.assertEqual(short_name("hw::Uart::recv"), "recv")
        self.assertEqual(short_name("Service.run"), "run")
        self.assertEqual(short_name("init"), "init")

    def test_a_file_the_parser_cannot_read_has_no_graph(self) -> None:
        with patch.object(code_graph, "_extract", side_effect=RuntimeError("grammar crashed")):
            self.assertIsNone(extract_graph("int x;", "a.c"))
        self.assertIsNone(extract_graph("dml 1.4;", "a.dml"))


if __name__ == "__main__":
    unittest.main()
