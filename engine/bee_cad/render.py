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
from .panel import draw_panel
from .sheet import A3_H, A3_W, SheetContext, draw_frame, new_document
from .sld import draw_sld
from .text import TextMode, has_hebrew, to_visual


SHEET_KINDS = ("sld", "panel")


def build(design: Design, sheets: Iterable[str] = SHEET_KINDS, mode: TextMode = "unicode",
          one_file: bool = True) -> dict[str, tuple[Drawing, list[str]]]:
    """Return {sheet_name: (doc, warnings)}. With ``one_file`` every sheet goes into one DXF,
    laid out side by side in model space (one A3 per sheet, 30 mm apart)."""
    out: dict[str, tuple[Drawing, list[str]]] = {}
    sheets = list(sheets)
    doc = new_document(mode) if one_file else None
    idx = 0
    total = sum(1 if s == "sld" else len(design.boards) for s in sheets)
    for kind in sheets:
        if kind == "sld":
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
    import matplotlib

    matplotlib.use("Agg")
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
    fig.savefig(path, dpi=dpi, facecolor="white")
    plt.close(fig)
