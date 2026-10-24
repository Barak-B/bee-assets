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

from .comm import CommNetwork, draw_comm
from .cover import SheetEntry, draw_cover
from .schedules import CABLE_COLS, LOAD_COLS, cable_rows, draw_cable_schedule, draw_general_notes, draw_load_schedule, load_rows, rows_per_page
from .earthing import Earthing, draw_earthing
from .model import Design
from .mv import draw_mv, draw_mv_schedule
from .panel import draw_panel
from .sheet import A3_H, A3_W, SheetContext, draw_frame, new_document
from .site import SiteLayout, draw_site, site_scale
from .sld import draw_sld
from .template import DrillTemplate, draw_template, scale_text
from .text import TextMode, has_hebrew, to_visual


SHEET_KINDS = ("cover", "notes", "site", "mv", "sld", "earthing", "comm", "panel", "drill", "schedules")


def plan_sheets(design: Design, sheets: Iterable[str] = SHEET_KINDS) -> list[SheetEntry]:
    """The set, in order, before anything is drawn: the cover lists exactly these sheets."""
    prefix = design.title.sheet_no.split("-")[0]
    plan: list[SheetEntry] = []
    kinds = [k for k in sheets if k in SHEET_KINDS]
    if "cover" in kinds and len(kinds) > 1:
        plan.append(SheetEntry("cover", f"{prefix}-00", "דף שער — רשימת גיליונות ונתוני הפרויקט"))
    for kind in kinds:
        if kind == "notes" and len(kinds) > 1:
            plan.append(SheetEntry("notes", f"{prefix}-01", "הערות כלליות, מקרא סמלים וקיצורים"))
        elif kind == "schedules" and design.boards and design.schedules:
            n_cab = len(cable_rows(design))
            n_load = len(load_rows(design)[0])
            per = 36
            for p in range((n_cab + per - 1) // per or 1):
                plan.append(SheetEntry("cables", f"{prefix}-30" + ("" if p == 0 else chr(ord("A") + p - 1)), "רשימת כבלים"))
            for p in range((n_load + per - 1) // per or 1):
                plan.append(SheetEntry("loads", f"{prefix}-31" + ("" if p == 0 else chr(ord("A") + p - 1)), "טבלת עומסים וסיכום לפי לוח"))
        elif kind == "mv":
            for i, mb in enumerate(design.mv_boards):
                no = design.title.sheet_no if i == 0 else f"{prefix}-M{i + 1:02d}"
                plan.append(SheetEntry("mv", no, design.title.sheet_title or f"חד-קווי מתח גבוה — {mb.title}"))
                plan.append(SheetEntry("mv_schedule", no + "A", f"מפרט תאים וציוד — {mb.title}"))
        elif kind == "site" and design.site and design.drill_template:
            lay = SiteLayout.model_validate(design.site)
            t = DrillTemplate.model_validate(design.drill_template)
            plan.append(SheetEntry("site", lay.sheet_no, lay.title, f"1:{int(site_scale(t, lay))}"))
        elif kind == "sld" and design.boards:
            if design.sld_groups:
                for g in design.sld_groups:
                    plan.append(SheetEntry("sld", g.sheet_no, g.title))
            else:
                plan.append(SheetEntry("sld", design.title.sheet_no, design.title.sheet_title or "חד-קווי — לוחות חשמל"))
        elif kind == "earthing" and design.earthing:
            e = Earthing.model_validate(design.earthing)
            plan.append(SheetEntry("earthing", e.sheet_no, e.title))
        elif kind == "comm" and design.comm:
            n = CommNetwork.model_validate(design.comm)
            plan.append(SheetEntry("comm", n.sheet_no, n.title))
        elif kind == "panel":
            for b in design.boards:
                plan.append(SheetEntry("panel", f"{prefix}-P{len(plan) + 1:02d}", f"מבנה לוח {b.id} — חזית וחתך", "לפי ציון"))
        elif kind == "drill" and design.drill_template:
            t = DrillTemplate.model_validate(design.drill_template)
            plan.append(SheetEntry("drill", t.sheet_no, t.title, scale_text(t)))
    return plan


def sld_subset(design: Design, sheet_no: str) -> Design:
    """The design restricted to one SLD group (boards + nodes + the group's notes)."""
    g = next(x for x in design.sld_groups if x.sheet_no == sheet_no)
    return design.model_copy(update={"boards": [b for b in design.boards if b.id in g.boards],
                                     "nodes": [n for n in design.nodes if n.id in g.nodes],
                                     "notes": g.notes or design.notes, "sld_groups": []})


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
        elif e.kind == "notes":
            warnings = draw_general_notes(ctx, design)
        elif e.kind == "cables":
            rows = cable_rows(design)
            pages = [x for x in plan if x.kind == "cables"]
            pno = pages.index(e)
            warnings = draw_cable_schedule(ctx, design, rows[pno * 36:(pno + 1) * 36], pno + 1, len(pages))
        elif e.kind == "loads":
            rows, summary = load_rows(design)
            pages = [x for x in plan if x.kind == "loads"]
            pno = pages.index(e)
            warnings = draw_load_schedule(ctx, design, rows[pno * 36:(pno + 1) * 36], summary, pno + 1, len(pages))
        elif e.kind == "mv":
            cur_mv = next(mv_iter)
            warnings = draw_mv(ctx, design, cur_mv)
        elif e.kind == "mv_schedule":
            warnings = draw_mv_schedule(ctx, design, cur_mv)
        elif e.kind == "site":
            warnings = draw_site(ctx, design, SiteLayout.model_validate(design.site))
        elif e.kind == "sld":
            warnings = draw_sld(ctx, sld_subset(design, e.no) if design.sld_groups else design, design)
        elif e.kind == "earthing":
            warnings = draw_earthing(ctx, design, Earthing.model_validate(design.earthing))
        elif e.kind == "comm":
            warnings = draw_comm(ctx, design, CommNetwork.model_validate(design.comm))
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


def render_set(doc: Drawing, sheet_nos: list[str], out_dir: Path, stem: str, png: bool = True, pdf: bool = True,
               dpi: int = 110) -> tuple[dict[str, Path], dict[str, Path]]:
    """Render every sheet of a multi-sheet document drawing the model space **once**.

    The per-sheet functions redraw the whole layout for each page (O(n²) on big sets); here the
    frontend records all entities once and each page is cut out with its own render box / view.
    Returns ({sheet_no: png_path}, {sheet_no: pdf_path})."""
    from ezdxf.addons.drawing import Frontend, RenderContext, layout
    from ezdxf.addons.drawing.config import Configuration, LineweightPolicy
    from ezdxf.addons.drawing.properties import LayoutProperties
    from ezdxf.math import BoundingBox

    from ezdxf import bbox as _bbox

    vdoc = _visual_copy(doc)
    msp = vdoc.modelspace()
    props = LayoutProperties.from_layout(msp)
    props.set_colors("#FFFFFF")
    cfg = Configuration(lineweight_policy=LineweightPolicy.ABSOLUTE, min_lineweight=0.13)
    pngs: dict[str, Path] = {}
    pdfs: dict[str, Path] = {}
    out_dir.mkdir(parents=True, exist_ok=True)
    # which sheet does each entity belong to? (by the x of its extents centre) — so every page only
    # carries its own entities; otherwise each PDF page embeds the whole set (≈5 MB per page)
    pitch = A3_W + 30.0
    sheet_of: dict[str, int] = {}
    for e in msp:
        try:
            ext = _bbox.extents([e], fast=True)
            cx = (ext.extmin.x + ext.extmax.x) / 2 if ext.has_data else 0.0
        except Exception:
            cx = 0.0
        sheet_of[e.dxf.handle] = int(max(0.0, cx + 15.0) // pitch)
    if pdf:
        from ezdxf.addons.drawing.pymupdf import PyMuPdfBackend

        page = layout.Page(A3_W, A3_H, layout.Units.mm, margins=layout.Margins.all(0))
        (out_dir / "sheets").mkdir(exist_ok=True)
        for i, no in enumerate(sheet_nos):
            backend = PyMuPdfBackend()
            Frontend(RenderContext(vdoc), backend, config=cfg).draw_layout(
                msp, finalize=False, layout_properties=props, filter_func=lambda e, i=i: sheet_of.get(e.dxf.handle, -1) == i)
            x0 = pitch * i
            data = backend.get_pdf_bytes(page, settings=layout.Settings(fit_page=False, scale=1.0),
                                         render_box=BoundingBox([(x0, 0.0), (x0 + A3_W, A3_H)]))
            p = out_dir / "sheets" / f"{stem}_{no}.pdf"
            p.write_bytes(data)
            pdfs[no] = p
    if png:
        import matplotlib

        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        from ezdxf.addons.drawing.matplotlib import MatplotlibBackend

        for i, no in enumerate(sheet_nos):
            fig = plt.figure(figsize=(A3_W / 25.4, A3_H / 25.4), dpi=dpi)
            ax = fig.add_axes([0, 0, 1, 1])
            Frontend(RenderContext(vdoc), MatplotlibBackend(ax), config=cfg).draw_layout(
                msp, finalize=False, layout_properties=props, filter_func=lambda e, i=i: sheet_of.get(e.dxf.handle, -1) == i)
            ax.set_aspect("equal")
            ax.axis("off")
            fig.patch.set_facecolor("white")
            x0 = pitch * i
            ax.set_xlim(x0 - 1.0, x0 + A3_W + 1.0)
            ax.set_ylim(-1.0, A3_H + 1.0)
            p = out_dir / f"{stem}_{no}.png"
            fig.savefig(p, dpi=dpi, facecolor="white")
            pngs[no] = p
            plt.close(fig)
    return pngs, pdfs


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
