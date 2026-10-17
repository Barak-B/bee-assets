"""A3 sheet: frame, 12×8 grid, header strip, revision table and the office title block.

Layout follows the office's own sets (E-xx sheets of ברק הנדסת חשמל): sheet number box at the
top-left, sheet title at the top-right, title block at the bottom-right with the revisions
table above it. All text goes through :func:`SheetContext.text` so the Hebrew mode is applied
in one place.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import ezdxf
from ezdxf.document import Drawing
from ezdxf.enums import TextEntityAlignment as TA
from ezdxf.layouts import Modelspace

from .layers import LAYERS, ensure_layers
from .model import TitleBlock
from .symbols import ensure_symbols
from .text import TextMode, encode, has_hebrew

A3_W, A3_H = 420.0, 297.0
MARGIN_L, MARGIN = 20.0, 10.0
GRID = 6.0        # width of the grid strip inside the frame
COLS, ROWS = 12, 8
TB_W, TB_H = 150.0, 40.0


@dataclass
class SheetContext:
    doc: Drawing
    msp: Modelspace
    mode: TextMode = "unicode"
    offset: tuple[float, float] = (0.0, 0.0)   # sheet origin in model space (for multi-sheet files)
    # inner drawing area (after frame + grid strip)
    x0: float = field(init=False)
    y0: float = field(init=False)
    x1: float = field(init=False)
    y1: float = field(init=False)

    def __post_init__(self) -> None:
        ox, oy = self.offset
        self.x0 = ox + MARGIN_L + GRID
        self.y0 = oy + MARGIN + GRID
        self.x1 = ox + A3_W - MARGIN - GRID
        self.y1 = oy + A3_H - MARGIN - GRID

    # ---- text helpers -------------------------------------------------------------
    def style_for(self, s: str) -> str:
        if has_hebrew(s):
            return "BEE-HEB-SHX" if self.mode == "shx" else "BEE-HEB"
        return "BEE-LAT"

    def text(self, s: str, pos: tuple[float, float], h: float = 2.5, layer: str = "sld_text",
             align: TA = TA.LEFT, rotation: float = 0.0, bold: bool = False) -> None:
        if not s:
            return
        style = self.style_for(s)
        if bold and style == "BEE-HEB":
            style = "BEE-HEB-B"
        ent = self.msp.add_text(
            encode(s, self.mode),
            dxfattribs={"layer": LAYERS[layer].name, "height": h, "style": style, "rotation": rotation},
        )
        ent.set_placement(pos, align=align)

    def mtext(self, lines: list[str], pos: tuple[float, float], h: float = 2.2, layer: str = "notes",
              width: float = 80.0, rtl: bool | None = None) -> None:
        if not lines:
            return
        rtl = rtl if rtl is not None else any(has_hebrew(x) for x in lines)
        attach = ezdxf.enums.MTextEntityAlignment.TOP_RIGHT if rtl else ezdxf.enums.MTextEntityAlignment.TOP_LEFT
        style = "BEE-HEB" if rtl else "BEE-LAT"
        if rtl and self.mode == "shx":
            style = "BEE-HEB-SHX"
        body = "\\P".join(encode(x, self.mode) for x in lines)
        mt = self.msp.add_mtext(body, dxfattribs={"layer": LAYERS[layer].name, "char_height": h, "style": style, "width": width})
        mt.set_location(pos, attachment_point=attach)
        if rtl:
            mt.dxf.flow_direction = 1

    # ---- drawing helpers ----------------------------------------------------------
    def line(self, a, b, layer: str = "sld_main") -> None:
        self.msp.add_line(a, b, dxfattribs={"layer": LAYERS[layer].name})

    def rect(self, x: float, y: float, w: float, h: float, layer: str = "frame") -> None:
        self.msp.add_lwpolyline([(x, y), (x + w, y), (x + w, y + h), (x, y + h)], close=True,
                                dxfattribs={"layer": LAYERS[layer].name})

    def insert(self, block: str, pos: tuple[float, float], layer: str = "sld_sym", rotation: float = 0.0, scale: float = 1.0) -> None:
        self.msp.add_blockref(block, pos, dxfattribs={"layer": LAYERS[layer].name, "rotation": rotation,
                                                      "xscale": scale, "yscale": scale})


def new_document(mode: TextMode = "unicode") -> Drawing:
    doc = ezdxf.new("R2018", setup=True)
    doc.header["$INSUNITS"] = 4          # millimetres
    doc.header["$LWDISPLAY"] = 1
    # Text styles: Hebrew TrueType (Arial has Hebrew glyphs on every Windows), Latin ISO, legacy SHX.
    if "BEE-HEB" not in doc.styles:
        doc.styles.add("BEE-HEB", font="arial.ttf")
    if "BEE-HEB-B" not in doc.styles:
        doc.styles.add("BEE-HEB-B", font="arialbd.ttf")
    if "BEE-LAT" not in doc.styles:
        doc.styles.add("BEE-LAT", font="isocp.shx")
    if "BEE-HEB-SHX" not in doc.styles:
        doc.styles.add("BEE-HEB-SHX", font="HEBREW.SHX")
    ensure_layers(doc)
    ensure_symbols(doc)
    return doc


def draw_frame(ctx: SheetContext, tb: TitleBlock) -> None:
    ox, oy = ctx.offset
    fx0, fy0 = ox + MARGIN_L, oy + MARGIN
    fx1, fy1 = ox + A3_W - MARGIN, oy + A3_H - MARGIN
    # outer + inner frame
    ctx.rect(ox, oy, A3_W, A3_H, "grid")
    ctx.rect(fx0, fy0, fx1 - fx0, fy1 - fy0, "frame")
    ctx.rect(ctx.x0, ctx.y0, ctx.x1 - ctx.x0, ctx.y1 - ctx.y0, "frame")
    # grid strips: columns 1..12 along top/bottom, rows A..H along the sides
    cw = (ctx.x1 - ctx.x0) / COLS
    rh = (ctx.y1 - ctx.y0) / ROWS
    for i in range(1, COLS):
        x = ctx.x0 + i * cw
        ctx.line((x, fy0), (x, ctx.y0), "grid")
        ctx.line((x, ctx.y1), (x, fy1), "grid")
    for i in range(COLS):
        x = ctx.x0 + (i + 0.5) * cw
        ctx.text(str(i + 1), (x, fy0 + GRID / 2), 2.0, "grid", TA.MIDDLE_CENTER)
        ctx.text(str(i + 1), (x, fy1 - GRID / 2), 2.0, "grid", TA.MIDDLE_CENTER)
    for i in range(1, ROWS):
        y = ctx.y0 + i * rh
        ctx.line((fx0, y), (ctx.x0, y), "grid")
        ctx.line((ctx.x1, y), (fx1, y), "grid")
    for i in range(ROWS):
        y = ctx.y1 - (i + 0.5) * rh
        ctx.text(chr(ord("A") + i), (fx0 + GRID / 2, y), 2.0, "grid", TA.MIDDLE_CENTER)
        ctx.text(chr(ord("A") + i), (fx1 - GRID / 2, y), 2.0, "grid", TA.MIDDLE_CENTER)

    # header strip: sheet number box top-left, project (small) next to it, title top-right
    hy = ctx.y1 - 9.0
    ctx.line((ctx.x0, hy), (ctx.x1, hy), "frame")
    ctx.rect(ctx.x0, hy, 24.0, 9.0, "frame")
    ctx.text(tb.sheet_no, (ctx.x0 + 12.0, hy + 4.5), 5.0, "frame_text", TA.MIDDLE_CENTER)
    ctx.text(f"{tb.project} — {tb.site}" if tb.site else tb.project, (ctx.x0 + 27.0, hy + 4.5), 2.2, "frame_text", TA.MIDDLE_LEFT)
    ctx.text(tb.sheet_title, (ctx.x1 - 3.0, hy + 4.5), 4.5, "frame_text", TA.MIDDLE_RIGHT, bold=True)

    # title block bottom-right
    tx0, ty0 = ctx.x1 - TB_W, ctx.y0
    ctx.rect(tx0, ty0, TB_W, TB_H, "frame")
    rows = [8.0, 10.0, 12.0, 10.0]  # from bottom: numbers row, sheet title, project, status/designer
    y = ty0
    for rh_ in rows[:-1]:
        y += rh_
        ctx.line((tx0, y), (tx0 + TB_W, y), "frame")
    # bottom numbers row: sheet n/N | scale | date | rev | sheet no
    cols = [26.0, 30.0, 36.0, 22.0, 36.0]
    labels = ["גיליון", "קנ\"מ", "תאריך", "מהדורה", "מס' תוכנית"]
    values = [f"{tb.sheet_index}/{tb.sheet_count}", tb.scale, tb.date, tb.revision, tb.sheet_no]
    x = tx0 + TB_W
    for w, lab, val in zip(cols, labels, values):
        x -= w
        ctx.line((x, ty0), (x, ty0 + rows[0]), "frame")
        ctx.text(lab, (x + w - 1.0, ty0 + rows[0] - 1.6), 1.4, "frame_text", TA.TOP_RIGHT)
        ctx.text(val, (x + w / 2, ty0 + 2.8), 3.0, "frame_text", TA.MIDDLE_CENTER, bold=True)
    y = ty0 + rows[0]
    ctx.text("שם התוכנית", (tx0 + TB_W - 1.0, y + rows[1] - 1.6), 1.4, "frame_text", TA.TOP_RIGHT)
    ctx.text(tb.sheet_title, (tx0 + TB_W - 3.0, y + 3.5), 3.6, "frame_text", TA.MIDDLE_RIGHT, bold=True)
    y += rows[1]
    ctx.text("פרויקט", (tx0 + TB_W - 1.0, y + rows[2] - 1.6), 1.4, "frame_text", TA.TOP_RIGHT)
    ctx.text(tb.project, (tx0 + TB_W - 3.0, y + 5.0), 4.0, "frame_text", TA.MIDDLE_RIGHT, bold=True)
    ctx.text(tb.site, (tx0 + 3.0, y + 5.0), 2.2, "frame_text", TA.MIDDLE_LEFT)
    y += rows[2]
    ctx.text("מתכנן", (tx0 + TB_W - 1.0, y + rows[3] - 1.6), 1.4, "frame_text", TA.TOP_RIGHT)
    ctx.text(tb.designer, (tx0 + TB_W - 3.0, y + 4.5), 3.2, "frame_text", TA.MIDDLE_RIGHT, bold=True)
    ctx.text(tb.status, (tx0 + 3.0, y + 4.5), 2.4, "frame_text", TA.MIDDLE_LEFT)
    if tb.client:
        ctx.text(f"מזמין: {tb.client}", (tx0 + 40.0, y + 4.5), 2.0, "frame_text", TA.MIDDLE_LEFT)

    # revisions table above the title block
    revs = tb.revisions or [(tb.revision, tb.date, "הגשה ראשונה")]
    rv_h = 5.0
    ry = ty0 + TB_H
    ctx.rect(tx0, ry, TB_W, rv_h * (len(revs) + 1), "frame")
    ctx.line((tx0, ry + rv_h * len(revs)), (tx0 + TB_W, ry + rv_h * len(revs)), "frame")
    for cx in (tx0 + 12.0, tx0 + 36.0):
        ctx.line((cx, ry), (cx, ry + rv_h * (len(revs) + 1)), "frame")
    hdr_y = ry + rv_h * len(revs) + rv_h / 2
    ctx.text("מהד'", (tx0 + 6.0, hdr_y), 1.8, "frame_text", TA.MIDDLE_CENTER)
    ctx.text("תאריך", (tx0 + 24.0, hdr_y), 1.8, "frame_text", TA.MIDDLE_CENTER)
    ctx.text("מהות העדכון", (tx0 + TB_W - 2.0, hdr_y), 1.8, "frame_text", TA.MIDDLE_RIGHT)
    for i, (r, d, t) in enumerate(reversed(revs)):
        yy = ry + i * rv_h + rv_h / 2
        ctx.text(r, (tx0 + 6.0, yy), 1.8, "frame_text", TA.MIDDLE_CENTER)
        ctx.text(d, (tx0 + 24.0, yy), 1.8, "frame_text", TA.MIDDLE_CENTER)
        ctx.text(t, (tx0 + TB_W - 2.0, yy), 1.8, "frame_text", TA.MIDDLE_RIGHT)
