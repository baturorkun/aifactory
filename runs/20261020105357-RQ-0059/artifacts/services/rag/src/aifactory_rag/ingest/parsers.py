from __future__ import annotations

import csv
import hashlib
import io
import json
import re
from collections.abc import Iterable
from io import StringIO
from pathlib import Path

PLAIN_TEXT_EXTENSIONS = {
    ".txt",
    ".md",
    ".py",
    ".pyi",
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
    ".ts",
    ".tsx",
    ".mts",
    ".cts",
    ".java",
    ".kt",
    ".kts",
    ".go",
    ".rs",
    ".c",
    ".h",
    ".cc",
    ".cpp",
    ".cxx",
    ".hh",
    ".hpp",
    ".hxx",
    ".cs",
    ".fs",
    ".fsx",
    ".rb",
    ".php",
    ".swift",
    ".scala",
    ".sh",
    ".bash",
    ".zsh",
    ".fish",
    ".ps1",
    ".sql",
    ".yaml",
    ".yml",
    ".toml",
    ".ini",
    ".cfg",
    ".conf",
    ".xml",
    ".vue",
    ".svelte",
    ".proto",
    ".graphql",
    ".gql",
    ".dml",
    ".simics",
    # Renode's platform descriptions and scripts, the counterparts of Simics's
    # .dml and .simics above. Both are plain text, and in a Renode corpus they
    # are the most useful files there are: a platform description is the worked
    # example of how a peripheral model is registered and parameterised.
    ".repl",
    ".resc",
    ".rst",
    # Hardware description and the Robot Framework tests that drive it. A
    # co-simulation example is mostly Verilog: without these the repository
    # indexes its README and drops the thing it is an example of.
    ".v",
    ".sv",
    ".vh",
    ".svh",
    ".vhd",
    ".vhdl",
    # FPGA constraints and the Tcl that builds the design (RQ-0059): the pins,
    # clocks and I/O standards of a board live only here (.xdc for Vivado,
    # .ucf for ISE, .pdc and .sdc for Libero as the SmartFusion2 of BFI, .qsf
    # for Quartus, .lpf for Lattice), and an FPGA project's flow and block
    # design are Tcl.
    ".xdc",
    ".ucf",
    ".pdc",
    ".sdc",
    ".qsf",
    ".lpf",
    ".tcl",
    ".robot",
    ".mk",
    ".inc",
    ".include",
    ".cmake",
}
PLAIN_TEXT_FILENAMES = {
    "dockerfile",
    "makefile",
    "gnumakefile",
    "rakefile",
    "gemfile",
    "procfile",
    "jenkinsfile",
}
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff", ".webp"}
SUPPORTED_EXTENSIONS = (
    PLAIN_TEXT_EXTENSIONS
    | {".json", ".csv", ".html", ".htm", ".pdf", ".docx", ".pptx", ".xlsx", ".xlsm"}
    | IMAGE_EXTENSIONS
)

# How a file type is read now. A document read by an earlier version of its
# parser is read again on the next ingest, even when the file did not change.
# Types missing here are at version 1.
PARSER_VERSIONS = {
    # 2: the text in a slide's pictures is read too, as it is in PDF and DOCX.
    ".pptx": 2,
}


def parser_version(relative_path: str) -> int:
    return PARSER_VERSIONS.get(Path(relative_path).suffix.lower(), 1)


# Embedded images repeat on every page of a document as logos and stamps. Only the
# first occurrence of a given image is worth reading.
MIN_EMBEDDED_IMAGE_BYTES = 3000
MIN_OCR_CONFIDENCE = 0.5

_ocr_reader: object | None = None
_ocr_import_failed = False


def _ocr_engine() -> object | None:
    """Return a shared RapidOCR engine, or None when the package is unavailable."""
    global _ocr_reader, _ocr_import_failed
    if _ocr_import_failed:
        return None
    if _ocr_reader is None:
        try:
            from rapidocr_onnxruntime import RapidOCR
        except ImportError:
            _ocr_import_failed = True
            return None
        _ocr_reader = RapidOCR()
    return _ocr_reader


def ocr_text(image: bytes | str | Path) -> str:
    """Read the text in an image. Returns an empty string when OCR is unavailable."""
    engine = _ocr_engine()
    if engine is None:
        return ""
    try:
        result, _ = engine(image if isinstance(image, bytes) else str(image))
    except Exception:
        return ""
    if not result:
        return ""
    return " ".join(
        text.strip()
        for _, text, score in result
        if text and text.strip() and score >= MIN_OCR_CONFIDENCE
    )


def _embedded_image_text(blobs: Iterable[bytes], seen_hashes: set[str]) -> str:
    """OCR the images of one page or document, skipping repeats and tiny icons."""
    if _ocr_engine() is None:
        return ""
    texts: list[str] = []
    for data in blobs:
        if len(data) < MIN_EMBEDDED_IMAGE_BYTES:
            continue
        digest = hashlib.md5(data).hexdigest()
        if digest in seen_hashes:
            continue
        seen_hashes.add(digest)
        text = ocr_text(data)
        if text:
            texts.append(text)
    return "\n".join(texts)


def parse_file(path: Path) -> str:
    # PostgreSQL text cannot hold NUL, and a source file can: arinc661-studio's
    # font-file-parsing.ts has raw 0x00 in its strings and failed to ingest.
    return _parse(path).replace("\x00", "")


def _parse(path: Path) -> str:
    extension = path.suffix.lower()
    if extension in PLAIN_TEXT_EXTENSIONS or path.name.lower() in PLAIN_TEXT_FILENAMES:
        return path.read_text(encoding="utf-8", errors="replace")
    if path.name.lower().endswith(".doors.jsonl"):
        # A DOORS module export (RQ-0037): its own chunker reads the lines.
        return path.read_text(encoding="utf-8", errors="replace")
    if extension == ".json":
        raw = path.read_text(encoding="utf-8", errors="replace")
        try:
            data = json.loads(raw)
        except ValueError:
            # Not JSON as written: comment lines (a devcontainer.json, a
            # tsconfig.json) or a trailing comma. Read as text, still
            # searchable, rather than refused (RQ-0050).
            return raw
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
    if extension in {".xlsx", ".xlsm"}:
        return _parse_xlsx(path)
    if extension in IMAGE_EXTENSIONS:
        return _parse_image(path)
    raise ValueError(f"Unsupported file extension: {extension}")


def _parse_image(path: Path) -> str:
    if _ocr_engine() is None:
        raise RuntimeError(
            "rapidocr-onnxruntime is required to ingest image files. Run: pnpm rag:install"
        )
    return ocr_text(path)


def _parse_html(path: Path) -> str:
    try:
        from bs4 import BeautifulSoup
    except ImportError as exc:
        raise RuntimeError("beautifulsoup4 is required to ingest HTML files. Run: pnpm rag:install") from exc

    soup = BeautifulSoup(path.read_text(encoding="utf-8", errors="replace"), "html.parser")
    for element in soup(["script", "style", "noscript"]):
        element.decompose()
    return soup.get_text(separator="\n", strip=True)


# The IHS licence stamp printed on every page of the ARINC standards. It is
# not content: it crowded the vector space (2114 arinc chunks carried it) and
# a reranker put stamp-only chunks first for "ARINC-665'i özetle".
PDF_STAMP_PATTERNS = [
    re.compile(pattern + r"\n?", re.MULTILINE)  # the line and its line break
    for pattern in (
        r"^[ \t]*Copyright Aeronautical Radio,? Inc\.?[ \t]*$",
        r"^[ \t]*Provided by IHS under license with ARINC.*$",
        r"^[ \t]*Order Number:[ \t]*\S*[ \t]*$",
        r"^[ \t]*Sold to:.*$",
        r"^[ \t]*Not for Resale,?.*$",
        r"^[ \t]*No reproduction or networking permitted without license from IHS[ \t]*$",
        r"^[ \t]*[-`,]{6,}[ \t]*$",  # the guilloche line the stamp ends with
    )
]


def strip_page_stamps(text: str) -> str:
    """A page's text without the licence stamp lines; blank runs collapsed."""
    for pattern in PDF_STAMP_PATTERNS:
        text = pattern.sub("", text)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def _parse_pdf(path: Path) -> str:
    try:
        from pypdf import PdfReader
    except ImportError as exc:
        raise RuntimeError("pypdf is required to ingest PDF files. Run: pnpm rag:install") from exc

    reader = PdfReader(str(path))
    pages: list[str] = []
    seen_hashes: set[str] = set()
    seen_pictures: set[tuple[int, int]] = set()
    for index, page in enumerate(reader.pages):
        parts: list[str] = []
        try:
            text = page.extract_text() or ""
        except Exception:
            # A malformed font on one page (DO-330: a Type0 font with no
            # /DescendantFonts, 17 of 138 pages) must not drop the other pages.
            text = ""
        text = strip_page_stamps(text)
        if text:
            parts.append(text)
        image_text = _embedded_image_text(_pdf_page_blobs(page, seen_pictures), seen_hashes)
        if image_text:
            parts.append(f"(image) {image_text}")
        if parts:
            pages.append(f"[page {index + 1}]\n" + "\n".join(parts))
    return "\n\n".join(pages)


# A picture smaller than this is an icon, a bullet or a logo, never text worth
# reading; it is left out before it is decoded.
MIN_PICTURE_PIXELS = 100 * 100


def _pdf_page_blobs(page: object, seen: set[tuple[int, int]] | None = None) -> list[bytes]:
    """The pictures of a page worth reading, as PNG.

    Each picture is judged by its size before it is decoded, and one used on
    many pages is decoded once. pypdf's `page.images` decodes every picture of
    the page, inline ones included, and spent 48 s a page on a 2054-page Vivado
    guide whose pictures were all icons: a day for one PDF, with nothing read.
    """
    try:
        resources = page.get("/Resources")  # type: ignore[attr-defined]
        resources = resources.get_object() if resources is not None else {}
        xobjects = resources.get("/XObject")
        xobjects = xobjects.get_object() if xobjects is not None else {}
    except Exception:
        return []
    blobs: list[bytes] = []
    for name in list(xobjects.keys()):
        try:
            reference = xobjects.raw_get(name)
            key = (reference.idnum, reference.generation) if hasattr(reference, "idnum") else None
            if key is not None and seen is not None:
                if key in seen:
                    continue
                seen.add(key)
            picture = xobjects[name].get_object()
            if picture.get("/Subtype") != "/Image":
                continue
            if int(picture.get("/Width", 0)) * int(picture.get("/Height", 0)) < MIN_PICTURE_PIXELS:
                continue
            image = picture.decode_as_image()
            data = io.BytesIO()
            image.save(data, format="PNG")
            blobs.append(data.getvalue())
        except Exception:
            continue  # a picture pypdf cannot decode is not worth the page
    return blobs


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
    image_text = _embedded_image_text(_docx_blobs(document), set())
    if image_text:
        parts.append(f"(image) {image_text}")
    return "\n".join(parts)


def _docx_blobs(document: object) -> Iterable[bytes]:
    try:
        image_parts = list(document.part.package.image_parts)
    except Exception:
        return []
    blobs: list[bytes] = []
    for image_part in image_parts:
        try:
            blobs.append(image_part.blob)
        except Exception:
            continue
    return blobs


def _parse_pptx(path: Path) -> str:
    try:
        from pptx import Presentation
    except ImportError as exc:
        raise RuntimeError("python-pptx is required to ingest PPTX files. Run: pnpm rag:install") from exc

    presentation = Presentation(str(path))
    slides: list[str] = []
    seen_hashes: set[str] = set()
    for slide_index, slide in enumerate(presentation.slides):
        texts: list[str] = []
        for shape in slide.shapes:
            if hasattr(shape, "text") and shape.text.strip():
                texts.append(shape.text.strip())
            # Every graphic frame has a `table` attribute, and on a chart or an
            # embedded object it raises instead of being absent, so ask has_table.
            if getattr(shape, "has_table", False):
                for row in shape.table.rows:
                    cells = [cell.text.strip() for cell in row.cells if cell.text.strip()]
                    if cells:
                        texts.append(" | ".join(cells))
        # Screenshots and diagrams carry text of their own; a logo repeated on
        # every slide is read once.
        image_text = _embedded_image_text(_pptx_blobs(slide.shapes), seen_hashes)
        if image_text:
            texts.append(f"(image) {image_text}")
        if texts:
            slides.append(f"[slide {slide_index + 1}]\n" + "\n".join(texts))
    return "\n\n".join(slides)


def _pptx_blobs(shapes: Iterable[object]) -> list[bytes]:
    """The embedded pictures of a slide, those inside groups included."""
    blobs: list[bytes] = []
    for shape in shapes:
        inner = getattr(shape, "shapes", None)  # a group
        if inner is not None:
            blobs.extend(_pptx_blobs(inner))
            continue
        try:
            image = getattr(shape, "image", None)
            blob = image.blob if image is not None else None
        except Exception:  # a linked picture has no embedded bytes
            blob = None
        if blob:
            blobs.append(blob)
    return blobs


def _cell_text(value: object) -> str:
    """One cell as text: blanks empty, whole floats without the .0, line breaks
    flattened so a row stays on one line."""
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    return " / ".join(part.strip() for part in str(value).splitlines() if part.strip())


def _parse_xlsx(path: Path) -> str:
    """Every worksheet as '[sheet <name>]' followed by its non-empty rows, cells
    joined with ' | ' like the CSV and PPTX tables. Formula cells give the value
    Excel last computed. Register maps and interface control documents are
    often spreadsheets, so the sheet name is kept: it is what a reader asks for."""
    try:
        from openpyxl import load_workbook
    except ImportError as exc:
        raise RuntimeError("openpyxl is required to ingest XLSX files. Run: pnpm rag:install") from exc

    workbook = load_workbook(str(path), read_only=True, data_only=True)
    try:
        sheets: list[str] = []
        for sheet in workbook.worksheets:
            rows: list[str] = []
            for row in sheet.iter_rows(values_only=True):
                cells = [_cell_text(value) for value in row]
                while cells and not cells[-1]:
                    cells.pop()
                if any(cells):
                    rows.append(" | ".join(cells))
            if rows:
                sheets.append(f"[sheet {sheet.title}]\n" + "\n".join(rows))
        return "\n\n".join(sheets)
    finally:
        workbook.close()
