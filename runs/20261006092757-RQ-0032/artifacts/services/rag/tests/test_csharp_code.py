"""C# is chunked by symbol and joins the symbol graph (RQ-0032).

The hardware twin's Renode peripherals are C#. Cut every 1200 characters, a
`WriteDoubleWord` was split across chunks with no symbol name, so "what does
a write to this register do" found half a method.
"""

from __future__ import annotations

import unittest

from aifactory_rag.ingest.code_chunker import SYMBOL_CHUNKER, chunk_code, expected_chunker
from aifactory_rag.ingest.code_graph import extract_graph

PERIPHERAL = """using System;
using Antmicro.Renode.Peripherals.Bus;

namespace Antmicro.Renode.Peripherals.UART
{
    // The CoreUART of the BFI fabric.
    public class CoreUart : IDoubleWordPeripheral
    {
        public CoreUart(IMachine machine)
        {
            this.machine = machine;
            fifo = new Queue<byte>();
            Reset();
        }

        /// <summary>A bus write.</summary>
        public void WriteDoubleWord(long offset, uint value)
        {
            var index = (int)offset / 4;
            shadow[index] = value;
            switch((Registers)offset)
            {
            case Registers.Tx:
                TransmitCharacter((byte)value);
                break;
            }
            writes++;
        }

        public uint Status
        {
            get { return fifo.Count > 0 ? 1u : 0u; }
            set { shadow[0] = value; }
        }

        public int Plain { get; set; }

        public void Reset() => fifo.Clear();

        private readonly IMachine machine;
        private readonly Queue<byte> fifo;
        private readonly uint[] shadow = new uint[64];
        private int writes;

        private enum Registers : long
        {
            Tx = 0x0,
            Rx = 0x4,
        }
    }
}
"""

UART = "Antmicro.Renode.Peripherals.UART.CoreUart"


def edges_of(graph, kind: str) -> set[tuple[str | None, str]]:
    return {(edge.from_symbol, edge.to_name) for edge in graph.edges if edge.kind == kind}


class CSharpChunkTests(unittest.TestCase):
    def test_a_cs_file_gets_the_symbol_chunker(self) -> None:
        self.assertEqual(expected_chunker("peripherals/CoreUart.cs"), SYMBOL_CHUNKER)

    def test_a_bus_write_is_one_chunk_named_with_its_class(self) -> None:
        chunks = chunk_code(PERIPHERAL, "peripherals/CoreUart.cs", 600, 50)
        write = [chunk for chunk in chunks if chunk.metadata.get("symbol") == f"{UART}.WriteDoubleWord"]

        self.assertEqual(len(write), 1)
        self.assertEqual(write[0].metadata["symbolKind"], "method")
        self.assertEqual(write[0].metadata["signature"], "public void WriteDoubleWord(long offset, uint value)")
        self.assertIn("/// <summary>A bus write.</summary>", write[0].text)
        self.assertIn("TransmitCharacter((byte)value);", write[0].text)
        self.assertEqual((write[0].metadata["startLine"], write[0].metadata["endLine"]), (16, 28))

    def test_members_with_code_are_symbols_and_auto_properties_are_not(self) -> None:
        kinds = {(chunk.metadata.get("symbol"), chunk.metadata.get("symbolKind")) for chunk in chunk_code(PERIPHERAL, "p/CoreUart.cs", 600, 50)}
        self.assertTrue({
            (UART, "class"),
            (f"{UART}.CoreUart", "constructor"),
            (f"{UART}.Status", "property"),
            (f"{UART}.Reset", "method"),
            (f"{UART}.Registers", "enum"),
        } <= kinds)
        self.assertNotIn((f"{UART}.Plain", "property"), kinds)

    def test_bodiless_methods_stay_with_their_type(self) -> None:
        wrapper = """public static class BTICard
{
    [DllImport("BTICARD.dll")]
    public static extern int BTICard_CardOpen(ref IntPtr handle, int cardnum);
    [DllImport("BTICARD.dll")]
    public static extern void BTICard_CardReset(IntPtr handle);
    public static string BTICard_ErrDesc(int err, IntPtr handle) { return Marshal.PtrToStringAnsi(_ErrDesc(err, handle)); }
}
public interface IBus { uint ReadDoubleWord(long offset); }
"""
        # small chunks force the class apart into its members
        symbols = {chunk.metadata.get("symbol") for chunk in chunk_code(wrapper, "BTICARDNET.CS", 300, 50)}
        self.assertEqual(symbols, {"BTICard", "BTICard.BTICard_ErrDesc", "IBus"})

    def test_a_file_scoped_namespace_qualifies_what_follows(self) -> None:
        chunks = chunk_code("namespace Twin.Bus;\n\npublic struct Word { public int Value() => 1; }\n", "Word.cs", 1200, 50)
        self.assertIn("Twin.Bus.Word", {chunk.metadata.get("symbol") for chunk in chunks})


class CSharpGraphTests(unittest.TestCase):
    def setUp(self) -> None:
        self.graph = extract_graph(PERIPHERAL, "peripherals/CoreUart.cs")

    def test_a_type_contains_its_members(self) -> None:
        self.assertTrue({(UART, "WriteDoubleWord"), (UART, "CoreUart"), (UART, "Status"), (UART, "Registers")} <= edges_of(self.graph, "contains"))

    def test_calls_constructions_and_usings(self) -> None:
        calls = edges_of(self.graph, "calls")
        self.assertIn((f"{UART}.WriteDoubleWord", "TransmitCharacter"), calls)
        self.assertIn((f"{UART}.CoreUart", "Reset"), calls)
        self.assertIn((f"{UART}.CoreUart", "Queue"), calls)  # new Queue<byte>()
        self.assertIn((f"{UART}.Reset", "Clear"), calls)
        self.assertEqual(
            {name for _, name in edges_of(self.graph, "imports")}, {"System", "Antmicro.Renode.Peripherals.Bus"}
        )

    def test_fields_are_read_and_written_and_locals_and_types_are_not(self) -> None:
        writes = edges_of(self.graph, "writes")
        reads = edges_of(self.graph, "reads")
        self.assertIn((f"{UART}.WriteDoubleWord", "shadow"), writes)
        self.assertIn((f"{UART}.WriteDoubleWord", "writes"), writes)  # writes++
        self.assertIn((f"{UART}.Status", "shadow"), writes)  # the setter
        self.assertIn((f"{UART}.Status", "fifo"), reads)
        names = {name for _, name in reads | writes}
        # parameters, locals, the setter's `value` and type names are not edges
        # (`this.machine = machine` writes the field, which is one)
        self.assertFalse({"offset", "value", "index", "IMachine", "uint", "byte"} & names)


if __name__ == "__main__":
    unittest.main()
