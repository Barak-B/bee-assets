"""Earthing sheet (תוכנית הארקות והשוואת פוטנציאלים).

Three parts, all from one ``Earthing`` model:

* **Bar schematic** — every earthing / equipotential bar drawn as a strip with its holes; each
  conductor drops from a hole with an arrow, its cross-section rotated beside it and the target
  below (reference: Roche G006 and the office E-07 bar schematic).
* **Ring plan** — when the design has a slab (``drill_template``), the foundation earth ring inside
  the slab, the rebar-mesh bonding points, the earth-electrode symbol and the bars' positions.
* **Checks table + electrode detail + notes** — the office table "בדיקות טבעת הארקת היסוד" with
  the limits from תקנות החשמל (הארקות יסוד): strip ≥ 100 mm², ≥ 3.5 mm thick, closed ring, test
  joint, rebar bonding ≤ 5 m, outlets ≥ 2, electrode depth.
"""
from __future__ import annotations

from typing import Literal, Optional

from ezdxf.enums import TextEntityAlignment as TA
from pydantic import BaseModel, Field

from .layers import LAYERS
from .model import Design
from .sheet import SheetContext, TB_H, TB_W

CondKind = Literal["pe", "bond", "electrode", "existing", "link"]


class EarthConductor(BaseModel):
    target: str                     # "הארקת גוף BESS ×4"
    size: str = "35 Cu"             # shown rotated
    kind: CondKind = "pe"
    qty: int = 1
    length_m: Optional[float] = None


class EarthBar(BaseModel):
    id: str
    label: str                      # "פס השוואה משנה — לוח איסוף אגירה"
    material: str = "Cu 4×40"
    holes: int = 12
    conductors: list[EarthConductor] = Field(default_factory=list)
    location: str = ""              # "בתוך לוח איסוף BESS"
    plan_xy_mm: Optional[tuple[float, float]] = None   # where it sits on the slab plan


class EarthLink(BaseModel):
    from_bar: str
    to_bar: str
    size: str = "1×70 Cu/PVC"
    length_m: Optional[float] = None


class Electrode(BaseModel):
    label: str = "אלקטרודת הארקה — מוט פלדה מצופה נחושת Ø19 מ\"מ, עומק 3 מ'"
    qty: int = 1
    depth_m: float = 3.0
    pit: bool = True                # inspection pit (שוחת הארקה)
    plan_xy_mm: Optional[tuple[float, float]] = None


class Ring(BaseModel):
    material: str = "Fe 50×4 מגולוון"
    section_mm2: float = 200
    thickness_mm: float = 4
    offset_mm: float = 150          # inset from the slab edge on the plan
    rebar_dia_mm: float = 10
    bond_every_m: float = 5.0       # max distance between rebar bonding points
    outlets: int = 2                # קוצי הארקה
    closed: bool = True
    note: str = "טבעת היקפית במשטח הבטון, מרותכת לברזלי הזיון ≥Ø10 מ\"מ (ת\"י / תקנות החשמל — הארקות יסוד)"


class Earthing(BaseModel):
    title: str = "תוכנית הארקות והשוואת פוטנציאלים"
    sheet_no: str = "E-06"
    system: str = "TN-C-S"
    bars: list[EarthBar] = Field(default_factory=list)
    links: list[EarthLink] = Field(default_factory=list)
    electrodes: list[Electrode] = Field(default_factory=list)
    ring: Optional[Ring] = Field(default_factory=Ring)
    notes: list[str] = Field(default_factory=list)
    verify: list[str] = Field(default_factory=list)


HOLE_PITCH = 7.0
BAR_H = 7.0


def ring_checks(e: Earthing, slab_len_mm: float | None, slab_w_mm: float | None) -> list[tuple[str, str, str, bool]]:
    """(item, limit, value, ok) rows for the checks table."""
    rows: list[tuple[str, str, str, bool]] = []
    r = e.ring
    if r is None:
        return rows
    rows.append(("חתך פלח הטבעת [מ\"מ²]", "≥ 100", f"{r.section_mm2:g}", r.section_mm2 >= 100))
    rows.append(("עובי הפלח [מ\"מ]", "≥ 3.5", f"{r.thickness_mm:g}", r.thickness_mm >= 3.5))
    rows.append(("טבעת סגורה", "כן", "כן" if r.closed else "לא", r.closed))
    if slab_len_mm and slab_w_mm:
        per = 2 * ((slab_len_mm - 2 * r.offset_mm) + (slab_w_mm - 2 * r.offset_mm)) / 1000.0
        rows.append(("היקף הטבעת [מ']", "-", f"{per:.1f}", True))
        n_bond = int(per // r.bond_every_m) + 1
        rows.append(("חיבורי זיון (כל ≤ %g מ')" % r.bond_every_m, f"≥ {n_bond}", f"{n_bond}", True))
    rows.append(("יציאות (קוצים) מהטבעת", "≥ 2", f"{r.outlets}", r.outlets >= 2))
    if e.electrodes:
        d = min(x.depth_m for x in e.electrodes)
        rows.append(("עומק אלקטרודה [מ']", "≥ 3", f"{d:g}", d >= 3))
    return rows


class EarthingRenderer:
    def __init__(self, ctx: SheetContext, design: Design, e: Earthing):
        self.ctx, self.design, self.e = ctx, design, e
        self.warnings: list[str] = []
        self.bar_pos: dict[str, tuple[float, float, float]] = {}   # id → (x0, x1, y_bottom)

    # ------------------------------------------------------------------ bar schematic
    def draw_bar(self, b: EarthBar, x_right: float, y_top: float) -> float:
        """Bar strip with holes; conductors hang below. Returns the x of the bar's left end."""
        ctx = self.ctx
        n = max(b.holes, len(b.conductors) + 2)
        w = n * HOLE_PITCH + 6.0
        x0 = x_right - w
        ctx.rect(x0, y_top - BAR_H, w, BAR_H, "pe")
        for i in range(n):
            cx = x0 + 3.0 + HOLE_PITCH * (i + 0.5)
            ctx.msp.add_circle((cx, y_top - BAR_H / 2), 1.1, dxfattribs={"layer": LAYERS["pe"].name})
        ctx.text(b.label, (x_right, y_top + 1.2), 2.4, "sld_tag", TA.BOTTOM_RIGHT, bold=True)
        ctx.text(b.material, (x0, y_top + 1.2), 2.0, "sld_text", TA.BOTTOM_LEFT)
        if b.location:
            ctx.text(b.location, (x_right, y_top + 4.6), 1.6, "sld_text", TA.BOTTOM_RIGHT)
        # conductors: right to left, one hole each (RTL reading order)
        yb = y_top - BAR_H
        for i, c in enumerate(b.conductors):
            cx = x0 + 3.0 + HOLE_PITCH * (n - 1.5 - i)
            layer = "existing" if c.kind == "existing" else "pe"
            y_end = yb - 22.0
            ctx.line((cx, yb), (cx, y_end), layer)
            ctx.msp.add_solid([(cx, y_end - 3.0), (cx - 1.1, y_end), (cx + 1.1, y_end)], dxfattribs={"layer": LAYERS[layer].name})
            # rotated texts sit right of the drop line (box centred 1.6 mm off the line)
            ctx.text(c.size, (cx + 1.6, y_end + 1.0), 1.5, "sld_text", TA.MIDDLE_LEFT, rotation=90)
            label = c.target + (f" ×{c.qty}" if c.qty > 1 else "")
            ctx.text(label, (cx + 1.6, y_end - 4.5), 1.6, "sld_text", TA.MIDDLE_RIGHT, rotation=90)
        self.bar_pos[b.id] = (x0, x_right, yb)
        return x0

    def draw_links(self) -> None:
        ctx = self.ctx
        for lk in self.e.links:
            a, b = self.bar_pos.get(lk.from_bar), self.bar_pos.get(lk.to_bar)
            if not a or not b:
                self.warnings.append(f"הארקות: קישור {lk.from_bar}→{lk.to_bar} — פס לא צויר")
                continue
            # from the left end of bar A to the right end of bar B, dipping below both
            xa, ya = a[0] + 4.0, a[2]
            xb, yb = b[1] - 4.0, b[2]
            y_dip = min(ya, yb) - 9.0
            ctx.msp.add_lwpolyline([(xa, ya), (xa, y_dip), (xb, y_dip), (xb, yb)], dxfattribs={"layer": LAYERS["pe"].name})
            ctx.text(lk.size + (f"  {lk.length_m:g} מ'" if lk.length_m else ""), ((xa + xb) / 2, y_dip - 1.2), 1.8, "sld_text", TA.TOP_CENTER)

    # ------------------------------------------------------------------ ring plan
    def draw_plan(self, ox: float, oy: float, scale: float) -> tuple[float, float]:
        ctx, e = self.ctx, self.e
        from .template import DrillTemplate

        t = DrillTemplate.model_validate(self.design.drill_template or {})
        s = lambda v: v / scale
        L, W = s(t.slab.length_mm), s(t.slab.width_mm)
        ctx.rect(ox, oy, L, W, "panel_encl")
        hatch = ctx.msp.add_hatch(color=9, dxfattribs={"layer": LAYERS["hatch"].name})
        hatch.set_pattern_fill("ANSI37", scale=4.0)
        hatch.paths.add_polyline_path([(ox, oy), (ox + L, oy), (ox + L, oy + W), (ox, oy + W)], is_closed=True)
        for u in t.units:
            ctx.rect(ox + s(u.x_mm), oy + s(u.y_mm), s(u.width_mm), s(u.depth_mm), "existing")
            ctx.text(u.tag, (ox + s(u.x_mm + u.width_mm / 2), oy + s(u.y_mm + u.depth_mm / 2)), 1.8, "panel_text", TA.MIDDLE_CENTER,
                     rotation=90.0 if s(u.width_mm) < 12 else 0.0)
        if e.ring:
            o = s(e.ring.offset_mm)
            ring = [(ox + o, oy + o), (ox + L - o, oy + o), (ox + L - o, oy + W - o), (ox + o, oy + W - o)]
            ctx.msp.add_lwpolyline(ring, close=True, dxfattribs={"layer": LAYERS["pe"].name, "const_width": 0.6})
            # rebar bonding points every bond_every_m along the ring
            per = 2 * ((L - 2 * o) + (W - 2 * o))
            step = s(e.ring.bond_every_m * 1000)
            d = 0.0
            segs = list(zip(ring, ring[1:] + ring[:1]))
            while d < per:
                rem = d
                for (xa, ya), (xb, yb) in segs:
                    seg = abs(xb - xa) + abs(yb - ya)
                    if rem <= seg:
                        f = rem / seg if seg else 0
                        px, py = xa + (xb - xa) * f, ya + (yb - ya) * f
                        ctx.msp.add_circle((px, py), 0.9, dxfattribs={"layer": LAYERS["pe"].name})
                        break
                    rem -= seg
                d += step
            # outlets at the front corners
            for k in range(e.ring.outlets):
                px = ox + o + (L - 2 * o) * (k / max(1, e.ring.outlets - 1))
                ctx.line((px, oy + o), (px, oy - 4.0), "pe")
                ctx.msp.add_circle((px, oy - 4.0), 0.9, dxfattribs={"layer": LAYERS["pe"].name})
            ctx.text(f"טבעת הארקת יסוד {e.ring.material}", (ox + L / 2, oy - 7.5), 1.8, "sld_text", TA.TOP_CENTER)
            ctx.text(f"קוצי הארקה ×{e.ring.outlets}", (ox + o, oy - 5.0), 1.4, "sld_text", TA.TOP_LEFT)
        for b in e.bars:
            if b.plan_xy_mm:
                bx, by = ox + s(b.plan_xy_mm[0]), oy + s(b.plan_xy_mm[1])
                ctx.rect(bx - 1.5, by - 4.0, 3.0, 8.0, "pe")
                ctx.text(b.id, (bx - 2.5, by), 1.6, "sld_text", TA.MIDDLE_RIGHT, bold=True)
        for el in e.electrodes:
            if el.plan_xy_mm:
                ex, ey = ox + s(el.plan_xy_mm[0]), oy + s(el.plan_xy_mm[1])
                ctx.msp.add_circle((ex, ey), 2.0, dxfattribs={"layer": LAYERS["pe"].name})
                ctx.insert("BEE_EARTH", (ex, ey - 2.0), layer="pe", scale=0.7)
                ctx.text("אלקטרודה", (ex, ey - 4.5), 1.6, "sld_text", TA.TOP_CENTER)
        ctx.text(f"תשתית הארקה במשטח הבטון — מבט על   1:{int(scale)}", (ox + L / 2, oy + W + 3.0), 2.4, "panel_text", TA.BOTTOM_CENTER, bold=True)
        return L, W

    def draw_electrode_detail(self, ox: float, oy: float) -> None:
        """Electrode in an inspection pit, ground level, clamp, bare conductor — schematic, not to scale."""
        ctx, e = self.ctx, self.e
        if not e.electrodes:
            return
        el = e.electrodes[0]
        ctx.line((ox, oy), (ox + 46.0, oy), "existing")
        ctx.text("Ground Level", (ox + 1.0, oy + 0.8), 1.5, "dim", TA.BOTTOM_LEFT)
        # pit
        ctx.msp.add_lwpolyline([(ox + 14.0, oy), (ox + 16.0, oy - 10.0), (ox + 30.0, oy - 10.0), (ox + 32.0, oy)], dxfattribs={"layer": LAYERS["panel_encl"].name})
        ctx.line((ox + 14.0, oy), (ox + 32.0, oy), "panel_encl")
        # rod
        ctx.msp.add_lwpolyline([(ox + 23.0, oy - 2.0), (ox + 23.0, oy - 34.0), (ox + 22.0, oy - 34.0), (ox + 23.0, oy - 37.0), (ox + 24.0, oy - 34.0), (ox + 23.0, oy - 34.0)],
                               dxfattribs={"layer": LAYERS["pe"].name, "const_width": 0.8})
        # clamp + bare conductor to the bar
        ctx.rect(ox + 21.5, oy - 4.5, 3.0, 2.0, "pe")
        ctx.msp.add_lwpolyline([(ox + 21.5, oy - 3.5), (ox + 10.0, oy - 3.5), (ox + 6.0, oy - 6.0), (ox + 2.0, oy - 6.0)], dxfattribs={"layer": LAYERS["pe"].name})
        ctx.text("מהדק טבעת תקני", (ox + 34.0, oy - 3.0), 1.4, "sld_text", TA.MIDDLE_LEFT)
        ctx.text("גיד הארקה חשוף", (ox + 1.0, oy - 12.0), 1.4, "sld_text", TA.TOP_LEFT)
        ctx.text("לכיוון פה\"פ", (ox + 1.0, oy - 14.5), 1.4, "sld_text", TA.TOP_LEFT)
        ctx.text("שוחת הארקה", (ox + 34.0, oy - 8.5), 1.4, "sld_text", TA.MIDDLE_LEFT)
        ctx.text(f"{el.depth_m:g} m", (ox + 26.5, oy - 22.0), 1.5, "dim", TA.MIDDLE_LEFT)
        ctx.msp.add_line((ox + 25.5, oy - 2.0), (ox + 25.5, oy - 37.0), dxfattribs={"layer": LAYERS["dim"].name})
        words, lines, cur = el.label.split(), [], ""
        for w in words:
            if cur and len(cur) + 1 + len(w) > 34:
                lines.append(cur)
                cur = w
            else:
                cur = f"{cur} {w}".strip()
        lines.append(cur)
        for i, line in enumerate(lines):
            ctx.text(line, (ox + 23.0, oy - 41.0 - 2.4 * i), 1.5, "sld_text", TA.TOP_CENTER)
        ctx.text("פרט אלקטרודת הארקה (סכמטי)", (ox + 23.0, oy + 5.0), 2.2, "panel_text", TA.BOTTOM_CENTER, bold=True)

    def draw_checks(self, x_right: float, y_top: float, rows: list[tuple[str, str, str, bool]]) -> float:
        ctx = self.ctx
        if not rows:
            return y_top
        cols = [("סעיף", 60.0), ("גבול", 20.0), ("ערך", 20.0), ("תקין", 12.0)]
        tw, rh = sum(c[1] for c in cols), 4.5
        h = rh * (len(rows) + 1)
        ctx.text("בדיקות טבעת הארקת היסוד", (x_right, y_top + 1.2), 2.2, "legend", TA.BOTTOM_RIGHT, bold=True)
        ctx.rect(x_right - tw, y_top - h, tw, h, "legend")
        xx = x_right
        for name, cw in cols:
            ctx.text(name, (xx - cw / 2, y_top - rh / 2), 1.6, "legend", TA.MIDDLE_CENTER, bold=True)
            xx -= cw
            if xx > x_right - tw + 0.5:
                ctx.line((xx, y_top - h), (xx, y_top), "legend")
        for i, (item, lim, val, ok) in enumerate(rows):
            yy = y_top - rh * (i + 1.5)
            ctx.line((x_right - tw, yy + rh / 2), (x_right, yy + rh / 2), "legend")
            cx = x_right
            for (name, cw), v in zip(cols, (item, lim, val, "✓" if ok else "✗")):
                ctx.text(v, (cx - cw / 2, yy), 1.5, "legend", TA.MIDDLE_CENTER)
                cx -= cw
        return y_top - h

    def draw(self) -> list[str]:
        ctx, e = self.ctx, self.e
        if not e.bars:
            self.warnings.append("הארקות: אין פסי הארקה במודל")
            return self.warnings
        # bars across the top, right to left
        x = ctx.x1 - 6.0
        y_top = ctx.y1 - 14.0
        for b in e.bars:
            x0 = self.draw_bar(b, x, y_top)
            x = x0 - 26.0
            if x < ctx.x0 + 10.0:
                self.warnings.append("הארקות: פסי ההארקה לא נכנסים בשורה אחת")
        self.draw_links()
        # plan at the bottom-left when there is a slab
        y_mid = y_top - BAR_H - 22.0 - 30.0 - 14.0
        slab = self.design.drill_template
        rows: list[tuple[str, str, str, bool]] = []
        if slab:
            from .template import DrillTemplate

            t = DrillTemplate.model_validate(slab)
            scale = 50.0 if t.slab.length_mm <= 6000 else (100.0 if t.slab.length_mm <= 12000 else 200.0)
            L, W = t.slab.length_mm / scale, t.slab.width_mm / scale
            px, py = ctx.x0 + 16.0, ctx.y0 + TB_H + 12.0 + 10.0
            if py + W + 8.0 > y_mid:
                scale *= 2
                L, W = L / 2, W / 2
            self.draw_plan(px, py, scale)
            self.draw_electrode_detail(px + L + 24.0, py + W - 2.0)
            rows = ring_checks(e, t.slab.length_mm, t.slab.width_mm)
        else:
            rows = ring_checks(e, None, None)
        # right column: checks table, then notes, down to the revision table
        xr = ctx.x1 - 6.0
        y_after = self.draw_checks(xr, y_mid, rows)
        notes = list(e.notes) + [f"לאימות: {v}" for v in e.verify]
        ny = y_after - 8.0
        ctx.text("הערות", (xr, ny), 2.4, "notes", TA.TOP_RIGHT, bold=True)
        ctx.mtext([f"{i + 1}. {n}" for i, n in enumerate(notes)], (xr, ny - 4.0), 1.6, "notes", width=150.0)
        return self.warnings


def draw_earthing(ctx: SheetContext, design: Design, e: Earthing) -> list[str]:
    return EarthingRenderer(ctx, design, e).draw()
