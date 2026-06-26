from __future__ import annotations

import csv
import json
from io import StringIO
from pathlib import Path

SUPPORTED_EXTENSIONS = {".txt", ".md", ".json", ".csv", ".html", ".htm", ".pdf", ".docx", ".pptx"}


def parse_file(path: Path) -> str:
    extension = path.suffix.lower()
    if extension in {".txt", ".md"}:
        return path.read_text(encoding="utf-8", errors="replace")
    if extension == ".json":
        data = json.loads(path.read_text(encoding="utf-8"))
        return json.dumps(data, ensure_ascii=False, indent=2)
    if extension == ".csv":
        content = path.read_text(encoding="utf-8", errors="replace")
        reader = csv.reader(StringIO(content))
        return "\n".join(" | ".join(cell.strip() for cell in row) for row in reader)
    if extension in {".html", ".htm"}:
        return _parse_html(path)
    if extension == ".pdf":
        return _parse_pdf(path)
    if extension == ".docx":
        return _parse_docx(path)
    if extension == ".pptx":
        return _parse_pptx(path)
    raise ValueError(f"Unsupported file extension: {extension}")


def _parse_html(path: Path) -> str:
    try:
        from bs4 import BeautifulSoup
    except ImportError as exc:
        raise RuntimeError("beautifulsoup4 is required to ingest HTML files. Run: pnpm rag:install") from exc

    soup = BeautifulSoup(path.read_text(encoding="utf-8", errors="replace"), "html.parser")
    for element in soup(["script", "style", "noscript"]):
        element.decompose()
    return soup.get_text(separator="\n", strip=True)


def _parse_pdf(path: Path) -> str:
    try:
        from pypdf import PdfReader
    except ImportError as exc:
        raise RuntimeError("pypdf is required to ingest PDF files. Run: pnpm rag:install") from exc

    reader = PdfReader(str(path))
    pages: list[str] = []
    for index, page in enumerate(reader.pages):
        text = page.extract_text() or ""
        if text.strip():
            pages.append(f"[page {index + 1}]\n{text.strip()}")
    return "\n\n".join(pages)


def _parse_docx(path: Path) -> str:
    try:
        from docx import Document
    except ImportError as exc:
        raise RuntimeError("python-docx is required to ingest DOCX files. Run: pnpm rag:install") from exc

    document = Document(str(path))
    parts: list[str] = []
    parts.extend(paragraph.text.strip() for paragraph in document.paragraphs if paragraph.text.strip())
    for table in document.tables:
        for row in table.rows:
            cells = [cell.text.strip() for cell in row.cells if cell.text.strip()]
            if cells:
                parts.append(" | ".join(cells))
    return "\n".join(parts)


def _parse_pptx(path: Path) -> str:
    try:
        from pptx import Presentation
    except ImportError as exc:
        raise RuntimeError("python-pptx is required to ingest PPTX files. Run: pnpm rag:install") from exc

    presentation = Presentation(str(path))
    slides: list[str] = []
    for slide_index, slide in enumerate(presentation.slides):
        texts: list[str] = []
        for shape in slide.shapes:
            if hasattr(shape, "text") and shape.text.strip():
                texts.append(shape.text.strip())
            if hasattr(shape, "table"):
                for row in shape.table.rows:
                    cells = [cell.text.strip() for cell in row.cells if cell.text.strip()]
                    if cells:
                        texts.append(" | ".join(cells))
        if texts:
            slides.append(f"[slide {slide_index + 1}]\n" + "\n".join(texts))
    return "\n\n".join(slides)
