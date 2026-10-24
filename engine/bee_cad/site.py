"""Site infrastructure layout (פריסת תשתיות) — plan, front elevation and side section of a BESS /
equipment yard: concrete slab, cabinets on their Double-T beams, panels, cable trays, trenches, routes.

Reference: the supplier sheet "פריסת תשתיות" (Roche G009, Kal Gader 28.09.26) — plan with trays behind
the row, front elevation with the beam height, side section with the panel and the slab. Here it is
generated from the same ``DrillTemplate`` that drives the drilling sheet, so cabinet positions, the
slab and the beams can never disagree between E-02 and E-20.
"""
from __future__ import annotations

from typing import Literal, Optional

from ezdxf.enums import TextEntityAlignment as TA
from pydantic import BaseModel, Field

from .layers import LAYERS
from .model import Design
from .sheet import SheetContext, TB_H, TB_W
from .template import DrillTemplate

ItemKind = Literal["panel", "cabinet", "comm", "existing", "wall", "pipe", "other"]
RouteKind = Literal["ac", "dc", "pe", "comm", "fire"]


class SiteItem(BaseModel):
    """A box on the site: panel, comm cabinet, existing inverter stand... Plan footprint + elevation."""

    tag: str
    label: str = ""
    kind: ItemKind = "panel"
    x_mm: float                      # plan, front-left corner from the slab datum
    y_mm: float
    w_mm: float
    d_mm: float
    z_mm: float = 0                  # bottom above slab top (elevation)
    h_mm: float = 1000
    show_front: bool = True
    show_side: bool = True
    note: str = ""


class Tray(BaseModel):
    """Cable tray / ladder / trench along a polyline (plan)."""

    tag: str = "T1"
    label: str                       # "סולם כבלים 300×100"
    kind: Literal["ladder", "tray", "mesh", "trench", "conduit"] = "ladder"
    width_mm: float = 300
    height_mm: float = 100
    z_mm: float = 250                # bottom above slab top (0 = on the slab; negative = trench)
    points: list[tuple[float, float]] = Field(default_factory=list)
    side_y_mm: Optional[float] = None    # where it crosses the side section (Y); None = not shown


class Route(BaseModel):
    """A cable route drawn over the trays (listed in the table, drawn as a coloured polyline)."""

    tag: str = "R1"
    label: str                       # "2x(4x150)NA2XY"
    via: str = ""                    # "PCS01-04 → T1 → לוח BESS"
    kind: RouteKind = "ac"
    points: list[tuple[float, float]] = Field(default_factory=list)


class Clearances(BaseModel):
    """Manufacturer's recommended clearances (Rochex/Afcon 261kWh O&M manual §5.2, single-row placement)."""

    side_mm: float = 400          # cabinet side → wall / other equipment
    between_mm: float = 100       # between cabinets in a row
    rear_mm: float = 800          # behind (air outlet direction)
    front_mm: float = 2500        # in front of the cabinet (door, maintenance)
    source: str = "Rochex/Afcon 125kW-261kWh ESS O&M manual 20260410 §5.2"


class SiteLayout(BaseModel):
    title: str = "פריסת תשתיות — מבט על, חזית וחתך"
    sheet_no: str = "E-02"
    clearances: Optional[Clearances] = Field(default_factory=Clearances)
    front_is_low_y: bool = True   # the cabinets' doors face the datum edge (y = 0)
    items: list[SiteItem] = Field(default_factory=list)
    trays: list[Tray] = Field(default_factory=list)
    routes: list[Route] = Field(default_factory=list)
    cabinet_height_mm: float = 2471
    ground_below_slab_mm: float = 0       # slab top above ground (0 = flush)
    north_deg: Optional[float] = None     # plan north arrow rotation (0 = up); None = no arrow
    notes: list[str] = Field(default_factory=list)
    verify: list[str] = Field(default_factory=list)


ROUTE_LAYER = {"ac": "ac", "dc": "dc_pos", "pe": "pe", "comm": "comm", "fire": "dc_pos"}


def site_checks(t: DrillTemplate, layout: SiteLayout) -> list[str]:
    """Clearance checks against the manufacturer's recommendations: gaps between cabinets, items inside the
    rear (air-outlet) zone or the front (maintenance) zone. The slab edge is not a wall, so side/front/rear
    distances to the slab edge are reported as info only."""
    out: list[str] = []
    c = layout.clearances
    if c is None or not t.units:
        return out
    us = sorted(t.units, key=lambda u: u.x_mm)
    for a, b in zip(us, us[1:]):
        gap = b.x_mm - (a.x_mm + a.width_mm)
        if gap < c.between_mm - 1e-6:
            out.append(f"מרווח {a.tag}–{b.tag} {gap:g} מ\"מ < {c.between_mm:g} (יצרן)")
    for u in t.units:
        rear0, rear1 = u.y_mm + u.depth_mm, u.y_mm + u.depth_mm + c.rear_mm
        front0, front1 = u.y_mm - c.front_mm, u.y_mm
        for it in layout.items:
            if it.kind in ("existing",):
                continue
            ox = it.x_mm < u.x_mm + u.width_mm and u.x_mm < it.x_mm + it.w_mm
            if ox and it.y_mm < rear1 and rear0 < it.y_mm + it.d_mm and it.z_mm < 2500:
                out.append(f"{it.tag} בתוך אזור יציאת האוויר האחורי של {u.tag} (≥{c.rear_mm:g} מ\"מ, יצרן)")
            if ox and it.y_mm < front1 and front0 < it.y_mm + it.d_mm:
                out.append(f"{it.tag} בתוך אזור השירות הקדמי של {u.tag} (≥{c.front_mm:g} מ\"מ, יצרן)")
    return out
SCALES = (20.0, 25.0, 40.0, 50.0, 75.0, 100.0, 125.0, 150.0, 200.0)


def site_scale(t: DrillTemplate, layout: SiteLayout) -> float:
    """Largest standard scale with the slab length ≤ 175 mm and the elevation height ≤ 70 mm on paper."""
    hz = layout.cabinet_height_mm + t.pedestal.height_mm + t.slab.thickness_mm + 300
    for sc in SCALES:
        if t.slab.length_mm / sc <= 150.0 and hz / sc <= 80.0:
            return sc
    return SCALES[-1]


class SiteRenderer:
    def __init__(self, ctx: SheetContext, design: Design, layout: SiteLayout):
        self.ctx, self.design, self.layout = ctx, design, layout
        self.t = DrillTemplate.model_validate(design.drill_template or {})
        self.scale = site_scale(self.t, layout)
        self.warnings: list[str] = []

    def s(self, v: float) -> float:
        return v / self.scale

    # ------------------------------------------------------------------ dims (same style as the template)
    def dimstyle(self) -> str:
        doc = self.ctx.doc
        name = f"BEE-1-{int(self.scale)}"
        if name not in doc.dimstyles:
            ds = doc.dimstyles.new(name)
            ds.dxf.dimtxt, ds.dxf.dimasz, ds.dxf.dimexe, ds.dxf.dimexo, ds.dxf.dimgap = 1.8, 1.4, 1.0, 0.8, 0.5
            ds.dxf.dimlfac, ds.dxf.dimdec, ds.dxf.dimtad = self.scale, 0, 1
            ds.dxf.dimtxsty, ds.dxf.dimblk = "BEE-LAT", "ARCHTICK"
        return name

    def dim_h(self, x0: float, x1: float, y: float, off: float, text: Optional[str] = None) -> None:
        kw = {"text": text} if text else {}
        self.ctx.msp.add_linear_dim(base=(x0, y + off), p1=(x0, y), p2=(x1, y), dimstyle=self.dimstyle(),
                                    dxfattribs={"layer": LAYERS["dim"].name}, **kw).render()

    def dim_v(self, x: float, y0: float, y1: float, off: float) -> None:
        self.ctx.msp.add_linear_dim(base=(x + off, y0), p1=(x, y0), p2=(x, y1), angle=90, dimstyle=self.dimstyle(),
                                    dxfattribs={"layer": LAYERS["dim"].name}).render()

    def hatch_rect(self, x: float, y: float, w: float, h: float, pattern: str = "ANSI31", scale: float = 3.0, color: int = 9) -> None:
        hatch = self.ctx.msp.add_hatch(color=color, dxfattribs={"layer": LAYERS["hatch"].name})
        hatch.set_pattern_fill(pattern, scale=scale)
        hatch.paths.add_polyline_path([(x, y), (x + w, y), (x + w, y + h), (x, y + h)], is_closed=True)

    def i_beam(self, xc: float, y0: float, flange: float, height: float, web: float = 0.5) -> None:
        """I-section seen end-on (front elevation): two flanges + web, as one closed polyline."""
        f, h, tf = flange / 2, height, min(0.08 * height, 1.2)
        w = web / 2
        pts = [(xc - f, y0), (xc + f, y0), (xc + f, y0 + tf), (xc + w, y0 + tf), (xc + w, y0 + h - tf), (xc + f, y0 + h - tf),
               (xc + f, y0 + h), (xc - f, y0 + h), (xc - f, y0 + h - tf), (xc - w, y0 + h - tf), (xc - w, y0 + tf), (xc - f, y0 + tf)]
        self.ctx.msp.add_lwpolyline(pts, close=True, dxfattribs={"layer": LAYERS["panel_rail"].name})

    # ------------------------------------------------------------------ plan
    def draw_plan(self, ox: float, oy: float) -> tuple[float, float]:
        ctx, t, L, s = self.ctx, self.t, self.layout, self.s
        W, D = s(t.slab.length_mm), s(t.slab.width_mm)
        ctx.rect(ox, oy, W, D, "panel_encl")
        self.hatch_rect(ox, oy, W, D, scale=5.0)
        ctx.text(f"משטח בטון {t.slab.length_mm / 1000:g} × {t.slab.width_mm / 1000:g} × {t.slab.thickness_mm / 1000:g} m",
                 (ox + W - 3.0, oy + D + 1.5), 2.0, "panel_text", TA.BOTTOM_RIGHT, bold=True)
        ctx.text("חזית  FRONT", (ox + W / 2, oy - 7.5), 2.2, "panel_text", TA.TOP_CENTER, bold=True)
        # trays first (under everything)
        for tr in L.trays:
            if len(tr.points) < 2:
                continue
            pts = [(ox + s(x), oy + s(y)) for x, y in tr.points]
            layer = "existing" if tr.kind == "trench" else "panel_rail"
            half = s(tr.width_mm) / 2
            # draw as two offset polylines (simple parallel offset per segment)
            for sign in (-1, 1):
                off_pts = []
                for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
                    dx, dy = x1 - x0, y1 - y0
                    n = (dx * dx + dy * dy) ** 0.5 or 1.0
                    nx, ny = -dy / n * half * sign, dx / n * half * sign
                    off_pts += [(x0 + nx, y0 + ny), (x1 + nx, y1 + ny)]
                ctx.msp.add_lwpolyline(off_pts, dxfattribs={"layer": LAYERS[layer].name})
            mx, my = pts[0]
            ctx.text(tr.tag, (mx - half - 1.0, my), 1.6, "panel_text", TA.MIDDLE_RIGHT, bold=True)
        # cabinets from the template
        for u in t.units:
            ux, uy, uw, ud = ox + s(u.x_mm), oy + s(u.y_mm), s(u.width_mm), s(u.depth_mm)
            ctx.rect(ux, uy, uw, ud, "panel_dev")
            if self.scale <= 50:
                ctx.text(u.tag, (ux + uw / 2, uy + ud / 2 + 1.5), 2.2, "panel_text", TA.MIDDLE_CENTER, bold=True)
                ctx.text(u.model, (ux + uw / 2, uy + ud / 2 - 1.8), 1.4, "panel_text", TA.MIDDLE_CENTER)
            else:
                ctx.text(u.tag, (ux + uw / 2, uy + ud / 2), 1.8, "panel_text", TA.MIDDLE_CENTER, rotation=90.0, bold=True)
            for bx in t.beam_centres(u):   # hidden beams, dashed
                pw = s(t.pedestal.width_mm) / 2
                ctx.msp.add_lwpolyline([(ox + s(bx) - pw, uy), (ox + s(bx) + pw, uy), (ox + s(bx) + pw, uy + ud), (ox + s(bx) - pw, uy + ud)],
                                       close=True, dxfattribs={"layer": LAYERS["existing"].name})
        # items
        for it in L.items:
            ix, iy, iw, idp = ox + s(it.x_mm), oy + s(it.y_mm), s(it.w_mm), s(it.d_mm)
            layer = "existing" if it.kind == "existing" else ("comm" if it.kind == "comm" else "panel_dev")
            ctx.rect(ix, iy, iw, idp, layer)
            ctx.text(it.tag, (ix + iw / 2, iy + idp / 2), 1.6, "panel_text", TA.MIDDLE_CENTER,
                     rotation=90.0 if idp > iw * 1.4 else 0.0, bold=True)
        # routes
        for r in L.routes:
            if len(r.points) < 2:
                continue
            pts = [(ox + s(x), oy + s(y)) for x, y in r.points]
            ctx.msp.add_lwpolyline(pts, dxfattribs={"layer": LAYERS[ROUTE_LAYER[r.kind]].name})
        # dimensions: slab, cabinet chain (first, gap, pitch × n, last), front offset
        self.dim_h(ox, ox + W, oy + D, 12.0)
        self.dim_v(ox + W, oy, oy + D, 10.0)
        us = sorted(t.units, key=lambda u: u.x_mm)
        if us:
            first, last = us[0], us[-1]
            self.dim_h(ox, ox + s(first.x_mm), oy, -8.0)
            self.dim_h(ox + s(first.x_mm), ox + s(first.x_mm + first.width_mm), oy, -8.0)
            if len(us) > 1:
                self.dim_h(ox + s(first.x_mm + first.width_mm), ox + s(us[1].x_mm), oy, -8.0)
                if len(us) > 2:
                    pitch = us[1].x_mm - us[0].x_mm
                    n = len(us) - 1
                    self.dim_h(ox + s(first.x_mm), ox + s(last.x_mm), oy, -16.0, text=f"{n} × {pitch:g} = {n * pitch:g}")
            self.dim_h(ox + s(last.x_mm + last.width_mm), ox + W, oy, -8.0)
            self.dim_v(ox, oy, oy + s(first.y_mm), -8.0)
            self.dim_v(ox, oy + s(first.y_mm), oy + s(first.y_mm + first.depth_mm), -8.0)
            self.dim_v(ox, oy + s(first.y_mm + first.depth_mm), oy + D, -8.0)
        ctx.text(f"פריסת תשתיות — מבט על   1:{int(self.scale)}", (ox + W / 2, oy - 17.0), 2.6, "panel_text", TA.TOP_CENTER, bold=True)
        return W, D

    # ------------------------------------------------------------------ front elevation
    def draw_front(self, ox: float, oy: float) -> tuple[float, float]:
        """oy = slab top level on paper."""
        ctx, t, L, s = self.ctx, self.t, self.layout, self.s
        W = s(t.slab.length_mm)
        ts, hb, hc = s(t.slab.thickness_mm), s(t.pedestal.height_mm), s(L.cabinet_height_mm)
        # ground + slab
        g = oy - s(L.ground_below_slab_mm)
        ctx.line((ox - 12.0, g), (ox + W + 12.0, g), "existing")
        ctx.text("מפלס קרקע", (ox - 12.0, g + 0.6), 1.4, "dim", TA.BOTTOM_LEFT)
        ctx.rect(ox, oy - ts, W, ts, "panel_encl")
        self.hatch_rect(ox, oy - ts, W, ts, "ANSI37", 2.5)
        for u in t.units:
            ux, uw = ox + s(u.x_mm), s(u.width_mm)
            for bx in t.beam_centres(u):
                self.i_beam(ox + s(bx), oy, s(t.pedestal.width_mm), hb)
            ctx.rect(ux, oy + hb, uw, hc, "panel_dev")
            # door split + vent grille hint
            ctx.line((ux + uw / 2, oy + hb + 0.1 * hc), (ux + uw / 2, oy + hb + 0.7 * hc), "panel_rail")
            ctx.rect(ux + 0.12 * uw, oy + hb + 0.15 * hc, 0.76 * uw, 0.22 * hc, "panel_rail")
            ctx.text(u.tag, (ux + uw / 2, oy + hb + 0.82 * hc), 2.0, "panel_text", TA.MIDDLE_CENTER, bold=True,
                     rotation=90.0 if uw < 10.0 else 0.0)
        for it in L.items:
            if not it.show_front:
                continue
            ix, iw, iz, ih = ox + s(it.x_mm), s(it.w_mm), oy + s(it.z_mm), s(it.h_mm)
            layer = "existing" if it.kind == "existing" else ("comm" if it.kind == "comm" else "panel_dev")
            ctx.rect(ix, iz, iw, ih, layer)
            ctx.text(it.tag, (ix + iw / 2, iz + ih / 2), 1.6, "panel_text", TA.MIDDLE_CENTER, rotation=90.0 if iw < 10.0 else 0.0, bold=True)
        # dims: heights at the left, beam height, gaps at the bottom
        xl = ox - 6.0
        self.dim_v(xl, oy - ts, oy, -6.0)
        self.dim_v(xl, oy, oy + hb, -6.0)
        self.dim_v(xl, oy + hb, oy + hb + hc, -6.0)
        us = sorted(t.units, key=lambda u: u.x_mm)
        if len(us) > 1:
            self.dim_h(ox + s(us[0].x_mm + us[0].width_mm), ox + s(us[1].x_mm), oy + hb + hc, 6.0)
        self.dim_h(ox, ox + W, oy - ts, -8.0)
        ctx.text("הגבהה — קורות פלדה Double-T (IPE 200)", (ox + W / 2, oy - ts - 12.0), 1.6, "panel_text", TA.TOP_CENTER)
        ctx.text(f"פריסת תשתיות — מבט מלפנים   1:{int(self.scale)}", (ox + W / 2, oy - ts - 17.0), 2.6, "panel_text", TA.TOP_CENTER, bold=True)
        return W, ts + hb + hc

    # ------------------------------------------------------------------ side section
    def draw_side(self, ox: float, oy: float) -> tuple[float, float]:
        """Section looking from the right: X on paper = Y of the site (front at the left). oy = slab top."""
        ctx, t, L, s = self.ctx, self.t, self.layout, self.s
        D = s(t.slab.width_mm)
        ts, hb, hc = s(t.slab.thickness_mm), s(t.pedestal.height_mm), s(L.cabinet_height_mm)
        g = oy - s(L.ground_below_slab_mm)
        ctx.line((ox - 10.0, g), (ox + D + 10.0, g), "existing")
        ctx.rect(ox, oy - ts, D, ts, "panel_encl")
        self.hatch_rect(ox, oy - ts, D, ts, "ANSI37", 2.5)
        if t.units:
            u = t.units[0]
            uy, ud = ox + s(u.y_mm), s(u.depth_mm)
            bl = s(t.pedestal.length_mm or u.depth_mm)
            by = uy + (ud - bl) / 2
            ctx.rect(by, oy, bl, hb, "panel_rail")
            self.hatch_rect(by, oy, bl, hb, "ANSI31", 1.5, 8)
            ctx.rect(uy, oy + hb, ud, hc, "panel_dev")
            ctx.text(f"PCS {u.model}", (uy + ud / 2, oy + hb + 0.85 * hc), 2.0, "panel_text", TA.MIDDLE_CENTER, bold=True)
            # front arrow
            ctx.msp.add_solid([(uy - 2.0, oy + hb + hc * 0.5), (uy - 6.0, oy + hb + hc * 0.5 + 1.5), (uy - 6.0, oy + hb + hc * 0.5 - 1.5)],
                              dxfattribs={"layer": LAYERS["panel_text"].name})
            ctx.text("Front", (uy - 6.5, oy + hb + hc * 0.5), 2.0, "panel_text", TA.MIDDLE_RIGHT, bold=True)
            self.dim_h(ox, uy, oy - ts, -8.0)
            self.dim_h(uy, uy + ud, oy - ts, -8.0)
            self.dim_h(uy + ud, ox + D, oy - ts, -8.0)
        for tr in L.trays:
            if tr.side_y_mm is None:
                continue
            tx, tz, tw, th = ox + s(tr.side_y_mm) - s(tr.width_mm) / 2, oy + s(tr.z_mm), s(tr.width_mm), s(tr.height_mm)
            ctx.rect(tx, tz, tw, th, "panel_rail")
            if tr.z_mm > 0 and tr.kind != "trench":   # support legs
                ctx.line((tx + tw * 0.2, oy), (tx + tw * 0.2, tz), "panel_rail")
                ctx.line((tx + tw * 0.8, oy), (tx + tw * 0.8, tz), "panel_rail")
            ctx.text(tr.tag, (tx + tw / 2, tz + th + 1.0), 1.5, "panel_text", TA.BOTTOM_CENTER, bold=True)
        for it in L.items:
            if not it.show_side:
                continue
            iy, idp, iz, ih = ox + s(it.y_mm), s(it.d_mm), oy + s(it.z_mm), s(it.h_mm)
            layer = "existing" if it.kind == "existing" else ("comm" if it.kind == "comm" else "panel_dev")
            ctx.rect(iy, iz, idp, ih, layer)
            ctx.text(it.tag, (iy + idp / 2, iz + ih / 2), 1.5, "panel_text", TA.MIDDLE_CENTER, rotation=90.0 if idp < 10.0 else 0.0, bold=True)
        self.dim_h(ox, ox + D, oy - ts, -16.0)
        self.dim_v(ox + D + 6.0, oy, oy + hb, 6.0)
        self.dim_v(ox + D + 6.0, oy + hb, oy + hb + hc, 6.0)
        ctx.text(f"חתך צד   1:{int(self.scale)}", (ox + D / 2, oy - ts - 22.0), 2.6, "panel_text", TA.TOP_CENTER, bold=True)
        return D, ts + hb + hc

    # ------------------------------------------------------------------ table + notes
    def draw_table(self, x_right: float, y_top: float) -> float:
        ctx, t, L = self.ctx, self.t, self.layout
        rows: list[tuple[str, str, str]] = []
        for u in t.units:
            rows.append((u.tag, f"ארון {u.model}", f"{u.width_mm:g}×{u.depth_mm:g}×{L.cabinet_height_mm:g}"))
        for it in L.items:
            rows.append((it.tag, it.label, f"{it.w_mm:g}×{it.d_mm:g}×{it.h_mm:g} @ z={it.z_mm:g}"))
        for tr in L.trays:
            rows.append((tr.tag, tr.label, f"{tr.width_mm:g}×{tr.height_mm:g} @ z={tr.z_mm:g}"))
        for r in L.routes:
            rows.append((r.tag, r.label, r.via))
        cols = [("תג", 14.0), ("פריט", 60.0), ("מידות [mm] / תוואי", 44.0)]
        tw = sum(c[1] for c in cols)
        rh = 4.0
        rows = rows[:22]
        h = rh * (len(rows) + 1)
        ctx.text("ציוד ותשתיות", (x_right - 1.0, y_top + 1.0), 2.2, "legend", TA.BOTTOM_RIGHT, bold=True)
        ctx.rect(x_right - tw, y_top - h, tw, h, "legend")
        xx = x_right
        for name, cw in cols:
            ctx.text(name, (xx - cw / 2, y_top - rh / 2), 1.5, "legend", TA.MIDDLE_CENTER, bold=True)
            xx -= cw
            if xx > x_right - tw + 0.5:
                ctx.line((xx, y_top - h), (xx, y_top), "legend")
        for i, row in enumerate(rows):
            yy = y_top - rh * (i + 1.5)
            ctx.line((x_right - tw, yy + rh / 2), (x_right, yy + rh / 2), "legend")
            cx = x_right
            for (name, cw), v in zip(cols, row):
                ctx.text(v[:34], (cx - cw / 2, yy), 1.4, "legend", TA.MIDDLE_CENTER)
                cx -= cw
        return y_top - h

    def draw(self) -> list[str]:
        ctx, t, L = self.ctx, self.t, self.layout
        if not t.units:
            self.warnings.append("פריסת תשתיות: אין ארונות במודל (drill_template.units)")
            return self.warnings
        self.warnings += site_checks(t, L)
        s = self.s
        W, D = s(t.slab.length_mm), s(t.slab.width_mm)
        hz = s(L.cabinet_height_mm + t.pedestal.height_mm + t.slab.thickness_mm)
        # plan: top-left; side section: top-right of the plan; front: under the plan; table/notes: right column
        px, py = ctx.x0 + 24.0, ctx.y1 - 32.0 - D
        self.draw_plan(px, py)
        sx = px + W + 34.0
        self.draw_side(sx, py + s(t.slab.thickness_mm) + 10.0)
        fy = py - 42.0 - hz + s(t.slab.thickness_mm)       # slab top of the elevation
        if fy - s(t.slab.thickness_mm) - 20.0 < ctx.y0 + 6.0:
            self.warnings.append("פריסת תשתיות: החזית לא נכנסת מתחת למבט-על בקנ\"מ הזה")
        self.draw_front(px, fy)
        # right column
        xr = ctx.x1 - 4.0
        y_after = self.draw_table(xr, ctx.y1 - 14.0)
        notes = list(L.notes) + [f"לאימות: {v}" for v in L.verify]
        if L.clearances:
            c = L.clearances
            notes.insert(0, f"מרווחים מומלצים לפי יצרן הארון ({c.source}): ≥{c.side_mm:g} מהצד לקיר/ציוד, ≥{c.between_mm:g} בין ארונות, "
                            f"≥{c.rear_mm:g} מאחור (יציאת אוויר), ≥{c.front_mm:g} מלפנים (דלת ושירות); גובה יסוד מומלץ 300–450 מעל הקרקע (§5.5.3).")
        nx, ny = xr, min(y_after - 10.0, ctx.y0 + TB_H + 5.0 * 3 + 70.0)
        ctx.text("הערות", (nx, ny), 2.4, "notes", TA.TOP_RIGHT, bold=True)
        ctx.mtext([f"{i + 1}. {n}" for i, n in enumerate(notes)], (nx, ny - 4.0), 1.6, "notes", width=108.0)
        return self.warnings


def draw_site(ctx: SheetContext, design: Design, layout: SiteLayout) -> list[str]:
    return SiteRenderer(ctx, design, layout).draw()
