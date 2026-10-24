"""Drilling template (שבלונת קידוח) — anchor positions and bolt type for cabinet pedestals
(Double-T steel beams) on a concrete slab, e.g. BESS cabinets (Roche / Afcon "Normal 261").

Sheet: plan of the slab with every cabinet footprint, its pedestal beams and anchor points, dimension
chains from the slab datum corner; a 1:10 detail of one unit with the bolt pattern; a coordinate table
(X, Y of every anchor from the datum); the bolt schedule; checks (edge distance, spacing, inside slab,
no overlaps); notes. Everything is parametric — the manufacturer's base drawing replaces the defaults.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal, Optional

from ezdxf.enums import TextEntityAlignment as TA
from pydantic import BaseModel, Field

from .layers import LAYERS
from .sheet import SheetContext, TB_H, TB_W


class Slab(BaseModel):
    length_mm: float = 5200          # X (along the row of cabinets)
    width_mm: float = 2100           # Y (depth)
    thickness_mm: float = 200
    datum: str = "פינה קדמית-שמאלית של משטח הבטון (מבט על, החזית למטה)"
    edge_min_mm: float = 150         # minimum anchor edge distance (manufacturer / ETA of the anchor)
    note: str = ""


class Anchor(BaseModel):
    name: str = "עוגן כימי + מוט הברגה"       # product line — VERIFY against the cabinet manual
    bolt: str = "M16"
    hole_dia_mm: float = 18
    depth_mm: float = 125
    torque_nm: Optional[float] = None
    spacing_min_mm: float = 150
    qty_per_unit: int = 4
    note: str = ""


class Pedestal(BaseModel):
    kind: str = "Double-T"
    profile: str = "IPE 200 מגולוון (קורת פלדה Double-T)"
    height_mm: float = 200
    length_mm: Optional[float] = None    # along Y; default = cabinet depth
    width_mm: float = 100                # flange width (plan) — IPE 200: 100 mm
    count_per_unit: int = 2
    inset_mm: float = 0                  # beam centre from the cabinet side edge (Roche G009: beam centred under the edge)
    galvanised: bool = True
    cross_members: bool = True           # welded cross profiles between the beams carry the base holes that miss the flanges


class CabinetBase(BaseModel):
    """Manufacturer's base-steel fixing pattern — the holes the cabinet is bolted through onto the beams.

    Default: Rochex / Afcon 125kW-261kWh O&M manual (20260410) §5.5.5 + §5.7: base frame 1064×1405 under a
    989×1465 body, 8 slotted holes Ø18×10 ("long waist"), M12 nut + Ø12 washer; hole columns 955 c/c with the
    inner pair 220 in from the outer ones, rows 125 from the frame front and 1145 apart. Coordinates below are
    relative to the cabinet BODY's front-left corner (frame is 37.5 wider each side, 30 shorter each end)."""

    frame_w_mm: float = 1064
    frame_d_mm: float = 1405
    bolt: str = "M12"
    slot: str = "Ø18×10 (חריץ ארוך)"
    holes: list[tuple[float, float]] = Field(default_factory=lambda: [
        (19.5, 155.0), (239.5, 155.0), (749.5, 155.0), (969.5, 155.0),
        (19.5, 1300.0), (239.5, 1300.0), (749.5, 1300.0), (969.5, 1300.0)])
    source: str = "Rochex/Afcon 125kW-261kWh ESS O&M manual 20260410 §5.5.5, §5.7"


class Unit(BaseModel):
    tag: str                              # PCS01
    model: str = "Normal 261"
    width_mm: float = 989
    depth_mm: float = 1465
    x_mm: float                           # footprint front-left corner from the datum
    y_mm: float
    anchors: Optional[list[tuple[float, float]]] = None   # per unit, relative to its front-left corner; None = pattern
    anchor_inset_x_mm: float = 30         # default pattern: 2 bolts per beam end, ±inset_x from the beam web
    anchor_inset_y_mm: float = 150        # bolt row from the beam end (along Y)
    anchor_offset_y_mm: float = 0         # extra Y shift of both rows (stagger against the neighbouring cabinet's beam)
    anchor_stagger_mm: float = 100        # the second bolt of each pair sits this much further from the beam end (diagonal pair)
    weight_t: Optional[float] = None
    base: Optional[CabinetBase] = None    # manufacturer base-frame holes; None = use the template default


class DrillTemplate(BaseModel):
    title: str = "שבלונת קידוח — תושבות Double-T ועיגון ארונות"
    sheet_no: str = "E-20"
    cabinet_base: Optional[CabinetBase] = Field(default_factory=CabinetBase)   # None = no cabinet-fixing holes drawn
    slab: Slab = Field(default_factory=Slab)
    units: list[Unit] = Field(default_factory=list)
    pedestal: Pedestal = Field(default_factory=Pedestal)
    anchor: Anchor = Field(default_factory=Anchor)
    zones: list[dict] = Field(default_factory=list)    # extra rectangles: {"label", "x_mm", "y_mm", "w_mm", "d_mm"}
    notes: list[str] = Field(default_factory=list)
    verify: list[str] = Field(default_factory=list)

    def base_holes(self, u: Unit) -> list[tuple[float, float]]:
        """Absolute positions of the cabinet's base-frame fixing holes (bolted to the beam top flange)."""
        base = u.base or self.cabinet_base
        if base is None:
            return []
        return [(u.x_mm + hx, u.y_mm + hy) for hx, hy in base.holes]

    def base_holes_on_beam(self, u: Unit) -> list[bool]:
        """For each base hole: does it fall on a beam's top flange (|x - centre| ≤ flange/2)?"""
        half = self.pedestal.width_mm / 2
        return [any(abs(x - bx) <= half for bx in self.beam_centres(u)) for x, _ in self.base_holes(u)]

    def beam_centres(self, u: Unit) -> tuple[float, float]:
        """X of the two pedestal beams of a unit (absolute)."""
        return (u.x_mm + self.pedestal.inset_mm, u.x_mm + u.width_mm - self.pedestal.inset_mm)

    def anchor_points(self, u: Unit) -> list[tuple[float, float]]:
        """Absolute anchor coordinates. Default pattern: on each beam, a pair of bolts (±inset_x from the web)
        at inset_y from the front end and from the rear end — 8 per unit; numbered front row left→right,
        then rear row."""
        if u.anchors:
            return [(u.x_mm + ax, u.y_mm + ay) for ax, ay in u.anchors]
        ix, iy, dy, st = u.anchor_inset_x_mm, u.anchor_inset_y_mm, u.anchor_offset_y_mm, u.anchor_stagger_mm
        length = self.pedestal.length_mm or u.depth_mm
        y0 = u.y_mm + (u.depth_mm - length) / 2
        out: list[tuple[float, float]] = []
        for y, sign in ((y0 + iy + dy, 1.0), (y0 + length - iy + dy, -1.0)):   # front row, rear row (stagger inward)
            for bx in self.beam_centres(u):
                out += [(bx - ix, y), (bx + ix, y + sign * st)]
        return out


@dataclass
class TemplateChecks:
    problems: list[str] = field(default_factory=list)

    def run(self, t: DrillTemplate) -> "TemplateChecks":
        s = t.slab
        pts_all: list[tuple[str, float, float]] = []
        for u in t.units:
            if u.x_mm < 0 or u.y_mm < 0 or u.x_mm + u.width_mm > s.length_mm or u.y_mm + u.depth_mm > s.width_mm:
                self.problems.append(f"{u.tag}: הארון חורג ממשטח הבטון")
            for v in t.units:
                if v is u or v.tag < u.tag:
                    continue
                if u.x_mm < v.x_mm + v.width_mm and v.x_mm < u.x_mm + u.width_mm and u.y_mm < v.y_mm + v.depth_mm and v.y_mm < u.y_mm + u.depth_mm:
                    self.problems.append(f"{u.tag}/{v.tag}: חפיפה בין ארונות")
            for i, (x, y) in enumerate(t.anchor_points(u), 1):
                pts_all.append((f"{u.tag}-{i}", x, y))
                edge = min(x, y, s.length_mm - x, s.width_mm - y)
                if edge < s.edge_min_mm:
                    self.problems.append(f"{u.tag}-{i}: מרחק משפה {edge:.0f} מ\"מ < מינימום {s.edge_min_mm:.0f}")
        if not t.pedestal.cross_members:
            for u in t.units:
                off = [i + 1 for i, ok in enumerate(t.base_holes_on_beam(u)) if not ok]
                if off:
                    self.problems.append(f"{u.tag}: חורי בסיס הארון {off} אינם מעל אגף קורה — נדרש פרופיל רוחבי/פלטה מרותכת")
        for i, (ta, xa, ya) in enumerate(pts_all):
            for tb, xb, yb in pts_all[i + 1:]:
                d = ((xa - xb) ** 2 + (ya - yb) ** 2) ** 0.5
                if d < t.anchor.spacing_min_mm:
                    self.problems.append(f"{ta}/{tb}: מרווח עוגנים {d:.0f} מ\"מ < מינימום {t.anchor.spacing_min_mm:.0f}")
        return self


def plan_scale(t: DrillTemplate) -> float:
    return 25.0 if t.slab.length_mm <= 5500 else (50.0 if t.slab.length_mm <= 11000 else 100.0)


def detail_scale(t: DrillTemplate) -> float:
    """Detail scale chosen to fit under the plan on an A3 (same arithmetic as TemplateRenderer.draw)."""
    if not t.units:
        return 10.0
    avail_h = (297.0 - 32.0) - 36.0 - t.slab.width_mm / plan_scale(t) - 26.0 - 18.0
    return next((k for k in (10.0, 15.0, 20.0, 25.0) if t.units[0].depth_mm / k + 24.0 <= avail_h), 25.0)


def scale_text(t: DrillTemplate) -> str:
    return f"1:{int(plan_scale(t))} / 1:{int(detail_scale(t))}"


class TemplateRenderer:
    def __init__(self, ctx: SheetContext, t: DrillTemplate):
        self.ctx, self.t = ctx, t
        self.scale = plan_scale(t)
        self.warnings: list[str] = []

    def s(self, v: float) -> float:
        return v / self.scale

    def dimstyle(self, scale: float) -> str:
        doc = self.ctx.doc
        name = f"BEE-1-{int(scale)}"
        if name not in doc.dimstyles:
            ds = doc.dimstyles.new(name)
            ds.dxf.dimtxt, ds.dxf.dimasz, ds.dxf.dimexe, ds.dxf.dimexo, ds.dxf.dimgap = 1.8, 1.4, 1.0, 0.8, 0.5
            ds.dxf.dimlfac, ds.dxf.dimdec, ds.dxf.dimtad = scale, 0, 1
            ds.dxf.dimtxsty, ds.dxf.dimblk = "BEE-LAT", "ARCHTICK"
        return name

    def dim_h(self, x0: float, x1: float, y: float, off: float, scale: float) -> None:
        self.ctx.msp.add_linear_dim(base=(x0, y + off), p1=(x0, y), p2=(x1, y), dimstyle=self.dimstyle(scale),
                                    dxfattribs={"layer": LAYERS["dim"].name}).render()

    def dim_v(self, x: float, y0: float, y1: float, off: float, scale: float) -> None:
        self.ctx.msp.add_linear_dim(base=(x + off, y0), p1=(x, y0), p2=(x, y1), angle=90, dimstyle=self.dimstyle(scale),
                                    dxfattribs={"layer": LAYERS["dim"].name}).render()

    def anchor_mark(self, x: float, y: float, r: float = 1.6) -> None:
        ctx = self.ctx
        ctx.msp.add_circle((x, y), r, dxfattribs={"layer": LAYERS["sld_main"].name})
        ctx.msp.add_line((x - r * 1.5, y), (x + r * 1.5, y), dxfattribs={"layer": LAYERS["dim"].name})
        ctx.msp.add_line((x, y - r * 1.5), (x, y + r * 1.5), dxfattribs={"layer": LAYERS["dim"].name})

    def draw_plan(self, ox: float, oy: float) -> tuple[float, float]:
        ctx, t, s = self.ctx, self.t, self.s
        L, W = s(t.slab.length_mm), s(t.slab.width_mm)
        ctx.rect(ox, oy, L, W, "panel_encl")
        hatch = ctx.msp.add_hatch(color=9, dxfattribs={"layer": LAYERS["hatch"].name})
        hatch.set_pattern_fill("ANSI31", scale=4.0)
        hatch.paths.add_polyline_path([(ox, oy), (ox + L, oy), (ox + L, oy + W), (ox, oy + W)], is_closed=True)
        ctx.text(f"משטח בטון {t.slab.length_mm / 1000:g} × {t.slab.width_mm / 1000:g} × {t.slab.thickness_mm / 1000:g} m",
                 (ox + L - 3.0, oy + W + 1.5), 2.0, "panel_text", TA.BOTTOM_RIGHT, bold=True)
        # datum
        ctx.msp.add_circle((ox, oy), 2.2, dxfattribs={"layer": LAYERS["dim"].name})
        ctx.text("0,0", (ox - 3.0, oy - 3.0), 1.6, "dim", TA.TOP_RIGHT)
        ctx.text("חזית  FRONT", (ox + L / 2, oy - 7.0), 2.2, "panel_text", TA.TOP_CENTER, bold=True)
        for z in t.zones:
            zx, zy, zw, zd = s(z["x_mm"]), s(z["y_mm"]), s(z["w_mm"]), s(z["d_mm"])
            ctx.msp.add_lwpolyline([(ox + zx, oy + zy), (ox + zx + zw, oy + zy), (ox + zx + zw, oy + zy + zd), (ox + zx, oy + zy + zd)],
                                   close=True, dxfattribs={"layer": LAYERS["existing"].name})
            ctx.text(z.get("label", ""), (ox + zx + zw / 2, oy + zy + zd / 2), 1.6, "panel_text", TA.MIDDLE_CENTER,
                     rotation=90.0 if zd > zw * 1.5 else 0.0)
        for u in t.units:
            ux, uy, uw, ud = ox + s(u.x_mm), oy + s(u.y_mm), s(u.width_mm), s(u.depth_mm)
            ctx.rect(ux, uy, uw, ud, "panel_dev")
            if self.scale <= 25:
                ctx.text(u.tag, (ux + uw / 2, uy + ud / 2 + 2.0), 2.4, "panel_text", TA.MIDDLE_CENTER, bold=True)
                ctx.text(u.model, (ux + uw / 2, uy + ud / 2 - 1.5), 1.4, "panel_text", TA.MIDDLE_CENTER)
            else:   # narrow footprint on paper: rotated tag only
                ctx.text(u.tag, (ux + uw / 2, uy + ud / 2), 2.0, "panel_text", TA.MIDDLE_CENTER, rotation=90.0, bold=True)
            # pedestal beams (plan): along Y at inset from each side
            pl = s(t.pedestal.length_mm or u.depth_mm)
            pw = s(t.pedestal.width_mm)
            y0b = uy + (ud - pl) / 2
            for bx in (ux + s(t.pedestal.inset_mm), ux + uw - s(t.pedestal.inset_mm)):
                ctx.msp.add_lwpolyline([(bx - pw / 2, y0b), (bx + pw / 2, y0b), (bx + pw / 2, y0b + pl), (bx - pw / 2, y0b + pl)],
                                       close=True, dxfattribs={"layer": LAYERS["panel_rail"].name})
            if self.scale <= 25:
                for hx, hy in t.base_holes(u):
                    ctx.msp.add_circle((ox + s(hx), oy + s(hy)), 0.7, dxfattribs={"layer": LAYERS["panel_rail"].name})
            for i, (x, y) in enumerate(t.anchor_points(u), 1):
                if self.scale <= 25:
                    self.anchor_mark(ox + s(x), oy + s(y))
                    ctx.text(str(i), (ox + s(x), oy + s(y) + 1.9), 1.4, "dim", TA.BOTTOM_CENTER)
                else:                      # small scale: a dot per anchor, numbers only on the detail
                    ctx.msp.add_circle((ox + s(x), oy + s(y)), 0.5, dxfattribs={"layer": LAYERS["sld_main"].name})
        # dimension chains: beam centrelines (1:25) or cabinet pitch (smaller scales); Y of anchor rows of unit 1
        self.dim_h(ox, ox + L, oy + W, 10.0, self.scale)
        self.dim_v(ox + L, oy, oy + W, 18.0, self.scale)
        if self.scale <= 25 or len(t.units) < 3:
            xs = sorted({ox} | {ox + s(bx) for u in t.units for bx in t.beam_centres(u)} | {ox + L})
            for a, b in zip(xs, xs[1:]):
                if b - a > 0.5:
                    self.dim_h(a, b, oy, -8.0, self.scale)
        else:
            us = sorted(t.units, key=lambda u: u.x_mm)
            first, last = us[0], us[-1]
            pitch = us[1].x_mm - us[0].x_mm
            self.dim_h(ox, ox + s(first.x_mm), oy, -8.0, self.scale)
            self.dim_h(ox + s(first.x_mm), ox + s(first.x_mm + first.width_mm), oy, -8.0, self.scale)
            self.dim_h(ox + s(first.x_mm + first.width_mm), ox + s(us[1].x_mm), oy, -8.0, self.scale)
            n = len(us) - 1
            text = f"{n} × {pitch:g} = {n * pitch:g}"
            ctx.msp.add_linear_dim(base=(ox + s(first.x_mm), oy - 16.0), p1=(ox + s(first.x_mm), oy), p2=(ox + s(last.x_mm), oy),
                                   text=text, dimstyle=self.dimstyle(self.scale), dxfattribs={"layer": LAYERS["dim"].name}).render()
            self.dim_h(ox + s(last.x_mm + last.width_mm), ox + L, oy, -8.0, self.scale)
        # Y chains: bolt rows of the first unit on the left, of the second unit (staggered) on the right (1:25 only)
        for u, x, off in ((t.units[0:1], ox, -8.0), (t.units[1:2], ox + L, 8.0)):
            if not u or self.scale > 25:
                continue
            ys = sorted({oy} | {oy + s(p[1]) for p in t.anchor_points(u[0])} | {oy + W})
            for a, b in zip(ys, ys[1:]):
                if b - a > 0.5:
                    self.dim_v(x, a, b, off, self.scale)
        ctx.text(f"מבט על — שבלונת קידוח   1:{int(self.scale)}", (ox + L / 2, oy - 16.0), 2.6, "panel_text", TA.TOP_CENTER, bold=True)
        return L, W

    def draw_detail(self, ox: float, oy: float, avail_h: float) -> None:
        """Detail of the first unit (1:10 / 1:15 / 1:20 to fit): footprint, beams, bolts with the pattern dimensions."""
        ctx, t = self.ctx, self.t
        if not t.units:
            return
        u = t.units[0]
        sc = next((k for k in (10.0, 15.0, 20.0, 25.0) if u.depth_mm / k + 24.0 <= avail_h), 25.0)
        assert sc == detail_scale(t), (sc, detail_scale(t))
        uw, ud = u.width_mm / sc, u.depth_mm / sc
        ctx.rect(ox, oy, uw, ud, "panel_dev")
        pl = (t.pedestal.length_mm or u.depth_mm) / sc
        pw = t.pedestal.width_mm / sc
        y0b = oy + (ud - pl) / 2
        for bx in (ox + t.pedestal.inset_mm / sc, ox + uw - t.pedestal.inset_mm / sc):
            ctx.msp.add_lwpolyline([(bx - pw / 2, y0b), (bx + pw / 2, y0b), (bx + pw / 2, y0b + pl), (bx - pw / 2, y0b + pl)],
                                   close=True, dxfattribs={"layer": LAYERS["panel_rail"].name})
            ctx.msp.add_line((bx, y0b), (bx, y0b + pl), dxfattribs={"layer": LAYERS["existing"].name})
        pts = [((x - u.x_mm) / sc, (y - u.y_mm) / sc) for x, y in t.anchor_points(u)]
        beams = [(bx - u.x_mm) / sc for bx in t.beam_centres(u)]
        for i, (px, py) in enumerate(pts, 1):
            self.anchor_mark(ox + px, oy + py, 2.0)
            bx = min(beams, key=lambda b: abs(b - px))
            if px < bx:       # bolt left of its beam web: label outward to the left, clear of the flange
                ctx.text(f"Ø{t.anchor.hole_dia_mm:g}  {i}", (ox + bx - pw / 2 - 1.5, oy + py + 2.0), 1.5, "dim", TA.BOTTOM_RIGHT)
            else:
                ctx.text(f"{i}  Ø{t.anchor.hole_dia_mm:g}", (ox + bx + pw / 2 + 1.5, oy + py + 2.0), 1.5, "dim", TA.BOTTOM_LEFT)
        base = u.base or t.cabinet_base
        if base:
            fw, fd = base.frame_w_mm / sc, base.frame_d_mm / sc
            fx, fy = ox + (uw - fw) / 2, oy + (ud - fd) / 2
            ctx.msp.add_lwpolyline([(fx, fy), (fx + fw, fy), (fx + fw, fy + fd), (fx, fy + fd)], close=True,
                                   dxfattribs={"layer": LAYERS["existing"].name})
            for j, (hx, hy) in enumerate(base.holes, 1):
                cx, cy = ox + hx / sc, oy + hy / sc
                r = 9.0 / sc
                ctx.msp.add_lwpolyline([(cx - r, cy - r * 1.5), (cx + r, cy - r * 1.5), (cx + r, cy + r * 1.5), (cx - r, cy + r * 1.5)],
                                       close=True, dxfattribs={"layer": LAYERS["panel_rail"].name})
                ctx.text(f"B{j}", (cx, cy + r * 1.5 + 0.6), 1.3, "panel_text", TA.BOTTOM_CENTER)
            bxs = sorted({hx for hx, _ in base.holes}) 
            bys = sorted({hy for _, hy in base.holes})
            for a_, b_ in zip(bxs, bxs[1:]):
                self.dim_h(ox + a_ / sc, ox + b_ / sc, oy + ud, 14.0, sc)
            for a_, b_ in zip([0.0] + bys + [u.depth_mm], ([0.0] + bys + [u.depth_mm])[1:]):
                if b_ - a_ > 20:
                    self.dim_v(ox + uw, oy + a_ / sc, oy + b_ / sc, 14.0, sc)
        xs = sorted({p[0] for p in pts})
        ys = sorted({p[1] for p in pts})
        for a, b in zip(xs, xs[1:]):
            if b - a > 0.3:
                self.dim_h(ox + a, ox + b, oy, -7.0, sc)
        chain_y = sorted({0.0, ud} | set(ys))
        for a, b in zip(chain_y, chain_y[1:]):
            if b - a > 0.3:
                self.dim_v(ox, oy + a, oy + b, -16.0, sc)
        self.dim_h(ox, ox + uw, oy + ud, 7.0, sc)
        self.dim_v(ox + uw, oy, oy + ud, 7.0, sc)
        ctx.text(f"פרט ארון {u.model} — תבנית קידוח   1:{int(sc)}", (ox + uw / 2, oy + ud + 15.0), 2.4, "panel_text", TA.BOTTOM_CENTER, bold=True)
        ctx.text(f"קורות {t.pedestal.kind} — {t.pedestal.profile}, גובה {t.pedestal.height_mm:g} מ\"מ", (ox + uw / 2, oy + ud + 23.0), 1.5, "panel_text", TA.BOTTOM_CENTER)
        if base:
            off = [f"B{i + 1}" for i, ok in enumerate(t.base_holes_on_beam(u)) if not ok]
            lines = [f"B1–B{len(base.holes)}: חורי בסיס הארון {base.slot}, ברגי {base.bolt} לאגף הקורה"]
            if off:
                lines.append(f"{', '.join(off)} — על פרופיל רוחבי מרותך בין הקורות")
            lines.append(f"מקור: {base.source}")
            for k, line in enumerate(lines):
                ctx.text(line, (ox, oy + ud + 26.0 + 2.6 * (len(lines) - 1 - k)), 1.3, "panel_text", TA.BOTTOM_LEFT)

    def draw_tables(self, x_right: float, y_top: float) -> None:
        ctx, t = self.ctx, self.t
        # coordinates
        rh = 4.0
        max_rows = 22
        all_pts = [(f"{u.tag}-{i}", x, y) for u in t.units for i, (x, y) in enumerate(t.anchor_points(u), 1)]
        if len(all_pts) <= 2 * max_rows:
            # full list: every anchor from the datum
            cols = [("עוגן", 16.0), ("X [mm]", 18.0), ("Y [mm]", 18.0)]
            rows = [(tag, f"{x:.0f}", f"{y:.0f}") for tag, x, y in all_pts]
            title = "קואורדינטות עוגנים מנקודת האפס"
        else:
            # per-unit table: beam centrelines + bolt rows (the pattern is on the detail)
            cols = [("ארון", 16.0), ("X קורה שמ'", 20.0), ("X קורה ימ'", 20.0), ("Y שורה קד'", 20.0), ("Y שורה אח'", 20.0)]
            rows = []
            for u in t.units:
                bl, br = t.beam_centres(u)
                ys = sorted({y for _, y in t.anchor_points(u)})
                rows.append((u.tag, f"{bl:.0f}", f"{br:.0f}", f"{ys[0]:.0f}/{ys[1]:.0f}" if len(ys) > 1 else f"{ys[0]:.0f}",
                             f"{ys[-2]:.0f}/{ys[-1]:.0f}" if len(ys) > 3 else f"{ys[-1]:.0f}"))
            title = "קורות ושורות ברגים לכל ארון (X,Y מנקודת האפס; ±30 מציר הקורה)"
        tw = sum(c[1] for c in cols)
        chunks = [rows[i:i + max_rows] for i in range(0, len(rows), max_rows)]
        ctx.text(title, (x_right - 1.0, y_top + 1.0), 2.2, "legend", TA.BOTTOM_RIGHT, bold=True)
        xr = x_right
        for chunk in chunks:
            h = rh * (len(chunk) + 1)
            ctx.rect(xr - tw, y_top - h, tw, h, "legend")
            xx = xr
            for name, cw in cols:
                ctx.text(name, (xx - cw / 2, y_top - rh / 2), 1.5, "legend", TA.MIDDLE_CENTER, bold=True)
                xx -= cw
                if xx > xr - tw + 0.5:
                    ctx.line((xx, y_top - h), (xx, y_top), "legend")
            for i, row in enumerate(chunk):
                yy = y_top - rh * (i + 1.5)
                ctx.line((xr - tw, yy + rh / 2), (xr, yy + rh / 2), "legend")
                cx = xr
                for (name, cw), v in zip(cols, row):
                    ctx.text(v, (cx - cw / 2, yy), 1.4, "legend", TA.MIDDLE_CENTER)
                    cx -= cw
            xr -= tw + 4.0
        # bolt schedule
        y = y_top - rh * (min(len(rows), max_rows) + 1) - 8.0
        a = t.anchor
        sched = [("סוג עוגן", a.name), ("בורג", a.bolt), ("קוטר קידוח", f"Ø{a.hole_dia_mm:g} מ\"מ"), ("עומק קידוח", f"{a.depth_mm:g} מ\"מ"),
                 ("מומנט הידוק", f"{a.torque_nm:g} Nm" if a.torque_nm else "לפי יצרן"),
                 ("כמות", f"{sum(len(t.anchor_points(u)) for u in t.units)} עוגנים ({a.qty_per_unit} לארון × {len(t.units)})"),
                 ("מרחק שפה מינ'", f"{t.slab.edge_min_mm:g} מ\"מ"), ("מרווח מינ'", f"{a.spacing_min_mm:g} מ\"מ")]
        if t.cabinet_base:
            cb = t.cabinet_base
            sched += [("חיבור ארון→קורה", f"{len(cb.holes)} × {cb.bolt} דרך חריצי {cb.slot}"),
                      ("מסגרת בסיס", f"{cb.frame_w_mm:g}×{cb.frame_d_mm:g} מ\"מ (יצרן)")]
        w = 80.0
        h = rh * (len(sched) + 1)
        ctx.rect(x_right - w, y - h, w, h, "legend")
        ctx.text("מפרט עיגון", (x_right - 1.0, y + 1.0), 2.2, "legend", TA.BOTTOM_RIGHT, bold=True)
        ctx.line((x_right - 32.0, y - h), (x_right - 32.0, y), "legend")
        for i, (k, v) in enumerate(sched):
            yy = y - rh * (i + 0.5)
            ctx.line((x_right - w, yy - rh / 2), (x_right, yy - rh / 2), "legend")
            ctx.text(k, (x_right - 1.0, yy), 1.4, "legend", TA.MIDDLE_RIGHT)
            ctx.text(v, (x_right - 33.0, yy), 1.4, "legend", TA.MIDDLE_RIGHT)

    def draw(self) -> list[str]:
        ctx, t = self.ctx, self.t
        checks = TemplateChecks().run(t)
        self.warnings += checks.problems
        ox, oy = ctx.x0 + 22.0, ctx.y1 - 36.0 - self.s(t.slab.width_mm)
        L, W = self.draw_plan(ox, oy)
        # detail at bottom-left, scaled to the room under the plan
        self.draw_detail(ctx.x0 + 22.0, ctx.y0 + 18.0, (oy - 26.0) - (ctx.y0 + 18.0))
        # tables at the right
        self.draw_tables(ctx.x1 - 4.0, ctx.y1 - 16.0)
        # notes + verify + checks
        notes = list(t.notes)
        notes += [f"לאימות: {v}" for v in t.verify]
        notes += [f"בדיקה: {p}" for p in checks.problems]
        nx = ctx.x1 - TB_W - 8.0
        ny = ctx.y0 + TB_H + 5.0 * 3 + 58.0
        ctx.text("הערות", (nx, ny), 2.4, "notes", TA.TOP_RIGHT, bold=True)
        ctx.mtext([f"{i + 1}. {n}" for i, n in enumerate(notes)], (nx, ny - 4.0), 1.6, "notes", width=nx - (ctx.x0 + 112.0))
        return self.warnings


def draw_template(ctx: SheetContext, t: DrillTemplate) -> list[str]:
    return TemplateRenderer(ctx, t).draw()
