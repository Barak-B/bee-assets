"""Foundation slab reinforcement (משטח יסוד — תכנית ברזל ופרטים) for a BESS equipment pad.

A slab on grade with top + bottom mesh, a thickened perimeter edge, closing U-bars and bent edge bars all
round, chairs between the meshes, shallow formed control joints with EPS, polyethylene on the compacted
ground. Every value is a parameter whose default comes from a rule in ``STRUCT_RULES`` (each rule names its
basis); the reference drawings the rules were learned from are listed in ``engine/references/catalog.json``.

Two sheets:

* **S-01 plan** — the slab at 1:50 with the mesh grid, the thickened edge (hidden line), the control
  joints (placed automatically: at cabinet centres, no bay longer than ``joint_max_spacing_mm`` and every
  anchor of the drilling template at least ``anchor_joint_min_mm`` from a joint), cabinets / beams /
  anchors from the drilling template for reference only, section A–A at 1:20, notes, the pad data table
  (value + rule) and the structural engineer's signature box.
* **S-02 details** — edge detail 1:10 with the bars, bending shapes, the joint and chair details, the bar
  schedule (רשימת ברזל) with lengths and weights, quantities (concrete, EPS, polyethylene) and checks.

Nothing here replaces the structural engineer: the sheets carry the draft banner and an empty signature
box, and default values are marked ``**``.
"""
from __future__ import annotations

import math
from typing import Optional

from ezdxf.enums import TextEntityAlignment as TA
from pydantic import BaseModel, Field

from .civil import Civil, CivilRenderer, loads, signature_box
from .cover import _wrap
from .layers import LAYERS
from .model import Design
from .schedules import Column, draw_table
from .sheet import SheetContext, draw_scale_bar
from .template import DrillTemplate

# rule id → (what, default, basis). The sheet shows the rule id next to each default value.
STRUCT_RULES: dict[str, tuple[str, str, str]] = {
    "struct_pad_concrete": ("סוג בטון משטח ציוד חיצוני", "ב-30", "חשיפה חיצונית — ת\"י 118"),
    "struct_pad_mesh": ("זיון משטח על קרקע", "Ø10@200 עליון + תחתון", "פרטי משטחי BESS שנבחנו"),
    "struct_pad_cover": ("כיסוי בטון כלפי קרקע ודפנות", "50 מ\"מ", "יציקה על יריעה — ת\"י 466"),
    "struct_pad_edge": ("הגבהת שפה היקפית", "400×400, שיפוע 45°", "פרטי משטחי BESS שנבחנו"),
    "struct_pad_joints": ("תפרי התכווצות", "≤4 מ', עומק 40, קלקר 20", "מרווח ≈20×עובי המשטח"),
    "struct_pad_chairs": ("ספסלים בין רשתות", "Ø10 כל 80/80", "פרטי ייחוס"),
    "struct_pad_anchor_joint": ("מרחק עוגן מתפר", "≥150 מ\"מ", "ETA עוגן כימי — מרחק מקצה סדוק"),
}

STEEL_KG_M = {8: 0.395, 10: 0.617, 12: 0.888, 14: 1.208, 16: 1.578}


class Foundation(BaseModel):
    sheet_prefix: str = "S"
    title_plan: str = "משטח יסוד — תכנית ברזל"
    title_details: str = "משטח יסוד — פרטים ורשימת ברזל"
    concrete: str = "ב-30"
    bar_dia_mm: int = 10
    spacing_mm: float = 200
    cover_mm: float = 50                 # bottom and sides ("שומרי מרחק 5 ס"מ מהקרקע ומהדפנות")
    cover_top_mm: float = 50
    edge_depth_mm: float = 400           # thickened edge total depth
    edge_width_mm: float = 400           # flat bottom width of the thickening
    edge_slope_deg: float = 45
    u_leg_mm: float = 450                # closing U-bar ("חיטים") leg
    l_top_mm: float = 900                # edge bar: top leg from the outer face
    l_tail_mm: float = 300               # edge bar: tail at the bottom-mesh level
    edge_long_bars: int = 3              # longitudinal bars in the bottom of the thickening
    chair_spacing_mm: float = 800
    chair_len_mm: float = 700
    joints_x_mm: Optional[list[float]] = None   # None = automatic
    joint_max_spacing_mm: float = 4000
    joint_depth_mm: float = 40
    joint_eps_mm: float = 20
    anchor_joint_min_mm: float = 150
    stock_len_mm: float = 12000
    lap_mm: float = 500
    waste_pct: float = 7
    top_above_ground_mm: Optional[float] = None   # slab top above finished ground (G009: 150)
    ground_level_note: str = ""
    notes: list[str] = Field(default_factory=list)
    verify: list[str] = Field(default_factory=list)
    sources: list[str] = Field(default_factory=list)

    # ---- geometry --------------------------------------------------------------------------
    def thick_reach(self, t: float) -> float:
        """Distance from the slab edge to where the thickening meets the slab underside."""
        return self.edge_width_mm + (self.edge_depth_mm - t) / math.tan(math.radians(self.edge_slope_deg))

    def bar_levels(self, t: float) -> tuple[float, float, float]:
        """Centre-line depths below the slab top: top mesh, bottom mesh, bottom of the thickening."""
        r = self.bar_dia_mm / 2
        return self.cover_top_mm + r, t - self.cover_mm - r, self.edge_depth_mm - self.cover_mm - r

    def shape_a(self, t: float) -> tuple[float, float]:
        """Closing U-bar: (leg, height) — height = top to bottom mesh, outer-to-outer."""
        yt, yb, _ = self.bar_levels(t)
        return self.u_leg_mm, round(yb - yt + self.bar_dia_mm)

    def shape_b(self, t: float) -> dict[str, float]:
        yt, yb, ye = self.bar_levels(t)
        vert = ye - yt + self.bar_dia_mm
        bottom = self.edge_width_mm - self.cover_mm
        rise = ye - yb
        diag = rise / math.sin(math.radians(self.edge_slope_deg))
        return {"top": self.l_top_mm, "vert": round(vert), "bottom": bottom, "diag": round(diag), "tail": self.l_tail_mm,
                "rise": rise, "total": self.l_top_mm + vert + bottom + diag + self.l_tail_mm}

    def joints(self, t: DrillTemplate) -> list[float]:
        L = t.slab.length_mm
        if self.joints_x_mm is not None:
            return sorted(self.joints_x_mm)
        n = max(1, math.ceil(L / self.joint_max_spacing_mm))
        if n == 1:
            return []
        anchors = [p[0] for u in t.units for p in t.anchor_points(u)]
        centres = sorted(u.x_mm + u.width_mm / 2 for u in t.units)      # preferred: mid-cabinet, between its beams
        others = [L * k / (4 * n) for k in range(1, 4 * n)]
        out: list[float] = []
        prev = 0.0
        for k in range(1, n):
            ideal = L * k / n
            remaining = n - k                                            # bays still to come after this joint

            def fits(c: float) -> bool:
                return (prev + 500 < c and c - prev <= self.joint_max_spacing_mm and L - c <= remaining * self.joint_max_spacing_mm
                        and all(abs(c - a) >= self.anchor_joint_min_mm for a in anchors))

            ok = [c for c in centres if fits(c)] or [c for c in others if fits(c)]
            x = min(ok, key=lambda c: abs(c - ideal)) if ok else ideal
            out.append(x)
            prev = x
        return out


# ------------------------------------------------------------------------------------------------ calcs
def _n(span: float, s: float) -> int:
    return int(math.floor(span / s + 1e-6)) + 1


def _with_laps(length: float, f: Foundation) -> float:
    if length <= f.stock_len_mm:
        return length
    laps = math.ceil((length - f.stock_len_mm) / (f.stock_len_mm - f.lap_mm))
    return length + laps * f.lap_mm


def bar_schedule(t: DrillTemplate, f: Foundation) -> list[dict]:
    L, W, th = t.slab.length_mm, t.slab.width_mm, t.slab.thickness_mm
    c, s, d = f.cover_mm, f.spacing_mm, f.bar_dia_mm
    nx, ny = _n(L - 2 * c, s), _n(W - 2 * c, s)
    la, ha = f.shape_a(th)
    sb = f.shape_b(th)
    per = 2 * (nx + ny)
    rows = [
        {"mark": "1", "desc": "רשת תחתונה — מוטות לאורך", "shape": "ישר", "n": ny, "len": _with_laps(L - 2 * c, f)},
        {"mark": "2", "desc": "רשת תחתונה — מוטות לרוחב", "shape": "ישר", "n": nx, "len": W - 2 * c},
        {"mark": "3", "desc": "רשת עליונה — מוטות לאורך", "shape": "ישר", "n": ny, "len": _with_laps(L - 2 * c, f)},
        {"mark": "4", "desc": "רשת עליונה — מוטות לרוחב", "shape": "ישר", "n": nx, "len": W - 2 * c},
        {"mark": "5", "desc": "\"חיטים\" — U סוגר בהיקף", "shape": f"U {la / 10:g}×{ha / 10:g}", "n": per, "len": 2 * la + ha},
        {"mark": "6", "desc": "מוט שפה מכופף — הגבהת שפה", "shape": "צורה 6", "n": per, "len": sb["total"]},
        {"mark": "7", "desc": f"השלמת מוטות — {f.edge_long_bars} מוטות בתחתית השפה", "shape": "ישר",
         "n": 2 * f.edge_long_bars, "len": _with_laps(L - 2 * c, f)},
        {"mark": "8", "desc": f"השלמת מוטות — {f.edge_long_bars} מוטות בתחתית השפה", "shape": "ישר",
         "n": 2 * f.edge_long_bars, "len": W - 2 * c},
        {"mark": "9", "desc": f"ספסלים בין הרשתות @{f.chair_spacing_mm / 10:g}/{f.chair_spacing_mm / 10:g}", "shape": "ספסל",
         "n": _n(L - 2 * c, f.chair_spacing_mm) * _n(W - 2 * c, f.chair_spacing_mm), "len": f.chair_len_mm},
    ]
    kg_m = STEEL_KG_M.get(d, 0.00617 * d * d)
    for r in rows:
        r["dia"] = d
        r["total_m"] = r["n"] * r["len"] / 1000.0
        r["kg"] = r["total_m"] * kg_m
    return rows


def quantities(t: DrillTemplate, f: Foundation, rows: list[dict]) -> list[list[str]]:
    L, W, th = t.slab.length_mm / 1000, t.slab.width_mm / 1000, t.slab.thickness_mm / 1000
    De, We = f.edge_depth_mm / 1000, f.edge_width_mm / 1000
    extra_h = De - th
    run = extra_h / math.tan(math.radians(f.edge_slope_deg))
    area_x = extra_h * We + 0.5 * extra_h * run           # extra section of the thickening per metre of edge
    reach = We + run
    perim_len = 2 * (L + W) - 4 * reach                     # straight runs between the corner blocks
    corners = 4 * reach * reach * extra_h * 0.75            # corner overlap blocks (approx.)
    v_slab = L * W * th
    v_edge = area_x * perim_len + corners
    steel = sum(r["kg"] for r in rows)
    eps_m = len(f.joints(t)) * W
    pe_m2 = (L + 2 * De) * (W + 2 * De)
    return [
        ["בטון משטח " + f.concrete, f"{v_slab:.2f}", "מ\"ק", f"{L:g}×{W:g}×{th:g}"],
        ["בטון הגבהת שפה (תוספת)", f"{v_edge:.2f}", "מ\"ק", "≈ לפי חתך השפה"],
        ["סה\"כ בטון", f"{v_slab + v_edge:.1f}", "מ\"ק", "ללא פחת"],
        [f"פלדת זיון Ø{f.bar_dia_mm} — נטו", f"{steel:,.0f}", "ק\"ג", "רשימת ברזל"],
        [f"פלדת זיון — כולל {f.waste_pct:g}% פחת/חפיפות", f"{steel * (1 + f.waste_pct / 100):,.0f}", "ק\"ג", ""],
        [f"קלקר {f.joint_eps_mm / 10:g} ס\"מ לתפרים", f"{eps_m:.1f}", "מ\"א", f"{len(f.joints(t))} תפרים × {W:g} מ'"],
        ["יריעת ניילון מתחת ליציקה", f"{pe_m2:.0f}", "מ\"ר", "כולל קיפול בשפה"],
    ]


def checks(design: Design, t: DrillTemplate, f: Foundation) -> list[tuple[str, str, bool]]:
    """(item, value, ok) rows. Failures also go to the sheet warnings."""
    L, th = t.slab.length_mm, t.slab.thickness_mm
    js = f.joints(t)
    bays = [b - a for a, b in zip([0.0] + js, js + [L])]
    out: list[tuple[str, str, bool]] = []
    out.append(("מרווח תפרים מרבי", f"{max(bays):,.0f} ≤ {f.joint_max_spacing_mm:,.0f}", max(bays) <= f.joint_max_spacing_mm + 1e-6))
    anchors = [p for u in t.units for p in t.anchor_points(u)]
    if js and anchors:
        dmin = min(abs(a[0] - j) for a in anchors for j in js)
        out.append(("מרחק עוגן מתפר", f"{dmin:,.0f} ≥ {f.anchor_joint_min_mm:g}", dmin >= f.anchor_joint_min_mm))
    if anchors:
        emin = min(min(x, y, t.slab.length_mm - x, t.slab.width_mm - y) for x, y in anchors)
        out.append(("מרחק עוגן משפת המשטח", f"{emin:,.0f} ≥ {t.slab.edge_min_mm:g}", emin >= t.slab.edge_min_mm))
        out.append(("עומק קידוח עוגן מול עובי משטח", f"{t.anchor.depth_mm:g} ≤ {th - f.cover_mm:g}", t.anchor.depth_mm <= th - f.cover_mm))
    _, ha = f.shape_a(th)
    out.append(("מרווח בין הרשתות (גובה \"חיט\")", f"{ha:g} מ\"מ", ha >= 60))
    if f.top_above_ground_mm is not None:
        h = f.top_above_ground_mm + t.pedestal.height_mm
        out.append(("גובה יסוד מעל קרקע (משטח+קורה)", f"{h:g} — יצרן 300–450", 300 <= h <= 450))
    rows = loads(design, t, Civil())
    out.append(("לחץ ממוצע על הקרקע", f"{rows[-1][4].rstrip('*')} kPa", True))
    return out


# ------------------------------------------------------------------------------------------------ renderer
class FoundationRenderer(CivilRenderer):
    def __init__(self, ctx: SheetContext, design: Design, f: Foundation):
        super().__init__(ctx, design, Civil())
        self.f = f

    # ---- small drawing helpers
    def pl(self, pts, layer, width=0.0, close=False):
        attribs = {"layer": LAYERS[layer].name}
        if width:
            attribs["const_width"] = width
        self.ctx.msp.add_lwpolyline(pts, close=close, dxfattribs=attribs)

    def dot(self, x, y, r, layer="rebar_main"):
        self.ctx.msp.add_circle((x, y), r, dxfattribs={"layer": LAYERS[layer].name})

    def title_under(self, x, y, title, scale):
        ctx = self.ctx
        ctx.text(title, (x, y), 2.8, "panel_text", TA.MIDDLE_CENTER, bold=True)
        ctx.line((x - 30.0, y - 2.4), (x + 30.0, y - 2.4), "panel_text")
        ctx.text(f"קנ\"מ {scale}", (x, y - 5.0), 2.0, "panel_text", TA.MIDDLE_CENTER)

    def notes_block(self, x_right, y_top, title, items, width=150.0, h=1.7):
        ctx = self.ctx
        ctx.text(title, (x_right, y_top), 2.6, "notes", TA.TOP_RIGHT, bold=True)
        y = y_top - 5.0
        maxc = int(width / (h * 0.9))
        for i, n in enumerate(items, 1):
            for k, line in enumerate(_wrap(f"{i}. {n}", maxc)):
                ctx.text(line, (x_right - (0 if k == 0 else 3.0), y), h, "notes", TA.TOP_RIGHT)
                y -= h + 1.1
            y -= 0.6
        return y

    # ---- S-01
    def draw_plan(self) -> list[str]:
        ctx, t, f = self.ctx, self.t, self.f
        sc = 50.0
        s = lambda v: v / sc
        L, W, th = t.slab.length_mm, t.slab.width_mm, t.slab.thickness_mm
        ox, oy = ctx.x0 + 30.0, ctx.y1 - 40.0 - s(W)
        # slab outline + mesh grid (top and bottom meshes are identical in plan)
        ctx.rect(ox, oy, s(L), s(W), "panel_encl")
        c, sp = f.cover_mm, f.spacing_mm
        for i in range(_n(L - 2 * c, sp)):
            x = ox + s(c + i * sp)
            ctx.line((x, oy + s(c)), (x, oy + s(W - c)), "rebar")
        for j in range(_n(W - 2 * c, sp)):
            y = oy + s(c + j * sp)
            ctx.line((ox + s(c), y), (ox + s(L - c), y), "rebar")
        # thickened edge: the line where the thickening meets the slab underside
        r = f.thick_reach(th)
        self.pl([(ox + s(r), oy + s(r)), (ox + s(L - r), oy + s(r)), (ox + s(L - r), oy + s(W - r)), (ox + s(r), oy + s(W - r))],
                "fnd_thick", close=True)
        # cabinets, beams, anchors — reference only
        for u in t.units:
            ux, uy = ox + s(u.x_mm), oy + s(u.y_mm)
            self.pl([(ux, uy), (ux + s(u.width_mm), uy), (ux + s(u.width_mm), uy + s(u.depth_mm)), (ux, uy + s(u.depth_mm))],
                    "fnd_ref", close=True)
            ctx.text(u.tag, (ux + s(u.width_mm) / 2, uy + s(u.depth_mm) + 1.2), 1.5, "panel_text", TA.BOTTOM_CENTER)
            for ax, ay in t.anchor_points(u):
                ctx.msp.add_circle((ox + s(ax), oy + s(ay)), 0.45, dxfattribs={"layer": LAYERS["check"].name})
        # control joints
        js = f.joints(t)
        for k, jx in enumerate(js, 1):
            x = ox + s(jx)
            ctx.msp.add_line((x, oy - 3.0), (x, oy + s(W) + 3.0), dxfattribs={"layer": LAYERS["fnd_joint"].name})
            ctx.text(f"J{k}", (x, oy + s(W) + 4.0), 1.8, "panel_text", TA.BOTTOM_CENTER, bold=True)
        # closing U-bars along the edges — typical groups only (the rule is in the notes)
        la = s(f.u_leg_mm)
        for gx in (0.12, 0.5, 0.86):
            for k in range(3):
                x = ox + s(L) * gx + k * s(sp)
                self.pl([(x, oy + 0.4), (x, oy + 0.4 + la)], "rebar_main", 0.3)
                self.pl([(x, oy + s(W) - 0.4), (x, oy + s(W) - 0.4 - la)], "rebar_main", 0.3)
        for gy in (0.3, 0.62):
            for k in range(3):
                y = oy + s(W) * gy + k * s(sp)
                self.pl([(ox + 0.4, y), (ox + 0.4 + la, y)], "rebar_main", 0.3)
                self.pl([(ox + s(L) - 0.4, y), (ox + s(L) - 0.4 - la, y)], "rebar_main", 0.3)
        # chair symbol (one typical)
        cx, cy = ox + s(L) * 0.43, oy + s(W) * 0.5
        self.pl([(cx - 2.0, cy - 1.6), (cx - 2.0, cy + 1.6), (cx + 2.0, cy + 1.6), (cx + 2.0, cy - 1.6)], "rebar_main", 0.3)
        # section A–A across the width through the second cabinet from the left
        xs = ox + (s(t.units[1].x_mm + t.units[1].width_mm * 0.3) if len(t.units) > 1 else s(L) / 2)
        ctx.msp.add_line((xs, oy - 7.0), (xs, oy + s(W) + 7.0), dxfattribs={"layer": LAYERS["dim"].name, "linetype": "DASHDOT"})
        self.section_mark(xs, oy + s(W) + 11.0, "A", f"{f.sheet_prefix}-01")
        self.section_mark(xs, oy - 11.0, "A", f"{f.sheet_prefix}-01")
        # labels with leaders (outside the slab)
        top = oy + s(W)
        self.leader((ox + s(L) * 0.12 + s(sp), top - 0.4 - la * 0.6), (ox + s(L) * 0.12 - 4.0, top + 13.0),
                    ["\"חיטים\" U Ø10@20 בכל ההיקף — מוט 5"], align=TA.BOTTOM_RIGHT, h=1.5)
        self.leader((ox + s(L) - s(r), oy + s(W) * 0.75), (ox + s(L) + 4.0, top + 13.0),
                    ["קו הגבהת שפה (נסתר)", f"עומק {f.edge_depth_mm / 10:g} — פרט 1/{f.sheet_prefix}-02"], align=TA.BOTTOM_LEFT, h=1.5)
        self.leader((cx, cy + 1.6), (ox + s(L) * 0.43 - 30.0, oy - 22.0),
                    [f"ספסל Ø10 כל {f.chair_spacing_mm / 10:g}/{f.chair_spacing_mm / 10:g} — מוט 9"], align=TA.TOP_LEFT, h=1.5)
        self.leader((ox + s(L) * 0.62, oy + s(W) * 0.38), (ox + s(L) * 0.62 + 12.0, oy - 22.0),
                    [f"רשת עליונה + תחתונה Ø{f.bar_dia_mm}@{sp / 10:g}/{sp / 10:g}"], align=TA.TOP_LEFT, h=1.5)
        # dimensions
        self.dim_h(ox, ox + s(L), oy, -16.0, sc)
        chain = [0.0] + js + [L]
        if js:
            for a, b in zip(chain, chain[1:]):
                self.dim_h(ox + s(a), ox + s(b), top, 20.0, sc)
        self.dim_v(ox, oy, oy + s(W), -10.0, sc)
        self.dim_v(ox + s(L), oy, oy + s(r), 6.0, sc)
        title_x = ox + s(L) / 2
        self.title_under(title_x, oy - 34.0, "תכנית משטח — רשת עליונה ותחתונה", "1:50")
        draw_scale_bar(ctx, ox, oy - 44.0, sc)
        ctx.text("מידות במ\"מ · עוגנים (נקודות אדומות), ארונות וקורות — לייחוס בלבד, לפי שבלונת קידוח " + t.sheet_no,
                 (ox + s(L), oy - 47.0), 1.5, "panel_text", TA.TOP_RIGHT)
        # section A–A at 1:20 (below the plan)
        self.draw_section_aa(ox + 24.0, oy - 76.0)
        # right column: notes + data table + signature
        xr = ctx.x1 - 6.0
        notes = list(f.notes) or default_notes(f, t)
        y = self.notes_block(xr, ctx.y1 - 14.0, "הערות", notes)
        rows = self.data_rows()
        draw_table(ctx, xr, y - 8.0, [Column("נתון", 60.0, TA.MIDDLE_RIGHT), Column("ערך", 40.0), Column("מקור", 50.0, TA.MIDDLE_RIGHT)],
                   rows, "נתוני משטח — לאימות מהנדס קונסטרוקציה", h_text=1.4)
        signature_box(ctx)
        for item, val, ok in checks(self.design, t, f):
            if not ok:
                self.warnings.append(f"יסוד: {item} — {val}")
        return self.warnings

    def data_rows(self) -> list[list[str]]:
        t, f = self.t, self.f
        th = t.slab.thickness_mm
        js = f.joints(t)
        rows = [
            ["מידות משטח", f"{t.slab.length_mm / 1000:g}×{t.slab.width_mm / 1000:g}×{th / 1000:g} מ'", "Roche G009"],
            ["בטון", f"{f.concrete}**", STRUCT_RULES["struct_pad_concrete"][2]],
            ["זיון", f"Ø{f.bar_dia_mm}@{f.spacing_mm:g} עליון+תחתון**", STRUCT_RULES["struct_pad_mesh"][2]],
            ["כיסוי / שומרי מרחק", f"{f.cover_mm:g} מ\"מ**", STRUCT_RULES["struct_pad_cover"][2]],
            ["הגבהת שפה (עומק × רוחב)", f"{f.edge_depth_mm:g}×{f.edge_width_mm:g} מ\"מ**", STRUCT_RULES["struct_pad_edge"][2]],
            ["תפרים", f"{len(js)} · עומק {f.joint_depth_mm:g} · קלקר {f.joint_eps_mm:g}", STRUCT_RULES["struct_pad_joints"][2]],
            ["ארונות על המשטח", f"{len(t.units)} × {t.units[0].model}" if t.units else "-", "Roche G009"],
        ]
        if f.top_above_ground_mm is not None:
            rows.append(["פני משטח מעל קרקע", f"{f.top_above_ground_mm:g} מ\"מ", "Roche G009"])
        return rows

    def draw_section_aa(self, x0: float, ytop: float) -> None:
        """Transverse section A–A at 1:20: slab, both thickened edges, meshes, a cabinet on its beam."""
        ctx, t, f = self.ctx, self.t, self.f
        sc = 20.0
        s = lambda v: v / sc
        W, th = t.slab.width_mm, t.slab.thickness_mm
        De, We = f.edge_depth_mm, f.edge_width_mm
        r = f.thick_reach(th)
        prof = [(x0, ytop), (x0 + s(W), ytop), (x0 + s(W), ytop - s(De)), (x0 + s(W - We), ytop - s(De)),
                (x0 + s(W - r), ytop - s(th)), (x0 + s(r), ytop - s(th)), (x0 + s(We), ytop - s(De)), (x0, ytop - s(De))]
        self.pl(prof, "panel_encl", close=True)
        self.hatch(prof, "ANSI31", 1.2, 9)
        yt, yb, ye = f.bar_levels(th)
        self.pl([(x0 + s(f.cover_mm), ytop - s(yt)), (x0 + s(W - f.cover_mm), ytop - s(yt))], "rebar_main", 0.25)
        self.pl([(x0 + s(r), ytop - s(yb)), (x0 + s(W - r), ytop - s(yb))], "rebar_main", 0.25)
        for side in (0, 1):
            sgn = 1 if side == 0 else -1
            xe = x0 if side == 0 else x0 + s(W)
            sb = f.shape_b(th)
            pts = [(xe + sgn * s(f.cover_mm + sb["top"]), ytop - s(yt)), (xe + sgn * s(f.cover_mm), ytop - s(yt)),
                   (xe + sgn * s(f.cover_mm), ytop - s(ye)), (xe + sgn * s(We), ytop - s(ye)),
                   (xe + sgn * s(We + sb["rise"]), ytop - s(yb)), (xe + sgn * s(We + sb["rise"] + sb["tail"]), ytop - s(yb))]
            self.pl(pts, "rebar_main", 0.25)
            for k in range(f.edge_long_bars):
                self.dot(xe + sgn * s(f.cover_mm + 15 + k * (We - 2 * f.cover_mm) / max(1, f.edge_long_bars - 1) * 0.9), ytop - s(ye) + 0.35, 0.3)
        # polyethylene under the slab (follows the underside)
        self.pl([(x0, ytop - s(De) - 0.5), (x0 + s(We), ytop - s(De) - 0.5), (x0 + s(r), ytop - s(th) - 0.5),
                 (x0 + s(W - r), ytop - s(th) - 0.5), (x0 + s(W - We), ytop - s(De) - 0.5), (x0 + s(W), ytop - s(De) - 0.5)], "pe", 0.2)
        # ground level
        if f.top_above_ground_mm is not None:
            gy = ytop - s(f.top_above_ground_mm)
            ctx.line((x0 - 34.0, gy), (x0, gy), "existing")
            ctx.line((x0 + s(W), gy), (x0 + s(W) + 6.0, gy), "existing")
            ctx.text("פני קרקע", (x0 - 34.0, gy + 0.8), 1.5, "dim", TA.BOTTOM_LEFT)
            self.dim_v(x0, gy, ytop, -12.0, sc)
        # one cabinet on its beam (outline, broken above)
        if t.units:
            u = t.units[1] if len(t.units) > 1 else t.units[0]
            hb = s(t.pedestal.height_mm)
            plen = t.pedestal.length_mm or u.depth_mm
            y0b = u.y_mm + (u.depth_mm - plen) / 2
            self.pl([(x0 + s(y0b), ytop), (x0 + s(y0b + plen), ytop), (x0 + s(y0b + plen), ytop + hb), (x0 + s(y0b), ytop + hb)],
                    "panel_rail", close=True)
            self.pl([(x0 + s(u.y_mm), ytop + hb), (x0 + s(u.y_mm), ytop + hb + 14.0)], "fnd_ref")
            self.pl([(x0 + s(u.y_mm + u.depth_mm), ytop + hb), (x0 + s(u.y_mm + u.depth_mm), ytop + hb + 14.0)], "fnd_ref")
            prof_words = t.pedestal.profile.split(" ")
            ctx.text(f"ארון {u.tag} (קו מתאר) על קורת {' '.join(prof_words[:2])}",
                     (x0 + s(u.y_mm + u.depth_mm / 2), ytop + hb + 8.0), 1.6, "panel_text", TA.MIDDLE_CENTER)
            self.dim_h(x0, x0 + s(y0b), ytop, 4.0, sc)
        ctx.text("חזית הארונות ←", (x0 - 2.0, ytop + 6.0), 1.6, "panel_text", TA.BOTTOM_RIGHT)
        sb = f.shape_b(th)
        self.leader((x0 + s(W) - s(f.cover_mm + 200), ytop - s(yt)), (x0 + s(W) + 8.0, ytop + 10.0),
                    [f"רשת עליונה Ø{f.bar_dia_mm}@{f.spacing_mm / 10:g}/{f.spacing_mm / 10:g}"], align=TA.BOTTOM_LEFT, h=1.5)
        self.leader((x0 + s(W / 2), ytop - s(yb)), (x0 + s(W) + 8.0, ytop - 6.0),
                    [f"רשת תחתונה Ø{f.bar_dia_mm}@{f.spacing_mm / 10:g}/{f.spacing_mm / 10:g}"], align=TA.BOTTOM_LEFT, h=1.5)
        self.leader((x0 + s(W) - s(We + sb["rise"] / 2), ytop - s((yb + ye) / 2)), (x0 + s(W) + 8.0, ytop - s(De) - 4.0),
                    ["מוטות 5–8 — פרט 1/" + f"{f.sheet_prefix}-02"], align=TA.BOTTOM_LEFT, h=1.5)
        self.leader((x0 + s(W) * 0.3, ytop - s(th) - 0.5), (x0 - 6.0, ytop - s(De) - 8.0),
                    ["ניילון בין הקרקע ליציקה"], align=TA.BOTTOM_RIGHT, h=1.5)
        self.dim_h(x0, x0 + s(W), ytop - s(De), -6.0, sc)
        self.dim_v(x0, ytop - s(De), ytop, -6.0, sc)
        self.dim_v(x0 + s(W * 0.62), ytop - s(th), ytop, 0.0, sc)
        self.title_under(x0 + s(W) / 2, ytop - s(De) - 22.0, "חתך A–A", "1:20")

    # ---- S-02
    def draw_details(self) -> list[str]:
        ctx, t, f = self.ctx, self.t, self.f
        th = t.slab.thickness_mm
        # 1 — edge detail 1:10
        sc = 10.0
        s = lambda v: v / sc
        ex, ey = ctx.x0 + 32.0, ctx.y1 - 34.0          # outer top corner of the slab
        De, We = f.edge_depth_mm, f.edge_width_mm
        r = f.thick_reach(th)
        run_len = 1000.0
        prof = [(ex, ey), (ex + s(run_len), ey), (ex + s(run_len), ey - s(th)), (ex + s(r), ey - s(th)),
                (ex + s(We), ey - s(De)), (ex, ey - s(De))]
        self.pl(prof, "panel_encl", close=True)
        self.hatch(prof, "ANSI31", 3.0, 9)
        # break line at the slab side
        bx = ex + s(run_len)
        ctx.line((bx + 1.5, ey + 3.0), (bx - 1.5, ey - s(th) - 3.0), "dim")
        yt, yb, ye = f.bar_levels(th)
        sb = f.shape_b(th)
        la, ha = f.shape_a(th)
        cx0 = ex + s(f.cover_mm)
        # shape 6 (edge bar)
        self.pl([(cx0 + s(sb["top"]), ey - s(yt)), (cx0, ey - s(yt)), (cx0, ey - s(ye)), (ex + s(We), ey - s(ye)),
                 (ex + s(We + sb["rise"]), ey - s(yb)), (ex + s(We + sb["rise"] + sb["tail"]), ey - s(yb))], "rebar_main", 0.35)
        # shape 5 (closing U) slightly inside
        ux = cx0 + 1.0
        self.pl([(ux + s(la), ey - s(yt) - 0.9), (ux, ey - s(yt) - 0.9), (ux, ey - s(yb) + 0.9), (ux + s(la), ey - s(yb) + 0.9)], "rebar_main", 0.35)
        # mesh: longitudinal bars (dots) along the top and bottom levels
        k = 0
        x = f.cover_mm + 25
        while x < run_len - 20:
            self.dot(ex + s(x), ey - s(yt) - 1.6, 0.5)
            if x > r:
                self.dot(ex + s(x), ey - s(yb) + 1.6, 0.5)
            x += f.spacing_mm
            k += 1
        for i in range(f.edge_long_bars):
            xx = f.cover_mm + 25 + i * (We - 2 * f.cover_mm - 25) / max(1, f.edge_long_bars - 1)
            self.dot(ex + s(xx), ey - s(ye) + 1.6, 0.5)
        # polyethylene + ground
        self.pl([(ex - 3.0, ey - s(De) - 0.6), (ex + s(We), ey - s(De) - 0.6), (ex + s(r), ey - s(th) - 0.6), (bx, ey - s(th) - 0.6)], "pe", 0.25)
        if f.top_above_ground_mm is not None:
            gy = ey - s(f.top_above_ground_mm)
            ctx.line((ex - 18.0, gy), (ex, gy), "existing")
            ctx.text("פני קרקע", (ex - 18.0, gy + 0.8), 1.5, "dim", TA.BOTTOM_LEFT)
        # dims
        self.dim_v(ex, ey - s(De), ey, -24.0, sc)
        self.dim_v(bx, ey - s(th), ey, 6.0, sc)
        self.dim_h(ex, ex + s(We), ey - s(De), -6.0, sc)
        self.dim_h(ex + s(We), ex + s(r), ey - s(De), -6.0, sc)
        # leaders (right of the detail, under the slab)
        lx = ex + s(r) + 26.0
        self.leader((ex + s(We + sb["rise"] * 0.5), ey - s((yb + ye) / 2)), (lx, ey - s(De) - 2.0),
                    [f"מוט 6: Ø{f.bar_dia_mm}@{f.spacing_mm / 10:g} — מוט שפה מכופף"], align=TA.BOTTOM_LEFT, h=1.5)
        self.leader((ux, ey - s((yt + yb) / 2)), (lx, ey - s(De) + 8.0),
                    [f"מוט 5: \"חיט\" U Ø{f.bar_dia_mm}@{f.spacing_mm / 10:g}"], align=TA.BOTTOM_LEFT, h=1.5)
        self.leader((ex + s(f.cover_mm + 25), ey - s(ye) + 1.6), (ex + s(r) + 26.0, ey - s(De) - 10.0),
                    [f"מוטות 7–8: {f.edge_long_bars}Ø{f.bar_dia_mm} השלמת מוטות"], align=TA.BOTTOM_LEFT, h=1.5)
        self.leader((ex + s(We * 0.5), ey - s(De) - 0.6), (ex + s(We) + 6.0, ey - s(De) - 16.0),
                    ["ניילון בין הקרקע ליציקה"], align=TA.BOTTOM_LEFT, h=1.5)
        self.title_under(ex + s(run_len) / 2, ey - s(De) - 28.0, "1 — פרט קצה רצפה", "1:10")
        # bending shapes (to scale 1:10, dims in cm)
        bx0, by0 = ex + 4.0, ey - s(De) - 52.0
        self.pl([(bx0 + s(la), by0), (bx0, by0), (bx0, by0 - s(ha)), (bx0 + s(la), by0 - s(ha))], "rebar_main", 0.35)
        ctx.text(f"{la / 10:g}", (bx0 + s(la) / 2, by0 + 1.0), 1.8, "dim", TA.BOTTOM_CENTER)
        ctx.text(f"{ha / 10:g}", (bx0 - 1.5, by0 - s(ha) / 2), 1.8, "dim", TA.MIDDLE_RIGHT)
        ctx.text(f"מוט 5 — Ø{f.bar_dia_mm}@{f.spacing_mm / 10:g} · אורך {(2 * la + ha) / 10:g} ס\"מ", (bx0 + s(la) + 4.0, by0 - s(ha) / 2),
                 1.8, "panel_text", TA.MIDDLE_LEFT)
        by1 = by0 - s(ha) - 12.0
        p = [(bx0 + s(sb["top"]), by1), (bx0, by1), (bx0, by1 - s(sb["vert"])), (bx0 + s(sb["bottom"]), by1 - s(sb["vert"])),
             (bx0 + s(sb["bottom"] + sb["rise"]), by1 - s(sb["vert"] - sb["rise"])),
             (bx0 + s(sb["bottom"] + sb["rise"] + sb["tail"]), by1 - s(sb["vert"] - sb["rise"]))]
        self.pl(p, "rebar_main", 0.35)
        ctx.text(f"{sb['top'] / 10:g}", (bx0 + s(sb["top"]) / 2, by1 + 1.0), 1.8, "dim", TA.BOTTOM_CENTER)
        ctx.text(f"{sb['vert'] / 10:g}", (bx0 - 1.5, by1 - s(sb["vert"]) / 2), 1.8, "dim", TA.MIDDLE_RIGHT)
        ctx.text(f"{sb['bottom'] / 10:g}", (bx0 + s(sb["bottom"]) / 2, by1 - s(sb["vert"]) - 1.0), 1.8, "dim", TA.TOP_CENTER)
        ctx.text(f"{sb['tail'] / 10:g}", (bx0 + s(sb["bottom"] + sb["rise"] + sb["tail"] / 2), by1 - s(sb["vert"] - sb["rise"]) - 1.0),
                 1.8, "dim", TA.TOP_CENTER)
        ctx.text(f"מוט 6 — Ø{f.bar_dia_mm}@{f.spacing_mm / 10:g} · אורך ≈{sb['total'] / 10:.0f} ס\"מ", (bx0 + s(sb["top"]) + 4.0, by1 - s(sb["vert"]) / 2),
                 1.8, "panel_text", TA.MIDDLE_LEFT)
        ctx.text("צורות כיפוף — מידות בס\"מ (חיצוני)", (bx0, by0 + 7.0), 2.2, "panel_text", TA.BOTTOM_LEFT, bold=True)
        # 2 — joint detail 1:5
        sc5 = 5.0
        q = lambda v: v / sc5
        jx, jy = ctx.x0 + 30.0, ctx.y0 + 64.0
        jw = 320.0
        self.pl([(jx, jy), (jx + q(jw), jy), (jx + q(jw), jy - q(th)), (jx, jy - q(th))], "panel_encl", close=True)
        self.hatch([(jx, jy), (jx + q(jw), jy), (jx + q(jw), jy - q(th)), (jx, jy - q(th))], "ANSI31", 4.0, 9)
        gx = jx + q(jw) / 2
        g = [(gx - q(f.joint_eps_mm) / 2, jy), (gx + q(f.joint_eps_mm) / 2, jy), (gx + q(f.joint_eps_mm) / 2, jy - q(f.joint_depth_mm)),
             (gx - q(f.joint_eps_mm) / 2, jy - q(f.joint_depth_mm))]
        wipe = ctx.msp.add_hatch(color=7, dxfattribs={"layer": LAYERS["hatch"].name})
        wipe.paths.add_polyline_path(g, is_closed=True)
        self.pl(g, "panel_encl", close=True)
        self.pl([(jx + 1.0, jy - q(yt)), (jx + q(jw) - 1.0, jy - q(yt))], "rebar_main", 0.35)
        self.pl([(jx + 1.0, jy - q(yb)), (jx + q(jw) - 1.0, jy - q(yb))], "rebar_main", 0.35)
        self.pl([(jx - 2.0, jy - q(th) - 0.6), (jx + q(jw) + 2.0, jy - q(th) - 0.6)], "pe", 0.25)
        self.dim_v(gx + q(f.joint_eps_mm) / 2, jy - q(f.joint_depth_mm), jy, 10.0, sc5)
        self.dim_h(gx - q(f.joint_eps_mm) / 2, gx + q(f.joint_eps_mm) / 2, jy, 6.0, sc5)
        self.dim_v(jx, jy - q(th), jy, -6.0, sc5)
        self.leader((gx, jy - q(f.joint_depth_mm) / 2), (jx + q(jw) + 6.0, jy + 6.0),
                    [f"קלקר {f.joint_eps_mm / 10:g} ס\"מ לעומק {f.joint_depth_mm / 10:g} ס\"מ", "יוצב לפני היציקה"], align=TA.BOTTOM_LEFT, h=1.5)
        self.leader((jx + q(jw) * 0.8, jy - q(yb)), (jx + q(jw) + 6.0, jy - q(th) + 2.0),
                    ["הרשתות רציפות דרך התפר"], align=TA.BOTTOM_LEFT, h=1.5)
        self.title_under(jx + q(jw) / 2, jy - q(th) - 12.0, "2 — פרט תפר", "1:5")
        # 3 — chair detail 1:5
        hx, hy = ctx.x0 + 152.0, ctx.y0 + 64.0
        hgt = yb - yt - f.bar_dia_mm
        self.pl([(hx, hy - q(th)), (hx + q(jw * 0.7), hy - q(th))], "existing")
        self.dot(hx + q(60), hy - q(yb), 0.9)
        self.dot(hx + q(jw * 0.7) - q(60), hy - q(yb), 0.9)
        self.pl([(hx + q(60) - 3.0, hy - q(yb) - 0.9), (hx + q(60), hy - q(yb) - 0.9), (hx + q(60), hy - q(yt) + 0.9),
                 (hx + q(jw * 0.7) - q(60), hy - q(yt) + 0.9), (hx + q(jw * 0.7) - q(60), hy - q(yb) - 0.9),
                 (hx + q(jw * 0.7) - q(60) + 3.0, hy - q(yb) - 0.9)], "rebar_main", 0.35)
        self.pl([(hx + 1.0, hy - q(yt)), (hx + q(jw * 0.7) - 1.0, hy - q(yt))], "rebar_main", 0.35)
        self.dim_v(hx + q(jw * 0.7), hy - q(yb), hy - q(yt), 6.0, sc5, text=f"{hgt:g}")
        self.leader((hx + q(jw * 0.35), hy - q(yt) + 0.9), (hx + q(jw * 0.35) + 10.0, hy + 14.0),
                    [f"ספסל Ø{f.bar_dia_mm} כל {f.chair_spacing_mm / 10:g}/{f.chair_spacing_mm / 10:g}", "גובה גדל בהתאם לשיפוע הקרקע"],
                    align=TA.BOTTOM_LEFT, h=1.5)
        self.title_under(hx + q(jw * 0.35), hy - q(th) - 12.0, "3 — פרט ספסל", "1:5")
        # right column: bar schedule, quantities, checks
        xr = ctx.x1 - 6.0
        rows = bar_schedule(t, f)
        trows = [[r["mark"], r["desc"], r["shape"], f"Ø{r['dia']}", str(r["n"]), f"{r['len'] / 1000:.2f}", f"{r['total_m']:.1f}", f"{r['kg']:.0f}"]
                 for r in rows]
        tot = sum(r["kg"] for r in rows)
        trows.append(["", "סה\"כ נטו", "", "", "", "", f"{sum(r['total_m'] for r in rows):.0f}", f"{tot:,.0f}"])
        y = draw_table(ctx, xr, ctx.y1 - 18.0,
                       [Column("מס'", 8.0), Column("תיאור", 58.0, TA.MIDDLE_RIGHT), Column("צורה", 18.0), Column("Ø", 9.0),
                        Column("כמות", 12.0), Column("אורך [מ']", 15.0), Column("סה\"כ [מ']", 16.0), Column("ק\"ג", 14.0)],
                       trows, "רשימת ברזל — Ø10 = 0.617 ק\"ג/מ'", h_text=1.35)
        y = draw_table(ctx, xr, y - 10.0, [Column("פריט", 58.0, TA.MIDDLE_RIGHT), Column("כמות", 18.0), Column("יח'", 12.0),
                                           Column("הערה", 42.0, TA.MIDDLE_RIGHT)],
                       quantities(t, f, rows), "כמויות לביצוע (להערכה — ללא פחת בטון)", h_text=1.35)
        crow = [[it, val, "✓" if ok else "✗ לבדיקה"] for it, val, ok in checks(self.design, t, f)]
        draw_table(ctx, xr, y - 10.0, [Column("בדיקה", 62.0, TA.MIDDLE_RIGHT), Column("ערך", 46.0), Column("תוצאה", 22.0)],
                   crow, "בדיקות אוטומטיות", h_text=1.35)
        signature_box(ctx)
        return self.warnings


def default_notes(f: Foundation, t: DrillTemplate) -> list[str]:
    th = t.slab.thickness_mm
    d, sp = f.bar_dia_mm, f.spacing_mm / 10
    return [
        f"חומרים: בטון {f.concrete}; פלדת זיון מצולעת Ø{d}; יריעת פוליאתילן על הקרקע המהודקת לפני היציקה.",
        f"זיון: שתי רשתות Ø{d} כל {sp:g}/{sp:g} — עליונה ותחתונה; כיסוי {f.cover_mm / 10:g} ס\"מ לקרקע ולדפנות (שומרי מרחק).",
        f"שפת המשטח: הגבהה היקפית בעומק {f.edge_depth_mm / 10:g} ס\"מ ורוחב תחתון {f.edge_width_mm / 10:g} ס\"מ, שיפוע {f.edge_slope_deg:g}°; "
        f"מוטות U סוגרים ומוטות שפה מכופפים Ø{d}@{sp:g} בכל ההיקף — פרט 1.",
        f"ספסלים Ø{d} כל {f.chair_spacing_mm / 10:g}/{f.chair_spacing_mm / 10:g} בין הרשתות; בשיפוע קרקע — גובה הספסלים והמוטות הסוגרים גדל בהתאם.",
        f"תפרים: עומק {f.joint_depth_mm / 10:g} ס\"מ עם רצועת קלקר {f.joint_eps_mm / 10:g} ס\"מ, מרווח ≤{f.joint_max_spacing_mm / 1000:g} מ'; "
        "ממוקמים במרכז הארונות, בין הקורות — הרחק מהעוגנים. הרשתות רציפות דרך התפר — פרט 2.",
        f"עובי המשטח {th / 10:g} ס\"מ. קרקע משופעת: העובי גדל לכיוון הנמוך, הרשת התחתונה נשארת {f.cover_mm / 10:g} ס\"מ מהקרקע.",
        "הכנת קרקע: הידוק ≥98% לפני פריסת היריעה (מדריך יצרן §5.5.2).",
        f"עיגון הארונות: עוגנים כימיים לפי שבלונת הקידוח {t.sheet_no}; לפני קידוח לאתר את מוטות הזיון בסורק — אין לחתוך מוטות.",
        "** — ברירת מחדל לפי כלל; לבדיקת מהנדס הקונסטרוקציה ולאישורו. התכנון והחתימה באחריותו.",
    ]


def draw_foundation(ctx: SheetContext, design: Design, f: Foundation, which: str) -> list[str]:
    r = FoundationRenderer(ctx, design, f)
    return r.draw_plan() if which == "plan" else r.draw_details()
