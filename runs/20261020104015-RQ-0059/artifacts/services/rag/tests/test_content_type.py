"""What a file is, decided by its name rather than by where it sits.

The directory rule this replaces ("code/" or "documentation/" as the first
segment) forced every corpus into two folders. A repository cloned from GitHub
does not come that way, and reshaping it by hand both costs work and mislabels:
a README under src/ is documentation, a build script under docs/ is not.
"""

from __future__ import annotations

import unittest

from aifactory_rag.ingest.pipeline import _content_type_metadata as classify


class ContentTypeTests(unittest.TestCase):
    def test_prose_and_documents_are_documentation(self) -> None:
        for path in (
            "docs/guide.md",
            "README.md",
            "papers/Speiser-2024.pdf",
            "1. RECEIVED/BFI_EDS.docx",
            "CHANGELOG.rst",
            "notes.txt",
            "slides/overview.pptx",
            "images/schematic.png",
        ):
            self.assertEqual(classify(path), {"contentType": "documentation"}, path)

    def test_sources_scripts_and_configuration_are_code(self) -> None:
        for path in (
            "src/Emulator/Peripherals/UART/NS16550.cs",
            "platforms/board.repl",
            "scripts/run-probe.resc",
            "dml/smartfusion2-mddr/device.dml",
            "tools/build.sh",
            "Makefile",
            "Dockerfile",
            "package.json",
            "config/settings.yaml",
        ):
            self.assertEqual(classify(path), {"contentType": "code"}, path)

    def test_fpga_sources_constraints_and_tcl_are_code_and_included(self) -> None:
        # RQ-0059: a board's pins live only in its constraints; the corpus that
        # held a ZedBoard design's firmware did not have its io.xdc.
        from aifactory_rag.config import DEFAULT_INCLUDE
        from aifactory_rag.ingest.parsers import SUPPORTED_EXTENSIONS

        for path in (
            "amd/zedboard/prj-2dge-zed/hw/constraints/io.xdc",
            "hw/timing.sdc",
            "libero/io.pdc",
            "ise/board.ucf",
            "quartus/de10.qsf",
            "lattice/pins.lpf",
            "hw/bd/system.tcl",
            "rtl/top.v",
            "rtl/defs.vh",
            "rtl/fifo.sv",
            "rtl/pkg.svh",
            "rtl/uart.vhd",
            "rtl/uart_tx.vhdl",
        ):
            self.assertEqual(classify(path), {"contentType": "code"}, path)
            suffix = "." + path.rsplit(".", 1)[1]
            self.assertIn(suffix, SUPPORTED_EXTENSIONS, path)
            self.assertIn(f"**/*{suffix}", DEFAULT_INCLUDE, path)

    def test_what_an_fpga_tool_generates_is_left_out(self) -> None:
        from aifactory_rag.config import RagSourceConfig
        from aifactory_rag.ingest.sources import effective_excludes, selected

        source = RagSourceConfig.model_validate({"id": "fpga", "type": "filesystem", "rootPath": "/tmp"})

        class paths:  # noqa: N801 - reads as the filter it stands for
            @staticmethod
            def matches(path: str) -> bool:
                return selected(path, source.include, effective_excludes(source))
        for kept in (
            "hw/constraints/io.xdc",
            "prj/prj.srcs/sources_1/new/top.v",
            "prj/prj.srcs/constrs_1/new/pins.xdc",
            "hw/bd/system.tcl",
        ):
            self.assertTrue(paths.matches(kept), kept)
        for generated in (
            "prj/prj.gen/sources_1/bd/system/ip/system_hdmi_phy_0/src/gt_hdmi/synth/gt.v",
            "prj/prj.ip_user_files/sim_scripts/run.tcl",
            "prj/prj.cache/ip/2025.2/x.xdc",
            "prj/prj.runs/synth_1/system_wrapper.tcl",
            "prj/prj.sim/sim_1/behav/xsim/glbl.v",
            "prj/prj.srcs/sources_1/bd/system/ip/system_vdma_0/system_vdma_0.xdc",
            "prj/.Xil/Vivado-1/x.tcl",
            "quartus/incremental_db/compiled_partitions/x.v",
        ):
            self.assertFalse(paths.matches(generated), generated)

    def test_the_directory_no_longer_decides(self) -> None:
        """The same file name is classified the same wherever it lives."""
        self.assertEqual(classify("documentation/live.py"), {"contentType": "code"})
        self.assertEqual(classify("code/renode/README.md"), {"contentType": "documentation"})
        self.assertEqual(classify("a/b/c/deep/guide.md"), classify("guide.md"))

    def test_an_unknown_kind_stays_unlabelled(self) -> None:
        """Unlabelled chunks survive every content-type filter, so a file type
        nobody has classified yet is never silently dropped from a retrieval."""
        self.assertEqual(classify("firmware/image.bin"), {})
        self.assertEqual(classify("archive.tar.gz"), {})
        self.assertEqual(classify("no-extension-at-all"), {})


if __name__ == "__main__":
    unittest.main()
