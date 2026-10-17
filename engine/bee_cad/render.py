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

from .cover import SheetEntry, draw_cover
from .model import Design
from .mv import draw_mv, draw_mv_schedule
from .panel import draw_panel
from .sheet import A3_H, A3_W, SheetContext, draw_frame, new_document
from .sld import draw_sld
from .template import DrillTemplate, draw_template, scale_text
from .text import TextMode, has_hebrew, to_visual


SHEET_KINDS = ("cover", "mv", "sld", "panel", "drill")


def plan_sheets(design: Design, sheets: Iterable[str] = SHEET_KINDS) -> list[SheetEntry]:
    """The set, in order, before anything is drawn: the cover lists exactly these sheets."""
    prefix = design.title.sheet_no.split("-")[0]
    plan: list[SheetEntry] = []
    kinds = [k for k in sheets if k in SHEET_KINDS]
    if "cover" in kinds and len(kinds) > 1:
        plan.append(SheetEntry("cover", f"{prefix}-00", "דף שער — רשימת גיליונות ונתוני הפרויקט"))
    for kind in kinds:
        if kind == "mv":
            for i, mb in enumerate(design.mv_boards):
                no = design.title.sheet_no if i == 0 else f"{prefix}-M{i + 1:02d}"
                plan.append(SheetEntry("mv", no, design.title.sheet_title or f"חד-קווי מתח גבוה — {mb.title}"))
                plan.append(SheetEntry("mv_schedule", no + "A", f"מפרט תאים וציוד — {mb.title}"))
        elif kind == "sld" and design.boards:
            plan.append(SheetEntry("sld", design.title.sheet_no, design.title.sheet_title or "חד-קווי — לוחות חשמל"))
        elif kind == "panel":
            for b in design.boards:
                plan.append(SheetEntry("panel", f"{prefix}-P{len(plan) + 1:02d}", f"מבנה לוח {b.id} — חזית וחתך", "לפי ציון"))
        elif kind == "drill" and design.drill_template:
            t = DrillTemplate.model_validate(design.drill_template)
            plan.append(SheetEntry("drill", design.title.sheet_no, design.title.sheet_title or t.title, scale_text(t)))
    return plan


def build(design: Design, sheets: Iterable[str] = SHEET_KINDS, mode: TextMode = "unicode",
          one_file: bool = True) -> dict[str, tuple[Drawing, list[str]]]:
    """Return {sheet_no: (doc, warnings)}. With ``one_file`` every sheet goes into one DXF,
    laid out side by side in model space (one A3 per sheet, 30 mm apart)."""
    out: dict[str, tuple[Drawing, list[str]]] = {}
    plan = plan_sheets(design, sheets)
    doc = new_document(mode) if one_file else None
    mv_iter = iter(design.mv_boards)
    board_iter = iter(design.boards)
    cur_mv = None
    for idx, e in enumerate(plan):
        d = doc or new_document(mode)
        ctx = SheetContext(d, d.modelspace(), mode, offset=((A3_W + 30.0) * idx if one_file else 0.0, 0.0))
        tb = design.title.model_copy(update={"sheet_index": idx + 1, "sheet_count": len(plan), "sheet_no": e.no,
                                             "sheet_title": e.title, "scale": e.scale if e.scale != "-" else design.title.scale})
        if e.kind == "cover":
            tb.scale = "-"
        draw_frame(ctx, tb)
        if e.kind == "cover":
            warnings = draw_cover(ctx, design, plan)
        elif e.kind == "mv":
            cur_mv = next(mv_iter)
            warnings = draw_mv(ctx, design, cur_mv)
        elif e.kind == "mv_schedule":
            warnings = draw_mv_schedule(ctx, design, cur_mv)
        elif e.kind == "sld":
            warnings = draw_sld(ctx, design)
        elif e.kind == "panel":
            warnings = draw_panel(ctx, design, next(board_iter))
        else:
            warnings = draw_template(ctx, DrillTemplate.model_validate(design.drill_template))
        out[e.no] = (d, warnings)
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
                e.text = "\\P".join(to_visual(p) for p in e.text.split("\\P"))
    return vdoc


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
