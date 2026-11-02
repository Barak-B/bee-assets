"""Civil sheets for an equipment pad (משטח בטון ויסודות), following the office LEVI-BESS set (C-01..C-03):

* **C-01 pad plan** — slab outline, cabinets as dashed footprints, sleeves (שרוולים) and conduits, the
  foundation earth ring and corner spikes, section mark A–A, dimensions; the "pad data — for the structural
  engineer" table (every value with its source / rule), the loads table (cabinet weight, contact pressure,
  slab self weight, bearing pressure) and the structural designer's signature box.
* **C-02 sections** — section A–A through the pad (concrete, separation membrane, lean concrete, compacted
  subbase, prepared subgrade) with leaders, the slab edge detail and the corner earthing spike detail.
* **C-03 trench and supports** — the LV trench section (sand bedding, warning tapes, cables / conduits with
  their depths) when the design has one, and the cable-tray support detail.

Values not given by the project are defaults marked ``*`` (rule) or ``**`` (structural engineer to decide),
exactly as the office marks them; nothing here replaces the structural engineer's design.
"""
from __future__ import annotations

import math
from typing import Optional

from ezdxf.enums import TextEntityAlignment as TA
from pydantic import BaseModel, Field

from .layers import LAYERS
from .model import Design
from .schedules import Column, draw_table
from .sheet import SheetContext, TB_H, TB_W, draw_scale_bar
from .template import DrillTemplate


class PadParam(BaseModel):
    name: str
    value: str
    source: str = "ברירת מחדל**"


class Sleeve(BaseModel):
    tag: str                          # "S1"
    x_mm: float
    y_mm: float
    dia_mm: float = 110
    qty: int = 2
    label: str = ""                   # "C-PCS1, D2"


class TrenchCable(BaseModel):
    label: str                        # "1x(4x70)N2XY — כבל ראשי"
    dia_mm: float = 40
    kind: str = "cable"               # cable | conduit | earth | comm
    depth_mm: float = 860             # to the top of the cable/conduit from ground level


class Trench(BaseModel):
    tag: str = "U-001"
    title: str = "LV AC TRENCH"
    width_mm: float = 500
    depth_mm: float = 1000
    sand_bed_mm: float = 100
    sand_cover_mm: float = 100
    tape_depth_mm: float = 400
    tapes: int = 2
    backfill_compaction_pct: float = 98
    cables: list[TrenchCable] = Field(default_factory=list)


class Civil(BaseModel):
    sheet_prefix: str = "C"
    slab_layers: list[tuple[str, float, str]] = Field(default_factory=lambda: [
        ("משטח בטון מזוין ב-30**, רשת Ø10@200 עליונה ותחתונה**, כיסוי 50 מ\"מ**", 200.0, "concrete"),
        ("יריעות פוליאתילן 2×0.4 מ\"מ*", 0.0, "membrane"),
        ("בטון רזה ב-15*", 50.0, "lean"),
        ("מצע סוג א' בשכבות מהודקות ≤200 מ\"מ, הידוק 100%*", 200.0, "subbase"),
        ("שתית מהודקת (הידוק ≥98% — מדריך יצרן §5.5.2)", 200.0, "subgrade"),
    ])
    params: list[PadParam] = Field(default_factory=list)
    sleeves: list[Sleeve] = Field(default_factory=list)
    trench: Optional[Trench] = None
    concrete_density_kn_m3: float = 25.0
    unit_weight_kg: Optional[float] = None    # default: drill_template unit weight_t × 1000
    notes: list[str] = Field(default_factory=list)


LAYER_HATCH = {"concrete": ("ANSI31", 2.5), "lean": ("AR-CONC", 0.05), "subbase": ("GRAVEL", 0.4),
               "subgrade": ("EARTH", 0.4), "membrane": (None, 0)}


def default_params(t: DrillTemplate) -> list[PadParam]:
    s = t.slab
    return [
        PadParam(name="עובי משטח", value=f"{s.thickness_mm:g} מ\"מ", source="פריסת תשתיות / Roche G009"),
        PadParam(name="סוג בטון", value="ב-30**", source="כלל civil_pad_concrete_grade_min"),
        PadParam(name="דרגת חשיפה", value="3**", source="כלל struct_exposure_class_pad"),
        PadParam(name="רשת זיון", value="Ø10@200 עליונה ותחתונה**", source="ברירת מחדל**"),
        PadParam(name="כיסוי בטון — על בטון רזה ויריעות", value="50 מ\"מ**", source="כלל struct_pad_cover_min_mm"),
        PadParam(name="מרחק שפת משטח מהציוד", value=f"{s.edge_min_mm:g} מ\"מ", source="שבלונת קידוח E-20"),
        PadParam(name="יריעות הפרדה", value="2×0.4 מ\"מ*", source="כלל civil_pad_separation_membrane"),
        PadParam(name="בטון רזה — עובי / סוג", value="50 מ\"מ / ב-15*", source="כלל civil_pad_lean_concrete"),
        PadParam(name="מצע — סוג / עובי כולל", value="סוג א' / 200 מ\"מ*", source="כלל civil_subbase_layer_thickness_mm"),
        PadParam(name="הידוק מצע / שתית", value="100% / ≥98%", source="מדריך יצרן §5.5.2 (≥98%)"),
        PadParam(name="גובה יסוד מעל הקרקע", value=f"{s.thickness_mm + t.pedestal.height_mm:g} מ\"מ (משטח + קורה)",
                 source="מדריך יצרן §5.5.3: 300–450"),
    ]


def loads(design: Design, t: DrillTemplate, civ: Civil) -> list[list[str]]:
    rows: list[list[str]] = []
    total_kg = 0.0
    for model in sorted({u.model for u in t.units}):
        us = [u for u in t.units if u.model == model]
        u = us[0]
        kg = civ.unit_weight_kg or (u.weight_t or 2.8) * 1000.0
        p = kg * 9.81 / (u.width_mm * u.depth_mm / 1e6) / 1000.0
        rows.append([model, str(len(us)), f"{kg:,.0f}", f"{u.width_mm:g}×{u.depth_mm:g}", f"{p:.1f}*", f"{kg * len(us):,.0f}*"])
        total_kg += kg * len(us)
    area = t.slab.length_mm * t.slab.width_mm / 1e6
    q_equip = total_kg * 9.81 / area / 1000.0
    q_self = civ.concrete_density_kn_m3 * t.slab.thickness_mm / 1000.0
    rows.append(["סה\"כ ציוד על המשטח", "", "", "", f"{q_equip:.1f}*", f"{total_kg:,.0f}*"])
    rows.append([f"משקל עצמי משטח {civ.concrete_density_kn_m3:g} kN/m³", "", "", "", f"{q_self:.1f}**", ""])
    rows.append(["לחץ ממוצע על הקרקע", "", "", "", f"{q_equip + q_self:.1f}**", ""])
    return rows


def signature_box(ctx: SheetContext, title: str = "מתכנן שלד (מהנדס קונסטרוקציה)") -> None:
    """Structural designer box above the revisions table: name / licence / signature (as in the office set)."""
    x0 = ctx.x1 - TB_W
    revs_h = 5.0 * 3
    y0 = ctx.y0 + TB_H + revs_h + 3.0
    h = 14.0
    ctx.rect(x0, y0, TB_W, h, "frame")
    ctx.text(title, (x0 + TB_W - 1.5, y0 + h / 2), 2.0, "frame_text", TA.MIDDLE_RIGHT, bold=True)
    for i, lab in enumerate(("שם", "מס' רישיון", "חתימה")):
        xx = x0 + 3.0 + i * 30.0
        ctx.line((xx + 28.0, y0), (xx + 28.0, y0 + h), "frame")
        ctx.text(lab, (xx + 27.0, y0 + h - 1.2), 1.4, "frame_text", TA.TOP_RIGHT)


class CivilRenderer:
    def __init__(self, ctx: SheetContext, design: Design, civ: Civil):
        self.ctx, self.design, self.civ = ctx, design, civ
        self.t = DrillTemplate.model_validate(design.drill_template or {})
        self.warnings: list[str] = []

    # ---- helpers
    def dimstyle(self, scale: float) -> str:
        doc = self.ctx.doc
        name = f"BEE-1-{int(scale)}"
        if name not in doc.dimstyles:
            ds = doc.dimstyles.new(name)
            ds.dxf.dimtxt, ds.dxf.dimasz, ds.dxf.dimexe, ds.dxf.dimexo, ds.dxf.dimgap = 1.8, 1.4, 1.0, 0.8, 0.5
            ds.dxf.dimlfac, ds.dxf.dimdec, ds.dxf.dimtad = scale, 0, 1
            ds.dxf.dimtxsty, ds.dxf.dimblk = "BEE-LAT", "ARCHTICK"
        return name

    def dim_h(self, x0, x1, y, off, sc, text=None):
        kw = {"text": text} if text else {}
        self.ctx.msp.add_linear_dim(base=(x0, y + off), p1=(x0, y), p2=(x1, y), dimstyle=self.dimstyle(sc),
                                    dxfattribs={"layer": LAYERS["dim"].name}, **kw).render()

    def dim_v(self, x, y0, y1, off, sc, text=None):
        kw = {"text": text} if text else {}
        self.ctx.msp.add_linear_dim(base=(x + off, y0), p1=(x, y0), p2=(x, y1), angle=90, dimstyle=self.dimstyle(sc),
                                    dxfattribs={"layer": LAYERS["dim"].name}, **kw).render()

    def hatch(self, pts, pattern, scale, color=8):
        if not pattern:
            return
        h = self.ctx.msp.add_hatch(color=color, dxfattribs={"layer": LAYERS["hatch"].name})
        try:
            h.set_pattern_fill(pattern, scale=scale)
        except Exception:
            h.set_pattern_fill("ANSI37", scale=2.0)
        h.paths.add_polyline_path(pts, is_closed=True)

    def leader(self, tip, text_pos, lines, align=TA.BOTTOM_RIGHT, h=1.6):
        ctx = self.ctx
        ctx.msp.add_lwpolyline([tip, text_pos, (text_pos[0] + (-38.0 if align in (TA.BOTTOM_RIGHT, TA.TOP_RIGHT) else 38.0), text_pos[1])],
                               dxfattribs={"layer": LAYERS["dim"].name})
        ctx.msp.add_circle(tip, 0.4, dxfattribs={"layer": LAYERS["dim"].name})
        for i, line in enumerate(lines):
            ctx.text(line, (text_pos[0], text_pos[1] + 0.8 + (len(lines) - 1 - i) * (h + 0.8)), h, "panel_text", align)

    def section_mark(self, x, y, label="A", sheet="C-02", r=4.0):
        ctx = self.ctx
        ctx.msp.add_circle((x, y), r, dxfattribs={"layer": LAYERS["dim"].name})
        ctx.line((x - r, y), (x + r, y), "dim")
        ctx.text(label, (x, y + r / 2), 2.2, "dim", TA.MIDDLE_CENTER, bold=True)
        ctx.text(sheet, (x, y - r / 2), 1.4, "dim", TA.MIDDLE_CENTER)

    # ---- C-01
    def draw_plan_sheet(self) -> list[str]:
        ctx, t, civ = self.ctx, self.t, self.civ
        sc = 50.0
        s = lambda v: v / sc
        L, W = s(t.slab.length_mm), s(t.slab.width_mm)
        ox, oy = ctx.x0 + 30.0, ctx.y1 - 40.0 - W
        ctx.rect(ox, oy, L, W, "panel_encl")
        self.hatch([(ox, oy), (ox + L, oy), (ox + L, oy + W), (ox, oy + W)], "ANSI31", 5.0, 9)
        for u in t.units:
            ux, uy = ox + s(u.x_mm), oy + s(u.y_mm)
            ctx.msp.add_lwpolyline([(ux, uy), (ux + s(u.width_mm), uy), (ux + s(u.width_mm), uy + s(u.depth_mm)), (ux, uy + s(u.depth_mm))],
                                   close=True, dxfattribs={"layer": LAYERS["existing"].name})
            ctx.text(u.tag, (ux + s(u.width_mm) / 2, uy + s(u.depth_mm) / 2 + 1.5), 2.0, "panel_text", TA.MIDDLE_CENTER, bold=True)
            ctx.text("עיגון לפי E-20", (ux + s(u.width_mm) / 2, uy + s(u.depth_mm) / 2 - 2.0), 1.4, "panel_text", TA.MIDDLE_CENTER)
        # earthing ring (from the earthing model when present)
        off = 150.0
        if self.design.earthing:
            off = float(self.design.earthing.get("ring", {}).get("offset_mm", 150))
        ring = [(ox + s(off), oy + s(off)), (ox + L - s(off), oy + s(off)), (ox + L - s(off), oy + W - s(off)), (ox + s(off), oy + W - s(off))]
        ctx.msp.add_lwpolyline(ring, close=True, dxfattribs={"layer": LAYERS["pe"].name, "const_width": 0.35})
        for cx, cy in (ring[0], ring[2]):
            ctx.msp.add_circle((cx, cy), 0.9, dxfattribs={"layer": LAYERS["pe"].name})
        # sleeves
        for sl in civ.sleeves:
            for k in range(sl.qty):
                cx = ox + s(sl.x_mm) + k * max(2.4, s(sl.dia_mm) * 1.6)
                ctx.msp.add_circle((cx, oy + s(sl.y_mm)), max(0.9, s(sl.dia_mm) / 2), dxfattribs={"layer": LAYERS["sld_main"].name})
        # section A–A across the slab at its centre (x through the second unit if any)
        xs = ox + (s(t.units[1].x_mm + t.units[1].width_mm / 2) if len(t.units) > 1 else L / 2)
        ctx.msp.add_line((xs, oy - 9.0), (xs, oy + W + 9.0), dxfattribs={"layer": LAYERS["dim"].name, "linetype": "DASHDOT"})
        self.section_mark(xs, oy + W + 13.0)
        self.section_mark(xs, oy - 13.0)
        # dimensions
        self.dim_h(ox, ox + L, oy, -22.0, sc)
        us = sorted(t.units, key=lambda u: u.x_mm)
        chain = sorted({0.0, t.slab.length_mm} | {u.x_mm for u in us} | {u.x_mm + u.width_mm for u in us})
        for a, b in zip(chain, chain[1:]):
            if b - a > 40:
                self.dim_h(ox + s(a), ox + s(b), oy, -6.0, sc)
        self.dim_v(ox, oy, oy + W, -8.0, sc)
        if us:
            u0 = us[0]
            for a, b in ((0.0, u0.y_mm), (u0.y_mm, u0.y_mm + u0.depth_mm), (u0.y_mm + u0.depth_mm, t.slab.width_mm)):
                if b - a > 40:
                    self.dim_v(ox + L, oy + s(a), oy + s(b), 8.0, sc)
        ctx.text("תוכנית משטח בטון   1:50", (ox, oy - 34.0), 2.8, "panel_text", TA.TOP_LEFT, bold=True)
        ctx.text("מידות במ\"מ · ±0.00 = פני קרקע", (ox + L, oy - 34.0), 1.6, "panel_text", TA.TOP_RIGHT)
        draw_scale_bar(ctx, ox, oy - 46.0, sc)
        # sleeve labels in a small list under the plan (no leaders across the hatch)
        if civ.sleeves:
            sy = oy - 54.0
            ctx.text("שרוולים / צנרת במשטח", (ox + L, sy), 2.0, "panel_text", TA.TOP_RIGHT, bold=True)
            for i, sl in enumerate(civ.sleeves):
                ctx.text(f"{sl.tag}: Ø{sl.dia_mm:g} ×{sl.qty} — {sl.label}", (ox + L, sy - 3.5 - 2.6 * i), 1.6, "panel_text", TA.TOP_RIGHT)
        # right column: params table + loads + notes
        xr = ctx.x1 - 6.0
        params = civ.params or default_params(t)
        y_after = draw_table(ctx, xr, ctx.y1 - 16.0, [Column("פרמטר", 52.0, TA.MIDDLE_RIGHT), Column("ערך", 46.0), Column("מקור", 56.0, TA.MIDDLE_RIGHT)],
                             [[p.name, p.value, p.source] for p in params], "נתוני משטח — לאימות מהנדס קונסטרוקציה", h_text=1.4)
        lrows = loads(self.design, t, civ)
        y_after = draw_table(ctx, xr, y_after - 10.0,
                             [Column("פריט", 40.0, TA.MIDDLE_RIGHT), Column("כמות", 12.0), Column("משקל ליחידה [kg]", 24.0),
                              Column("מידות [mm]", 24.0), Column("לחץ [kPa]", 18.0), Column("סה\"כ [kg]", 18.0)],
                             lrows, "עומסים לבדיקת מהנדס קונסטרוקציה", h_text=1.4)
        signature_box(ctx)
        notes = list(civ.notes) or [
            "פרטי בטון, פלדה ומצעים — טיוטה לבדיקת מהנדס קונסטרוקציה; תכנון השלד ואישורו באחריותו.",
            "עיגון הארונות למשטח לפי שבלונת הקידוח E-20 ומדריך היצרן; טבעת הארקת היסוד לפי E-06.",
            "* = ערך משוער או לפי כלל שטרם אושר — לאימות; ** = לבדיקת מהנדס קונסטרוקציה ולאישורו.",
        ]
        nx, ny = xr, y_after - 8.0
        ctx.text("הערות", (nx, ny), 2.4, "notes", TA.TOP_RIGHT, bold=True)
        ctx.mtext([f"{i + 1}. {n}" for i, n in enumerate(notes)], (nx, ny - 4.0), 1.6, "notes", width=150.0)
        return self.warnings

    # ---- C-02
    def draw_sections_sheet(self) -> list[str]:
        ctx, t, civ = self.ctx, self.t, self.civ
        sc = 20.0
        s = lambda v: v / sc
        W = s(t.slab.width_mm)
        ext = s(150.0)                         # subbase widening each side
        ox, ytop = ctx.x0 + 70.0, ctx.y1 - 80.0
        self.section_mark(ctx.x0 + 8.0, ctx.y1 - 18.0)
        ctx.text("חתך A–A", (ctx.x0 + 14.0, ctx.y1 - 16.0), 3.0, "panel_text", TA.MIDDLE_LEFT, bold=True)
        draw_scale_bar(ctx, ctx.x0 + 14.0, ctx.y1 - 27.0, sc)
        # unit outline above the slab (on its beams)
        if t.units:
            u = t.units[0]
            uy0 = ox + s(u.y_mm)
            hb = s(t.pedestal.height_mm)
            ctx.rect(uy0, ytop + hb, s(u.depth_mm), 22.0, "existing")
            ctx.rect(uy0, ytop, s(u.depth_mm), hb, "panel_rail")
            self.leader((uy0 + s(u.depth_mm) * 0.3, ytop + hb + 12.0), (ox - 6.0, ytop + hb + 30.0), [f"ארון {u.tag} — קו מתאר", "עיגון לפי יצרן — E-20"])
        y = ytop
        tips = []
        for name, thick, kind in civ.slab_layers:
            th = max(s(thick), 0.6) if kind != "membrane" else 0.0
            x0 = ox - (ext if kind in ("subbase", "subgrade") else 0.0)
            x1 = ox + W + (ext if kind in ("subbase", "subgrade") else 0.0)
            if kind == "membrane":
                ctx.msp.add_lwpolyline([(ox, y - 0.4), (ox + W, y - 0.4)], dxfattribs={"layer": LAYERS["pe"].name, "const_width": 0.3})
                tips.append(((ox + W * 0.15, y - 0.4), name))
                continue
            pts = [(x0, y - th), (x1, y - th), (x1, y), (x0, y)]
            ctx.msp.add_lwpolyline(pts, close=True, dxfattribs={"layer": LAYERS["panel_encl"].name})
            pat, psc = LAYER_HATCH.get(kind, ("ANSI37", 2.0))
            self.hatch(pts, pat, psc)
            if kind == "concrete":
                for frac in (0.25, 0.75):
                    ctx.msp.add_lwpolyline([(ox + 1.5, y - th * frac), (ox + W - 1.5, y - th * frac)],
                                           dxfattribs={"layer": LAYERS["sld_main"].name, "const_width": 0.35})
            self.dim_v(x1, y - th, y, 6.0 if kind != "subgrade" else 6.0, sc)
            tips.append(((x0 + (x1 - x0) * 0.12, y - th / 2), name))
            y -= th
        # leaders to the left, stacked
        lx = ox - 12.0
        for i, (tip, name) in enumerate(tips):
            ty = ytop + 10.0 - i * 9.0
            parts = name.split(", ")
            lines = [", ".join(parts[:2])] + ([", ".join(parts[2:])] if len(parts) > 2 else [])
            self.leader(tip, (lx, ty), lines, h=1.5)
        ctx.line((ox + W + ext + 14.0, ytop), (ox + W + ext + 24.0, ytop), "dim")
        ctx.text("±0.00 פני קרקע", (ox + W + ext + 24.0, ytop + 0.8), 1.6, "dim", TA.BOTTOM_RIGHT)
        self.dim_h(ox, ox + W, y, -8.0, sc)
        if t.units:
            u = t.units[0]
            self.dim_h(ox, ox + s(u.y_mm), y, -14.0, sc)
            self.dim_h(ox + s(u.y_mm + u.depth_mm), ox + W, y, -14.0, sc)
        # slab edge detail 1:10 (top-right area)
        ex, ey = ctx.x1 - 150.0, ctx.y1 - 70.0
        sc2 = 10.0
        th = t.slab.thickness_mm / sc2
        ctx.rect(ex, ey - th, 30.0, th, "panel_encl")
        self.hatch([(ex, ey - th), (ex + 30.0, ey - th), (ex + 30.0, ey), (ex, ey)], "ANSI31", 2.0, 9)
        for frac in (0.25, 0.75):
            ctx.msp.add_lwpolyline([(ex + 1.0, ey - th * frac), (ex + 28.0, ey - th * frac)], dxfattribs={"layer": LAYERS["sld_main"].name, "const_width": 0.35})
        sub = 200.0 / sc2
        pts = [(ex - 6.0, ey - th - 5.0 - sub), (ex + 30.0, ey - th - 5.0 - sub), (ex + 30.0, ey - th - 5.0), (ex - 6.0, ey - th - 5.0)]
        ctx.msp.add_lwpolyline(pts, close=True, dxfattribs={"layer": LAYERS["panel_encl"].name})
        self.hatch(pts, "GRAVEL", 0.25)
        ctx.line((ex + 30.0, ey), (ex + 45.0, ey), "existing")
        self.dim_v(ex, ey - th, ey, -6.0, sc2)
        self.dim_h(ex - 6.0, ex, ey - th - 5.0 - sub, -5.0, sc2)
        self.section_mark(ex - 4.0, ey + 14.0, "2")
        ctx.text("שפת משטח   1:10", (ex + 2.0, ey + 14.0), 2.6, "panel_text", TA.MIDDLE_LEFT, bold=True)
        ctx.text("הרחבת מצע מעבר לשפה — לבדיקה", (ex - 6.0, ey - th - 13.0 - sub), 1.5, "panel_text", TA.TOP_LEFT)
        # corner earthing spike detail 1:10
        kx, ky = ctx.x1 - 150.0, ctx.y1 - 150.0
        ctx.rect(kx, ky - th, 24.0, th, "panel_encl")
        self.hatch([(kx, ky - th), (kx + 24.0, ky - th), (kx + 24.0, ky), (kx, ky)], "ANSI31", 2.0, 9)
        ctx.msp.add_lwpolyline([(kx + 6.0, ky - th * 0.75), (kx + 6.0, ky - th * 0.3), (kx + 30.0, ky - th * 0.3), (kx + 30.0, ky + 4.0)],
                               dxfattribs={"layer": LAYERS["pe"].name, "const_width": 0.5})
        ctx.msp.add_circle((kx + 30.0, ky + 4.8), 0.8, dxfattribs={"layer": LAYERS["pe"].name})
        self.dim_h(kx + 24.0, kx + 30.0, ky - th, -5.0, sc2)
        self.section_mark(kx - 4.0, ky + 14.0, "3")
        ctx.text("קוץ הארקה בפינה   1:10", (kx + 2.0, ky + 14.0), 2.6, "panel_text", TA.MIDDLE_LEFT, bold=True)
        ctx.text("פלח מגולוון מרותך לזיון — יציאה מעל המשטח, ראו E-06", (kx, ky - th - 9.0), 1.5, "panel_text", TA.TOP_LEFT)
        signature_box(ctx)
        return self.warnings

    # ---- C-03
    def draw_trench_sheet(self) -> list[str]:
        ctx, civ = self.ctx, self.civ
        tr = civ.trench
        if tr is None:
            self.warnings.append("פרט חפירה: אין תעלה במודל")
            return self.warnings
        sc = 10.0
        s = lambda v: v / sc
        W, D = s(tr.width_mm), s(tr.depth_mm)
        ox, oy = ctx.x0 + 70.0, ctx.y1 - 34.0         # oy = ground level
        # soil both sides
        for x0 in (ox - 18.0, ox + W):
            pts = [(x0, oy - D - 6.0), (x0 + 18.0, oy - D - 6.0), (x0 + 18.0, oy), (x0, oy)]
            self.hatch(pts, "EARTH", 0.3)
        bottom = [(ox - 18.0, oy - D - 6.0), (ox + W + 18.0, oy - D - 6.0), (ox + W + 18.0, oy - D), (ox - 18.0, oy - D)]
        self.hatch(bottom, "EARTH", 0.3)
        ctx.msp.add_lwpolyline([(ox, oy), (ox, oy - D), (ox + W, oy - D), (ox + W, oy)], dxfattribs={"layer": LAYERS["panel_encl"].name})
        ctx.line((ox - 24.0, oy), (ox + W + 24.0, oy), "existing")
        ctx.text("מפלס קרקע", (ox + W + 24.0, oy + 0.8), 1.6, "dim", TA.BOTTOM_RIGHT)
        # sand zone
        sand_top = oy - D + s(tr.sand_bed_mm) + s(max(c.dia_mm for c in tr.cables) if tr.cables else 50) + s(tr.sand_cover_mm)
        pts = [(ox, oy - D), (ox + W, oy - D), (ox + W, sand_top), (ox, sand_top)]
        self.hatch(pts, "AR-SAND", 0.12, 9)
        ctx.line((ox, sand_top), (ox + W, sand_top), "dim")
        # tapes
        for k in range(tr.tapes):
            yy = oy - s(tr.tape_depth_mm)
            xx = ox + W * (0.2 + 0.45 * k)
            ctx.msp.add_lwpolyline([(xx, yy), (xx + W * 0.25, yy)], dxfattribs={"layer": LAYERS["dc_pos"].name, "const_width": 0.6})
        # cables in a row on the bed
        cy = oy - D + s(tr.sand_bed_mm)
        n = max(1, len(tr.cables))
        for i, c in enumerate(tr.cables):
            cx = ox + W * (i + 1) / (n + 1)
            r = max(0.8, s(c.dia_mm) / 2)
            ctx.msp.add_circle((cx, cy + r), r, dxfattribs={"layer": LAYERS["sld_main"].name})
            if c.kind == "cable":            # direct-buried cable: grey solid; conduits stay open
                wipe = ctx.msp.add_hatch(color=8, dxfattribs={"layer": LAYERS["sld_main"].name})
                wipe.set_solid_fill(color=8)
                wipe.paths.add_edge_path().add_arc((cx, cy + r), r, 0, 360)
            if c.kind == "conduit":
                ctx.msp.add_circle((cx, cy + r), r * 0.35, dxfattribs={"layer": LAYERS["pe" if "הארקה" in c.label else "comm"].name})
            self.leader((cx, cy + r), (ox - 24.0, oy - D + 14.0 + i * 9.0), c.label.split(" — ")[:2], h=1.5)
        # labels
        self.leader((ox + W * 0.5, oy - s(tr.tape_depth_mm)), (ox - 24.0, oy - s(tr.tape_depth_mm) + 6.0), [f"{tr.tapes} סרטי סימון*"], h=1.5)
        self.leader((ox + W * 0.3, oy - s(150)), (ox - 24.0, oy - 4.0), ["מילוי חוזר", f"הידוק {tr.backfill_compaction_pct:g}%*"], h=1.5)
        self.leader((ox + W * 0.75, oy - D + 2.0), (ox - 24.0, oy - D + 4.0), ["ריפוד וכיסוי חול"], h=1.5)
        self.dim_h(ox, ox + W, oy - D - 6.0, -6.0, sc)
        self.dim_v(ox + W + 18.0, oy - D, oy, 8.0, sc)
        self.dim_v(ox + W, oy - s(tr.tape_depth_mm), oy, 4.0, sc)
        self.section_mark(ctx.x0 + 8.0, ctx.y1 - 18.0, tr.tag, "C-03", r=5.0)
        ctx.text(f"{tr.title} ({tr.width_mm:g} × {tr.depth_mm:g} mm)", (ctx.x0 + 16.0, ctx.y1 - 16.0), 3.0, "panel_text", TA.MIDDLE_LEFT, bold=True)
        draw_scale_bar(ctx, ctx.x0 + 16.0, ctx.y1 - 27.0, sc, 500.0)
        # parameters table
        rows = [["רוחב חפירה", f"{tr.width_mm:g} מ\"מ", "פרויקט"], ["עומק חפירה", f"{tr.depth_mm:g} מ\"מ", "פרויקט"],
                ["ריפוד חול", f"{tr.sand_bed_mm:g} מ\"מ*", "כלל civil_trench_sand_bedding_mm"],
                ["כיסוי חול מעל הכבלים", f"{tr.sand_cover_mm:g} מ\"מ*", "כלל civil_trench_sand_bedding_mm"],
                ["עומק סרט סימון", f"{tr.tape_depth_mm:g} מ\"מ*", "כלל civil_warning_tape_depth_mm"],
                ["מספר סרטי סימון", f"{tr.tapes}*", "כלל civil_warning_tape_depth_mm"],
                ["הידוק מילוי חוזר", f"{tr.backfill_compaction_pct:g}%*", "כלל civil_trench_backfill_compaction_pct"]]
        for c in tr.cables:
            ok = "" if c.depth_mm >= 800 or c.kind == "comm" else " (!)"
            rows.append([f"עומק — {c.label.split(' — ')[0]}", f"{c.depth_mm:g} מ\"מ*{ok}", "כלל cable_burial_depth_min — נדרש 800"])
            if ok:
                self.warnings.append(f"תעלה {tr.tag}: {c.label} בעומק {c.depth_mm:g} < 800 מ\"מ")
        draw_table(ctx, ctx.x1 - 6.0, ctx.y1 - 16.0, [Column("פרמטר", 58.0, TA.MIDDLE_RIGHT), Column("ערך", 30.0), Column("מקור", 66.0, TA.MIDDLE_RIGHT)],
                   rows, f"נתוני חפירה {tr.tag} — לאימות", h_text=1.4)
        signature_box(ctx)
        return self.warnings


def draw_civil(ctx: SheetContext, design: Design, civ: Civil, which: str) -> list[str]:
    r = CivilRenderer(ctx, design, civ)
    return {"plan": r.draw_plan_sheet, "sections": r.draw_sections_sheet, "trench": r.draw_trench_sheet}[which]()
