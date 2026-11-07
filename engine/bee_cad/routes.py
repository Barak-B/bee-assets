"""Route schematic (תרשים תוואים) and the overhead-span detail (מתיחה בין מבנים).

For small sites that have no surveyed plan: a not-to-scale schematic of the buildings / boards and the
cable routes between them, each route labelled with its length, cable and method (underground,
overhead on a messenger wire, existing), a route table, and — when the design has a span — a detail of
the messenger wire stretched between two buildings (anchors, sag, clearance, cables, drops).

Lengths come from the site visit; every length that was not measured is marked ``*`` and listed for
verification. Nothing here is a survey.
"""
from __future__ import annotations

from typing import Literal, Optional

from ezdxf.enums import TextEntityAlignment as TA
from pydantic import BaseModel, Field

from .cover import _wrap
from .layers import LAYERS
from .model import Design
from .schedules import Column, draw_table
from .sheet import SheetContext, TB_H, TB_W

NodeKind = Literal["niche", "house", "building", "warehouse", "board", "pv", "other"]
Method = Literal["underground", "overhead", "tray", "existing"]


class RouteNode(BaseModel):
    id: str
    label: str
    sublabel: str = ""
    kind: NodeKind = "building"
    x: float                      # schematic position, 0..100 across the drawing area
    y: float                      # 0..100 up the drawing area
    w: float = 26.0               # box size on the sheet (mm)
    h: float = 13.0
    note: str = ""


class RouteLink(BaseModel):
    tag: str                      # "R1"
    a: str
    b: str
    length_m: Optional[float] = None
    measured: bool = False        # False → "*" (estimate from the visit)
    cable: str = ""
    method: Method = "underground"
    status: Literal["new", "existing", "option"] = "new"
    note: str = ""


class Span(BaseModel):
    """Messenger wire stretched between two buildings, carrying cables."""

    a: str
    b: str
    span_m: float = 12.0
    height_m: float = 4.5                 # messenger height at the anchors
    clearance_min_m: float = 4.0          # lowest point above the passage
    sag_pct: float = 2.0                  # sag as % of the span
    messenger: str = "כבל פלדה מגולוון Ø6 מ\"מ (7×7)"
    anchors: str = "בורג עין M12 מגולוון בעיגון כימי לקיר/לקונסטרוקציה + מותחן (טרנבקל) M12"
    cables: list[str] = Field(default_factory=lambda: ["2 סטרינגים — 4 × H1Z2Z2-K 1×6 ממ\"ר", "בצינור גמיש עמיד UV Ø32"])
    hangers: str = "חבקי נירוסטה / חבקים עמידי UV כל 0.5 מ'"
    drop_m: float = 4.0                   # vertical drop at each end to the wall entry / inverter


class RoutePlan(BaseModel):
    title: str = "תרשים תוואים ומתיחה בין מבנים"
    sheet_no: str = "E-02"
    nodes: list[RouteNode] = Field(default_factory=list)
    links: list[RouteLink] = Field(default_factory=list)
    span: Optional[Span] = None
    notes: list[str] = Field(default_factory=list)
    verify: list[str] = Field(default_factory=list)


METHOD_TXT = {"underground": "תת-קרקעי בצנרת", "overhead": "עילי — על תיל נושא", "tray": "בתעלה", "existing": "קיים"}
METHOD_LAYER = {"underground": "sld_main", "overhead": "dc_pos", "tray": "ac", "existing": "existing"}


def route_rows(p: RoutePlan) -> list[list[str]]:
    names = {n.id: n.label for n in p.nodes}
    rows = []
    for l in p.links:
        ln = "-" if l.length_m is None else f"{l.length_m:g}{'' if l.measured else '*'}"
        st = {"new": "חדש", "existing": "קיים", "option": "אופציה"}[l.status]
        rows.append([l.tag, f"{names.get(l.a, l.a)} ← {names.get(l.b, l.b)}", ln, l.cable or "-", METHOD_TXT[l.method], st])
    return rows


class RouteRenderer:
    def __init__(self, ctx: SheetContext, design: Design, p: RoutePlan):
        self.ctx, self.design, self.p = ctx, design, p
        self.warnings: list[str] = []

    def area(self) -> tuple[float, float, float, float]:
        ctx = self.ctx
        return ctx.x0 + 10.0, ctx.y0 + 112.0, ctx.x0 + 225.0, ctx.y1 - 20.0

    def pos(self, n: RouteNode) -> tuple[float, float]:
        ax0, ay0, ax1, ay1 = self.area()
        return ax0 + (ax1 - ax0) * n.x / 100.0, ay0 + (ay1 - ay0) * n.y / 100.0

    def draw(self) -> list[str]:
        ctx, p = self.ctx, self.p
        nodes = {n.id: n for n in p.nodes}
        # links first (under the boxes)
        for l in p.links:
            if l.a not in nodes or l.b not in nodes:
                self.warnings.append(f"תוואי {l.tag}: צומת לא קיים")
                continue
            (xa, ya), (xb, yb) = self.pos(nodes[l.a]), self.pos(nodes[l.b])
            attribs = {"layer": LAYERS[METHOD_LAYER[l.method]].name}
            if l.status != "new" or l.method == "existing":
                attribs["linetype"] = "DASHED"
            if l.method == "overhead":
                attribs["linetype"] = "DASHDOT"
            # orthogonal route: horizontal then vertical
            na, nb = nodes[l.a], nodes[l.b]
            sgx = 1.0 if xb > xa else -1.0
            sgy = 1.0 if yb > ya else -1.0
            if abs(ya - yb) > 0.5 and abs(xa - xb) > 0.5:          # L-route: leave a sideways, enter b vertically
                pts = [(xa + sgx * na.w / 2, ya), (xb, ya), (xb, yb - sgy * nb.h / 2)]
            elif abs(ya - yb) <= 0.5:                               # horizontal
                pts = [(xa + sgx * na.w / 2, ya), (xb - sgx * nb.w / 2, yb)]
            else:                                                   # vertical
                pts = [(xa, ya + sgy * na.h / 2), (xb, yb - sgy * nb.h / 2)]
            ctx.msp.add_lwpolyline(pts, dxfattribs={**attribs, "const_width": 0.5 if l.status == "new" else 0.25})
            mx, my = ((xa + xb) / 2, ya) if len(pts) == 3 or abs(ya - yb) < 0.5 else (xa, (ya + yb) / 2)
            vertical = len(pts) == 2 and abs(xa - xb) < 0.5
            ln = "" if l.length_m is None else f"~{l.length_m:g} מ'{'' if l.measured else '*'}"
            if vertical:
                ctx.text(f"{l.tag}  {ln}", (mx + 2.0, my + 1.2), 2.0, "panel_text", TA.BOTTOM_LEFT, bold=True)
                if l.cable:
                    ctx.text(l.cable, (mx + 2.0, my - 1.2), 1.6, "panel_text", TA.TOP_LEFT)
            else:
                ctx.text(f"{l.tag}  {ln}", (mx, my + 1.4), 2.0, "panel_text", TA.BOTTOM_CENTER, bold=True)
                if l.cable:
                    ctx.text(l.cable, (mx, my - 1.4), 1.6, "panel_text", TA.TOP_CENTER)
        for n in p.nodes:
            x, y = self.pos(n)
            layer = "sld_board" if n.kind in ("niche", "board") else "panel_encl"
            ctx.rect(x - n.w / 2, y - n.h / 2, n.w, n.h, layer)
            ctx.text(n.label, (x, y + (1.6 if n.sublabel else 0.0)), 2.2, "panel_text", TA.MIDDLE_CENTER, bold=True)
            if n.sublabel:
                ctx.text(n.sublabel, (x, y - 2.6), 1.5, "panel_text", TA.MIDDLE_CENTER)
            if n.note:
                ctx.text(n.note, (x, y - n.h / 2 - 1.2), 1.4, "notes", TA.TOP_CENTER)
        ax0, ay0, ax1, ay1 = self.area()
        ctx.text("תרשים תוואים — ללא קנה מידה", (ax1, ay1 + 6.0), 3.0, "panel_text", TA.MIDDLE_RIGHT, bold=True)
        # legend
        lx, ly = ax0, ay1 + 6.0
        for i, (m, txt) in enumerate((("underground", "תת-קרקעי בצנרת (חדש)"), ("overhead", "עילי על תיל נושא (חדש)"),
                                      ("existing", "קיים / אופציה"))):
            attribs = {"layer": LAYERS[METHOD_LAYER[m]].name, "const_width": 0.5}
            if m == "existing":
                attribs["linetype"] = "DASHED"
            if m == "overhead":
                attribs["linetype"] = "DASHDOT"
            xx = lx + i * 48.0
            ctx.msp.add_lwpolyline([(xx, ly), (xx + 10.0, ly)], dxfattribs=attribs)
            ctx.text(txt, (xx + 12.0, ly), 1.6, "panel_text", TA.MIDDLE_LEFT)
        # route table + notes in the right column
        xr = ctx.x1 - 6.0
        y = draw_table(ctx, xr, ctx.y1 - 18.0,
                       [Column("סימון", 10.0), Column("מ ← אל", 50.0, TA.MIDDLE_RIGHT), Column("אורך [מ']", 14.0),
                        Column("כבל", 30.0, TA.MIDDLE_RIGHT), Column("שיטה", 26.0, TA.MIDDLE_RIGHT), Column("סטטוס", 14.0)],
                       route_rows(p), "טבלת תוואים", h_text=1.35)
        notes = list(p.notes) + [f"לאימות: {v}" for v in p.verify]
        if notes:
            ny = y - 9.0
            ctx.text("הערות", (xr, ny), 2.4, "notes", TA.TOP_RIGHT, bold=True)
            ny -= 4.6
            for i, n in enumerate(notes, 1):
                for k, line in enumerate(_wrap(f"{i}. {n}", 92)):
                    ctx.text(line, (xr - (0 if k == 0 else 3.0), ny), 1.55, "notes", TA.TOP_RIGHT)
                    ny -= 2.6
                ny -= 0.4
            if ny < ctx.y0 + TB_H + 20.0:
                self.warnings.append("תוואים: ההערות ארוכות מדי לגיליון")
        if p.span:
            self.draw_span(ctx.x0 + 14.0, ctx.y0 + 22.0)
        return self.warnings

    def draw_span(self, x0: float, y0: float) -> None:
        """Elevation of the messenger between two walls, 1:100 horizontally and vertically."""
        ctx, sp = self.ctx, self.p.span
        names = {n.id: n.label for n in self.p.nodes}
        sc = 100.0
        s = lambda m: m * 1000.0 / sc
        wall_h = s(sp.height_m + 1.0)
        L = s(sp.span_m)
        xa, xb = x0 + 12.0, x0 + 12.0 + L
        g = y0                                   # ground line
        ctx.line((x0, g), (xb + 24.0, g), "existing")
        for xw, side in ((xa, -1), (xb, 1)):
            pts = [(xw, g), (xw, g + wall_h), (xw + side * 8.0, g + wall_h), (xw + side * 8.0, g)]
            ctx.msp.add_lwpolyline(pts, close=True, dxfattribs={"layer": LAYERS["panel_encl"].name})
            h = ctx.msp.add_hatch(color=8, dxfattribs={"layer": LAYERS["hatch"].name})
            h.set_pattern_fill("ANSI31", scale=0.6)
            h.paths.add_polyline_path(pts, is_closed=True)
        ya = g + s(sp.height_m)
        sag = s(sp.span_m * sp.sag_pct / 100.0)
        # messenger: parabola through the two anchors
        pts = []
        for i in range(21):
            t = i / 20.0
            pts.append((xa + (xb - xa) * t, ya - 4.0 * sag * t * (1 - t)))
        ctx.msp.add_lwpolyline(pts, dxfattribs={"layer": LAYERS["dc_pos"].name, "const_width": 0.35})
        for xw in (xa, xb):
            ctx.msp.add_circle((xw, ya), 0.8, dxfattribs={"layer": LAYERS["dc_pos"].name})
        # drops at both ends
        for xw, side in ((xa, -1), (xb, 1)):
            ctx.msp.add_lwpolyline([(xw + side * 0.0, ya - 1.2), (xw - side * 1.5, ya - 1.2), (xw - side * 1.5, ya - s(sp.drop_m))],
                                   dxfattribs={"layer": LAYERS["dc_neg"].name, "const_width": 0.25})
        # dims (engine dimstyle: 1 drawing mm = 100 mm)
        doc = ctx.doc
        ds_name = "BEE-1-100"
        if ds_name not in doc.dimstyles:
            ds = doc.dimstyles.new(ds_name)
            ds.dxf.dimtxt, ds.dxf.dimasz, ds.dxf.dimexe, ds.dxf.dimexo, ds.dxf.dimgap = 1.8, 1.4, 1.0, 0.8, 0.5
            ds.dxf.dimlfac, ds.dxf.dimdec, ds.dxf.dimtad = 100.0, 0, 1
            ds.dxf.dimtxsty, ds.dxf.dimblk = "BEE-LAT", "ARCHTICK"
        ctx.msp.add_linear_dim(base=(xa, g - 6.0), p1=(xa, g), p2=(xb, g), dimstyle=ds_name,
                               text=f"{sp.span_m:g} m", dxfattribs={"layer": LAYERS["dim"].name}).render()
        low = ya - sag
        ctx.msp.add_linear_dim(base=(xb + 14.0, g), p1=(xb + 8.0, g), p2=(xb + 8.0, ya), angle=90, dimstyle=ds_name,
                               text=f"{sp.height_m:g} m", dxfattribs={"layer": LAYERS["dim"].name}).render()
        mx = (xa + xb) / 2
        ctx.line((mx, g), (mx, low), "dim")
        ctx.text(f"≥{sp.clearance_min_m:g} מ' בנקודה הנמוכה", (mx + 1.5, (g + low) / 2), 1.6, "dim", TA.MIDDLE_LEFT)
        ctx.text(names.get(sp.a, sp.a), (xa - 4.0, g + wall_h + 2.0), 1.8, "panel_text", TA.BOTTOM_CENTER, bold=True)
        ctx.text(names.get(sp.b, sp.b), (xb + 4.0, g + wall_h + 2.0), 1.8, "panel_text", TA.BOTTOM_CENTER, bold=True)
        # callouts to the right of the detail
        tx = xb + 30.0
        lines = [f"תיל נושא: {sp.messenger}", f"עיגון: {sp.anchors}", *[f"כבלים: {c}" for c in sp.cables[:1]],
                 *sp.cables[1:], f"תלייה: {sp.hangers}", f"שקיעה מתוכננת ≈{sp.sag_pct:g}% מהמפתח; הארקת התיל לפה\"פ הקרוב"]
        yy = g + wall_h
        ctx.text("פרט מתיחה בין מבנים — חזית, 1:100", (tx, yy + 4.0), 2.6, "panel_text", TA.BOTTOM_LEFT, bold=True)
        for ln in lines:
            for k, part in enumerate(_wrap(ln, 70)):
                ctx.text(part, (tx + (0 if k == 0 else 3.0), yy), 1.55, "panel_text", TA.TOP_LEFT)
                yy -= 2.6


def draw_routes(ctx: SheetContext, design: Design, p: RoutePlan) -> list[str]:
    return RouteRenderer(ctx, design, p).draw()
