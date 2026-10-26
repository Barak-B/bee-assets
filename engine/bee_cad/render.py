"""Build a document from a Design and render it: DXF (always), PNG/PDF previews (optional).

The preview copies the document and converts Hebrew to visual order so the matplotlib
backend (which has no bidi) shows the sheet the way AutoCAD will. The DXF itself keeps
logical order unless ``mode="shx"`` was requested.
"""
from __future__ import annotations

import copy
from pathlib import Path
from typing import Iterable

from ezdxf.document import Drawing

from .model import Design
from .mv import draw_mv, draw_mv_schedule
from .panel import draw_panel
from .report import calc_rows, draw_calc, rows_per_sheet
from .sheet import A3_H, A3_W, SheetContext, draw_frame, new_document
from .sld import draw_sld
from .text import TextMode, has_hebrew, to_visual


SHEET_KINDS = ("mv", "site", "sld", "panel", "calc", "earth", "schedule", "tests")
TEST_ROWS = 44          # rows per commissioning test sheet
SCHED_ROWS = 34         # cable rows per schedule sheet, leaving room for the sign table on the last
CALC_ROWS = 40          # rows that fit one calculation sheet (checked against the frame in draw_calc)


def build(design: Design, sheets: Iterable[str] = SHEET_KINDS, mode: TextMode = "unicode",
          one_file: bool = True) -> dict[str, tuple[Drawing, list[str]]]:
    """Return {sheet_name: (doc, warnings)}. With ``one_file`` every sheet goes into one DXF,
    laid out side by side in model space (one A3 per sheet, 30 mm apart)."""
    out: dict[str, tuple[Drawing, list[str]]] = {}
    sheets = list(sheets)
    doc = new_document(mode) if one_file else None
    idx = 0
    rows = calc_rows(design) if "calc" in sheets and design.boards else []
    calc_pages = [rows[i:i + CALC_ROWS] for i in range(0, len(rows), CALC_ROWS)]
    from .sheets_il import draw_earthing, draw_schedules, schedule_rows
    il = bool(design.pv or design.grid)
    sched = schedule_rows(design) if "schedule" in sheets and design.boards else []
    sched_pages = [sched[i:i + SCHED_ROWS] for i in range(0, len(sched), SCHED_ROWS)] or ([[]] if il else [])
    per_kind = {"mv": 2 * len(design.mv_boards), "sld": 1, "panel": len(design.boards), "calc": len(calc_pages),
                "earth": 1 if il else 0, "schedule": len(sched_pages) if "schedule" in sheets else 0}
    from .tests_sheet import draw_tests, test_rows
    trows = test_rows(design) if "tests" in sheets and design.boards else []
    test_pages = [trows[i:i + TEST_ROWS] for i in range(0, len(trows), TEST_ROWS)]
    per_kind["tests"] = len(test_pages)
    per_kind["site"] = 1 if design.site and design.site.roofs else 0
    total = sum(per_kind[s] for s in sheets)
    if not design.boards and "sld" in sheets:
        sheets.remove("sld")
        total -= 1
    for kind in sheets:
        if kind == "mv":
            for mb in design.mv_boards:
                no = design.title.sheet_no if not out else f"{design.title.sheet_no.split('-')[0]}-M{len(out) + 1:02d}"
                tb = design.title.model_copy(update={"sheet_index": idx + 1, "sheet_count": total, "sheet_no": no,
                                                     "sheet_title": design.title.sheet_title or f"חד-קווי מתח גבוה — {mb.title}"})
                d = doc or new_document(mode)
                ctx = SheetContext(d, d.modelspace(), mode, offset=((A3_W + 30.0) * idx if one_file else 0.0, 0.0))
                draw_frame(ctx, tb)
                warnings = draw_mv(ctx, design, mb)
                out[no] = (d, warnings)
                idx += 1
                tb2 = tb.model_copy(update={"sheet_index": idx + 1, "sheet_no": no + "A", "sheet_title": f"מפרט תאים וציוד — {mb.title}"})
                ctx2 = SheetContext(d, d.modelspace(), mode, offset=((A3_W + 30.0) * idx if one_file else 0.0, 0.0))
                draw_frame(ctx2, tb2)
                out[no + "A"] = (d, draw_mv_schedule(ctx2, design, mb))
                idx += 1
        elif kind == "sld":
            tb = design.title.model_copy(update={"sheet_index": idx + 1, "sheet_count": total})
            tb.sheet_title = tb.sheet_title or "חד-קווי — לוחות חשמל"
            d = doc or new_document(mode)
            ctx = SheetContext(d, d.modelspace(), mode, offset=((A3_W + 30.0) * idx if one_file else 0.0, 0.0))
            draw_frame(ctx, tb)
            warnings = draw_sld(ctx, design)
            out[tb.sheet_no] = (d, warnings)
            idx += 1
        elif kind == "panel":
            for b in design.boards:
                no = f"{design.title.sheet_no.split('-')[0]}-P{len(out) + 1:02d}"
                tb = design.title.model_copy(update={"sheet_index": idx + 1, "sheet_count": total, "sheet_no": no,
                                                     "sheet_title": f"מבנה לוח {b.id} — חזית וחתך", "scale": "לפי ציון"})
                d = doc or new_document(mode)
                ctx = SheetContext(d, d.modelspace(), mode, offset=((A3_W + 30.0) * idx if one_file else 0.0, 0.0))
                draw_frame(ctx, tb)
                warnings = draw_panel(ctx, design, b)
                out[no] = (d, warnings)
                idx += 1
        elif kind == "calc" and calc_pages:
            from .checks import check
            findings = check(design.model_copy(deep=True))
            for k, page in enumerate(calc_pages):
                no = f"{design.title.sheet_no.split('-')[0]}-C{k + 1:02d}"
                tb = design.title.model_copy(update={"sheet_index": idx + 1, "sheet_count": total, "sheet_no": no,
                                                     "sheet_title": "דף חישובים — כבלים, מפל מתח וזרם קצר"})
                d = doc or new_document(mode)
                ctx = SheetContext(d, d.modelspace(), mode, offset=((A3_W + 30.0) * idx if one_file else 0.0, 0.0))
                draw_frame(ctx, tb)
                warn = [] if len(page) <= rows_per_sheet(ctx) else [f"calc sheet {no}: {len(page)} rows overflow"]
                out[no] = (d, warn + draw_calc(ctx, design, page, k == 0, findings))
                idx += 1
        elif kind == "site" and per_kind["site"]:
            from .site import draw_site, site_scale
            no = f"{design.title.sheet_no.split('-')[0]}-A01"
            d = doc or new_document(mode)
            ctx = SheetContext(d, d.modelspace(), mode, offset=((A3_W + 30.0) * idx if one_file else 0.0, 0.0))
            tb = design.title.model_copy(update={"sheet_index": idx + 1, "sheet_count": total, "sheet_no": no,
                                                 "sheet_title": "תוכנית העמדה — גגות ופאנלים",
                                                 "scale": f"1:{site_scale(ctx, design)}"})
            draw_frame(ctx, tb)
            out[no] = (d, draw_site(ctx, design)[0])
            idx += 1
        elif kind == "earth" and il:
            no = f"{design.title.sheet_no.split('-')[0]}-G01"
            tb = design.title.model_copy(update={"sheet_index": idx + 1, "sheet_count": total, "sheet_no": no,
                                                 "sheet_title": "תוכנית הארקה והשוואת פוטנציאלים", "scale": "ללא"})
            d = doc or new_document(mode)
            ctx = SheetContext(d, d.modelspace(), mode, offset=((A3_W + 30.0) * idx if one_file else 0.0, 0.0))
            draw_frame(ctx, tb)
            out[no] = (d, draw_earthing(ctx, design))
            idx += 1
        elif kind == "schedule":
            for k, page in enumerate(sched_pages):
                no = f"{design.title.sheet_no.split('-')[0]}-S{k + 1:02d}"
                tb = design.title.model_copy(update={"sheet_index": idx + 1, "sheet_count": total, "sheet_no": no,
                                                     "sheet_title": "טבלת כבלים, שילוט ומסמכים", "scale": "ללא"})
                d = doc or new_document(mode)
                ctx = SheetContext(d, d.modelspace(), mode, offset=((A3_W + 30.0) * idx if one_file else 0.0, 0.0))
                draw_frame(ctx, tb)
                out[no] = (d, draw_schedules(ctx, design, page, il and k == len(sched_pages) - 1))
                idx += 1
        elif kind == "tests":
            for k, page in enumerate(test_pages):
                no = f"{design.title.sheet_no.split('-')[0]}-T{k + 1:02d}"
                tb = design.title.model_copy(update={"sheet_index": idx + 1, "sheet_count": total, "sheet_no": no,
                                                     "sheet_title": "טופס בדיקות מסירה", "scale": "ללא"})
                d = doc or new_document(mode)
                ctx = SheetContext(d, d.modelspace(), mode, offset=((A3_W + 30.0) * idx if one_file else 0.0, 0.0))
                draw_frame(ctx, tb)
                out[no] = (d, draw_tests(ctx, page, k == len(test_pages) - 1))
                idx += 1
    return out


def save_dxf(doc: Drawing, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    doc.saveas(path)


def _visual_copy(doc: Drawing) -> Drawing:
    """Deep copy with Hebrew strings in visual order for backends without bidi."""
    vdoc = copy.deepcopy(doc)
    for layout in (vdoc.modelspace(),):
        for e in layout:
            t = e.dxftype()
            if t == "TEXT" and has_hebrew(e.dxf.text):
                e.dxf.text = to_visual(e.dxf.text)
            elif t == "MTEXT" and has_hebrew(e.text):
                width = e.dxf.get("width", 0.0) or 0.0
                chars = int(width / (CHAR_W * e.dxf.char_height)) if width else 0
                e.text = "\\P".join(to_visual(ln) for p in e.text.split("\\P") for ln in _wrap(p, chars))
                e.dxf.width = 0.0       # wrapped here; the backend must not wrap the reversed lines again
    return vdoc


CHAR_W = 0.6            # mean glyph width / text height (Arial, mixed Hebrew/Latin), a little generous


def _wrap(par: str, chars: int) -> list[str]:
    """Break a logical-order paragraph into lines BEFORE the visual reorder: a backend that wraps the
    reversed string would move the first words to the last line."""
    if chars <= 0 or len(par) <= chars:
        return [par]
    lines, cur = [], ""
    for word in par.split(" "):
        if cur and len(cur) + 1 + len(word) > chars:
            lines.append(cur)
            cur = word
        else:
            cur = f"{cur} {word}" if cur else word
    return lines + [cur]


def render_png(doc: Drawing, path: Path, dpi: int = 110, sheet_index: int = 0, already_visual: bool = False) -> None:
    """Render one A3 sheet (by index when several sheets share the model space) to PNG."""
    _render_sheet(doc, path, dpi, sheet_index, already_visual)


def render_pdf(doc: Drawing, path: Path, sheet_index: int = 0, already_visual: bool = False) -> None:
    """Render one A3 sheet to a compact vector PDF page (exact A3 landscape) with the PyMuPDF backend."""
    from ezdxf.addons.drawing import Frontend, RenderContext, layout
    from ezdxf.addons.drawing.config import Configuration, LineweightPolicy
    from ezdxf.addons.drawing.properties import LayoutProperties
    from ezdxf.addons.drawing.pymupdf import PyMuPdfBackend
    from ezdxf.math import BoundingBox

    vdoc = doc if already_visual else _visual_copy(doc)
    msp = vdoc.modelspace()
    ctx = RenderContext(vdoc)
    props = LayoutProperties.from_layout(msp)
    props.set_colors("#FFFFFF")
    backend = PyMuPdfBackend()
    cfg = Configuration(lineweight_policy=LineweightPolicy.ABSOLUTE, min_lineweight=0.13)
    Frontend(ctx, backend, config=cfg).draw_layout(msp, finalize=False, layout_properties=props)
    x0 = (A3_W + 30.0) * sheet_index
    page = layout.Page(A3_W, A3_H, layout.Units.mm, margins=layout.Margins.all(0))
    data = backend.get_pdf_bytes(page, settings=layout.Settings(fit_page=False, scale=1.0),
                                 render_box=BoundingBox([(x0, 0.0), (x0 + A3_W, A3_H)]))
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)


def merge_pdfs(pages: list[Path], out: Path) -> None:
    from pypdf import PdfWriter

    w = PdfWriter()
    for p in pages:
        w.append(str(p))
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out, "wb") as fh:
        w.write(fh)


def _render_sheet(doc: Drawing, path: Path, dpi: int, sheet_index: int, already_visual: bool) -> None:
    import matplotlib

    matplotlib.use("Agg")
    matplotlib.rcParams["pdf.fonttype"] = 42
    matplotlib.rcParams["pdf.compression"] = 9
    import matplotlib.pyplot as plt
    from ezdxf.addons.drawing import Frontend, RenderContext
    from ezdxf.addons.drawing.config import Configuration, LineweightPolicy
    from ezdxf.addons.drawing.properties import LayoutProperties
    from ezdxf.addons.drawing.matplotlib import MatplotlibBackend

    vdoc = doc if already_visual else _visual_copy(doc)
    msp = vdoc.modelspace()
    fig = plt.figure(figsize=(A3_W / 25.4, A3_H / 25.4), dpi=dpi)
    ax = fig.add_axes([0, 0, 1, 1])
    ctx = RenderContext(vdoc)
    props = LayoutProperties.from_layout(msp)
    props.set_colors("#FFFFFF")                     # white paper: ACI 7 renders black
    backend = MatplotlibBackend(ax)
    cfg = Configuration(lineweight_policy=LineweightPolicy.ABSOLUTE, min_lineweight=0.13)
    Frontend(ctx, backend, config=cfg).draw_layout(msp, finalize=False, layout_properties=props)
    x0 = (A3_W + 30.0) * sheet_index
    ax.set_xlim(x0 - 1.0, x0 + A3_W + 1.0)
    ax.set_ylim(-1.0, A3_H + 1.0)
    ax.set_aspect("equal")
    ax.axis("off")
    fig.patch.set_facecolor("white")
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.suffix.lower() == ".pdf":
        fig.savefig(path, format="pdf", facecolor="white")
    else:
        fig.savefig(path, dpi=dpi, facecolor="white")
    plt.close(fig)
