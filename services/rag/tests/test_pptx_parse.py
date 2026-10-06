"""A slide with a chart is read, not an ingest error.

A progress-meeting deck in the BFI folder failed with "shape does not contain
a table": a chart is a graphic frame, whose `table` raises instead of being
absent, and the parser tested for the attribute.
"""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from pptx import Presentation
from pptx.chart.data import CategoryChartData
from pptx.enum.chart import XL_CHART_TYPE
from pptx.util import Inches

from aifactory_rag.ingest.parsers import parse_file


class PptxParseTests(unittest.TestCase):
    def test_a_chart_is_skipped_and_text_and_tables_are_read(self) -> None:
        presentation = Presentation()
        slide = presentation.slides.add_slide(presentation.slide_layouts[5])
        slide.shapes.title.text = "Project progress"
        data = CategoryChartData()
        data.categories = ["Sep", "Oct"]
        data.add_series("Done", (3, 5))
        slide.shapes.add_chart(XL_CHART_TYPE.COLUMN_CLUSTERED, Inches(1), Inches(1), Inches(4), Inches(3), data)
        table = slide.shapes.add_table(2, 2, Inches(5), Inches(1), Inches(4), Inches(1)).table
        for row, cells in enumerate([("Item", "State"), ("A429 Lite", "done")]):
            for column, text in enumerate(cells):
                table.cell(row, column).text = text

        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "progress.pptx"
            presentation.save(path)
            text = parse_file(path)

        self.assertEqual(text, "[slide 1]\nProject progress\nItem | State\nA429 Lite | done")


if __name__ == "__main__":
    unittest.main()
