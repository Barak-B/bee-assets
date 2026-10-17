"""Panel front view (מבנה לוח — חזית, דלת פתוחה) from the same board model as the single-line.

Devices are placed on DIN rails left → right in the order of the single-line: incomer,
then each group's RCD followed by its circuits, then the feeders. Modular widths follow
DIN 43880 (one module = 18 mm). Everything is drawn in real millimetres and scaled to the
sheet, with real DIMENSION entities so the drawing stays editable in AutoCAD.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from ezdxf.enums import TextEntityAlignment as TA

from .layers import LAYERS
from .model import Board, Design, Device, Enclosure
from .sheet import SheetContext, TB_H, TB_W

MODULE = 18.0
DEVICE_H = 45.0           # face height of a modular device (DIN 43880)
RAIL_H = 35.0

# modular widths in modules (18 mm) by kind and poles
MODULAR_WIDTH = {
    ("mcb", 1): 1, ("mcb", 2): 2, ("mcb", 3): 3, ("mcb", 4): 4,
    ("rcbo", 1): 2, ("rcbo", 2): 2, ("rcbo", 3): 4, ("rcbo", 4): 4,
    ("rcd", 2): 2, ("rcd", 4): 4,
    ("switch", 1): 1, ("switch", 2): 2, ("switch", 3): 3, ("switch", 4): 4,
    ("fuse", 1): 1, ("fuse", 2): 2, ("fuse", 3): 3, ("fuse", 4): 4,
    ("spd", 1): 1, ("spd", 2): 2, ("spd", 3): 3, ("spd", 4): 4,
    ("contactor", 2): 2, ("contactor", 4): 3,
    ("meter", 1): 4, ("meter", 3): 4, ("meter", 4): 4,
    ("terminal", 1): 1,
}


def device_width_mm(d: Device) -> float:
    if d.width_mm:
        return d.width_mm
    if d.kind == "mccb":
        # frame-size approximations (ABB XT1/XT2 class ≤160 A, XT4 ≤250 A, larger above)
        r = d.rating_a or 100
        if r <= 160:
            return 76.0 if d.poles <= 3 else 102.0
        if r <= 250:
            return 105.0 if d.poles <= 3 else 140.0
        return 140.0 if d.poles <= 3 else 184.0
    if d.kind == "acb":
        return 300.0 if d.poles <= 3 else 400.0
    key = (d.kind, max(1, min(d.poles, 4)))
    return MODULAR_WIDTH.get(key, max(1, d.poles)) * MODULE


def device_height_mm(d: Device) -> float:
    if d.kind == "mccb":
        return 130.0 if (d.rating_a or 0) <= 160 else 165.0
    if d.kind == "acb":
        return 300.0
    return DEVICE_H


@dataclass
class PlacedDevice:
    tag: str
    device: Device
    row: int
    x_mm: float          # left edge from the enclosure's inner left
    w_mm: float
    h_mm: float
    role: str            # incomer / group / circuit / feeder / spd


@dataclass
class PanelLayout:
    enclosure: Enclosure
    placed: list[PlacedDevice] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    spare_modules: float = 0.0

    def row_usage(self) -> dict[int, float]:
        use: dict[int, float] = {}
        for p in self.placed:
            use[p.row] = max(use.get(p.row, 0.0), p.x_mm + p.w_mm)
        return use


def plan_panel(b: Board) -> PanelLayout:
    """Fill the DIN rails in single-line order."""
    e = b.enclosure or Enclosure()
    lay = PanelLayout(enclosure=e)
    row_w = e.modules_per_row * MODULE
    row, x = 0, 0.0
    gap_after_group = MODULE  # one empty module between groups keeps the labels readable

    def place(d: Device, role: str) -> None:
        nonlocal row, x
        w = device_width_mm(d)
        if x + w > row_w + 1e-6:
            row += 1
            x = 0.0
        if row >= e.rows:
            lay.warnings.append(f"{d.tag}: אין מקום בארון — נדרשת שורה {row + 1} (יש {e.rows})")
        lay.placed.append(PlacedDevice(d.tag, d, row, x, w, device_height_mm(d), role))
        x += w

    if b.incomer:
        place(b.incomer, "incomer")
    if b.ct:
        x += MODULE
    if b.spd:
        place(b.spd, "spd")
    for g in b.groups:
        if x > 0:
            x += gap_after_group
        if g.device:
            place(g.device, "group")
        for c in g.circuits:
            place(c.device, "circuit")
    if b.feeders:
        x += gap_after_group
    for f in b.feeders:
        place(f.device, "feeder")
    used = lay.row_usage()
    lay.spare_modules = sum((row_w - used.get(r, 0.0)) for r in range(e.rows)) / MODULE
    return lay


class PanelRenderer:
    def __init__(self, ctx: SheetContext, design: Design, board: Board):
        self.ctx = ctx
        self.design = design
        self.board = board
        self.layout = plan_panel(board)
        e = self.layout.enclosure
        # pick a scale so the front view fits in ~165 mm of sheet height
        total_h = e.height_mm + e.plinth_mm
        self.scale = 5.0 if total_h <= 850 else (10.0 if total_h <= 1700 else 20.0)

    def s(self, v: float) -> float:
        return v / self.scale

    def dimstyle(self) -> str:
        doc = self.ctx.doc
        name = f"BEE-1-{int(self.scale)}"
        if name not in doc.dimstyles:
            ds = doc.dimstyles.new(name)
            ds.dxf.dimtxt = 2.0
            ds.dxf.dimasz = 1.5
            ds.dxf.dimexe = 1.0
            ds.dxf.dimexo = 0.8
            ds.dxf.dimgap = 0.6
            ds.dxf.dimlfac = self.scale       # measured sheet mm × scale = real mm
            ds.dxf.dimdec = 0
            ds.dxf.dimtad = 1
            ds.dxf.dimtxsty = "BEE-LAT"
            ds.dxf.dimblk = "ARCHTICK"
        return name

    def dim_h(self, x0: float, x1: float, y: float, offset: float) -> None:
        d = self.ctx.msp.add_linear_dim(base=(x0, y + offset), p1=(x0, y), p2=(x1, y), dimstyle=self.dimstyle(),
                                        dxfattribs={"layer": LAYERS["dim"].name})
        d.render()

    def dim_v(self, x: float, y0: float, y1: float, offset: float) -> None:
        d = self.ctx.msp.add_linear_dim(base=(x + offset, y0), p1=(x, y0), p2=(x, y1), angle=90, dimstyle=self.dimstyle(),
                                        dxfattribs={"layer": LAYERS["dim"].name})
        d.render()

    def draw_front(self, ox: float, oy: float) -> tuple[float, float]:
        """Door-open front view with origin (ox, oy) at the enclosure's bottom-left. Returns (w, h) on sheet."""
        ctx, e, s = self.ctx, self.layout.enclosure, self.s
        W, Hh = s(e.width_mm), s(e.height_mm)
        # plinth
        if e.plinth_mm:
            ctx.rect(ox, oy - s(e.plinth_mm), W, s(e.plinth_mm), "panel_encl")
            ctx.msp.add_hatch(color=9, dxfattribs={"layer": LAYERS["hatch"].name}).paths.add_polyline_path(
                [(ox, oy - s(e.plinth_mm)), (ox + W, oy - s(e.plinth_mm)), (ox + W, oy), (ox, oy)], is_closed=True)
        ctx.rect(ox, oy, W, Hh, "panel_encl")
        inset = s(25.0)
        ctx.rect(ox + inset, oy + inset, W - 2 * inset, Hh - 2 * inset, "panel_rail")
        # gland plate top and bottom
        if e.bottom_gland_plate:
            for yy in (oy + s(4.0), oy + Hh - s(14.0)):
                ctx.rect(ox + s(40.0), yy, W - s(80.0), s(10.0), "panel_rail")
        ctx.text("כניסות כבלים", (ox + W - s(42.0), oy + Hh - s(9.0)), 1.4, "panel_text", TA.MIDDLE_RIGHT)
        # rows: rails from the top
        top_margin = s(80.0)
        for r in range(e.rows):
            y_rail = oy + Hh - top_margin - r * s(e.row_pitch_mm)
            x_rail0, x_rail1 = ox + inset + s(10.0), ox + W - inset - s(10.0)
            ctx.msp.add_lwpolyline([(x_rail0, y_rail - s(RAIL_H) / 2), (x_rail1, y_rail - s(RAIL_H) / 2)],
                                   dxfattribs={"layer": LAYERS["panel_rail"].name})
            ctx.msp.add_lwpolyline([(x_rail0, y_rail + s(RAIL_H) / 2), (x_rail1, y_rail + s(RAIL_H) / 2)],
                                   dxfattribs={"layer": LAYERS["panel_rail"].name})
            ctx.text(f"שורה {r + 1}", (ox - 1.5, y_rail), 1.5, "panel_text", TA.MIDDLE_RIGHT)
        # devices
        x_dev0 = ox + inset + s(10.0)
        for p in self.layout.placed:
            if p.row >= e.rows:
                continue
            y_rail = oy + Hh - top_margin - p.row * s(e.row_pitch_mm)
            x = x_dev0 + s(p.x_mm)
            w, h = s(p.w_mm), s(p.h_mm)
            y0 = y_rail - h / 2
            ctx.rect(x, y0, w, h, "panel_dev")
            # toggle / face mark
            if p.device.kind in ("mccb", "acb"):
                ctx.rect(x + w * 0.3, y0 + h * 0.35, w * 0.4, h * 0.3, "panel_dev")
            else:
                n = max(1, int(round(p.w_mm / MODULE)))
                for i in range(n):
                    tx = x + (i + 0.5) * w / n
                    ctx.rect(tx - s(4.0), y0 + h * 0.4, s(8.0), h * 0.22, "panel_dev")
            lines = p.device.label_lines()
            if w < 8.0:   # narrow modular devices: rotated tag above, rotated rating below
                ctx.text(p.tag, (x + w / 2 + 0.7, y0 + h + 1.0), 1.4, "panel_text", TA.LEFT, rotation=90, bold=True)
                if lines:
                    ctx.text(lines[0], (x + w / 2 + 0.6, y0 - 1.0), 1.2, "panel_text", TA.RIGHT, rotation=90)
            else:
                ctx.text(p.tag, (x + w / 2, y0 + h + 1.2), 1.8, "panel_text", TA.BOTTOM_CENTER, bold=True)
                if lines:
                    ctx.text(lines[0], (x + w / 2, y0 - 1.2), 1.2, "panel_text", TA.TOP_CENTER)
        # N bars per RCD group + PE bar at the bottom
        y_bars = oy + inset + s(30.0)
        groups = [g for g in self.board.groups if g.device]
        bx = ox + inset + s(10.0)
        bw = s(90.0)
        for g in groups:
            ctx.msp.add_lwpolyline([(bx, y_bars), (bx + bw, y_bars)], dxfattribs={"layer": LAYERS["n"].name, "const_width": 0.6})
            for i in range(6):
                ctx.msp.add_circle((bx + (i + 0.5) * bw / 6, y_bars), 0.5, dxfattribs={"layer": LAYERS["n"].name})
            ctx.text(f"פס N — {g.device.tag}", (bx, y_bars + 1.2), 1.3, "panel_text", TA.BOTTOM_LEFT)
            bx += bw + s(15.0)
        pe_y = y_bars - s(14.0)
        pe_w = W - 2 * inset - s(20.0)
        ctx.msp.add_lwpolyline([(ox + inset + s(10.0), pe_y), (ox + inset + s(10.0) + pe_w, pe_y)],
                               dxfattribs={"layer": LAYERS["pe"].name, "const_width": 0.7})
        for i in range(12):
            ctx.msp.add_circle((ox + inset + s(10.0) + (i + 0.5) * pe_w / 12, pe_y), 0.5, dxfattribs={"layer": LAYERS["pe"].name})
        ctx.text("פס PE", (ox + inset + s(10.0), pe_y - 1.2), 1.3, "panel_text", TA.TOP_LEFT)
        # spare note
        if self.layout.spare_modules > 0:
            ctx.text(f"שמור: {self.layout.spare_modules:.0f} מודולים", (ox + W - inset - s(10.0), y_bars + 1.2), 1.4, "panel_text", TA.BOTTOM_RIGHT)
        # dimensions
        self.dim_h(ox, ox + W, oy + Hh, 6.0)
        self.dim_v(ox + W, oy - s(e.plinth_mm), oy + Hh, 8.0)
        for r in range(1, e.rows):
            pass
        return W, Hh

    def draw_side(self, ox: float, oy: float) -> float:
        ctx, e, s = self.ctx, self.layout.enclosure, self.s
        D, Hh = s(e.depth_mm), s(e.height_mm)
        ctx.rect(ox, oy, D, Hh, "panel_encl")
        if e.plinth_mm:
            ctx.rect(ox, oy - s(e.plinth_mm), D, s(e.plinth_mm), "panel_encl")
        if e.mounting != "floor":
            # wall hatch behind the box
            ctx.msp.add_lwpolyline([(ox - 2.0, oy - 6.0), (ox - 2.0, oy + Hh + 6.0)], dxfattribs={"layer": LAYERS["panel_encl"].name})
            for yy in range(0, int(Hh + 12), 3):
                ctx.line((ox - 2.0, oy - 6.0 + yy), (ox - 5.0, oy - 6.0 + yy - 3.0), "hatch")
        self.dim_h(ox, ox + D, oy + Hh, 6.0)
        ctx.text("חתך צד", (ox + D / 2, oy - 5.0 - s(e.plinth_mm)), 2.2, "panel_text", TA.TOP_CENTER, bold=True)
        return D

    def draw_tables(self, x_right: float, y_top: float) -> None:
        ctx, e = self.ctx, self.layout.enclosure
        rows = [
            ("יצרן", e.manufacturer or "—"), ("דגם", e.model), ("התקנה", {"flush": "שקוע", "surface": "על הטיח", "floor": "עומד על הרצפה"}[e.mounting]),
            ("דרגת אטימות", e.ip), ("מידות רוחב×גובה×עומק", f"{e.width_mm:g}×{e.height_mm:g}×{e.depth_mm:g}"),
            ("שורות / מודולים", f"{e.rows} × {e.modules_per_row}"),
            ("מתח", self.board.supply.voltage), ("שיטת הארקה", self.board.supply.earthing or "—"),
            ("מפסק ראשי", f"{self.board.incomer.tag} {self.board.incomer.poles}P {self.board.incomer.rating_a:g}A" if self.board.incomer and self.board.incomer.rating_a else "—"),
            ("פס צבירה", f"{self.board.busbar.rating_a:g}A" if self.board.busbar.rating_a else "—"),
        ]
        rh, w = 5.0, 80.0
        x0 = x_right - w
        h = rh * (len(rows) + 1)
        ctx.rect(x0, y_top - h, w, h, "legend")
        ctx.text("נתוני הלוח", (x_right - 1.5, y_top - 1.0), 2.4, "legend", TA.TOP_RIGHT, bold=True)
        ctx.line((x0 + 36.0, y_top - h), (x0 + 36.0, y_top - rh), "legend")
        for i, (k, v) in enumerate(rows):
            yy = y_top - rh * (i + 1)
            ctx.line((x0, yy), (x_right, yy), "legend")
            ctx.text(k, (x_right - 1.5, yy - rh / 2), 1.7, "legend", TA.MIDDLE_RIGHT)
            ctx.text(v, (x0 + 34.0, yy - rh / 2), 1.7, "legend", TA.MIDDLE_RIGHT)
        # device schedule — split into two side-by-side tables when long
        y = y_top - h - 8.0
        cols = [("תג", 13.0), ("ציוד", 20.0), ("דירוג", 24.0), ("שורה", 9.0), ("X [mm]", 13.0)]
        tw = sum(c[1] for c in cols)
        rh2 = 4.2
        max_rows = int((y - (ctx.y0 + TB_H + 12.0)) / rh2) - 2
        items = self.layout.placed
        chunks = [items] if len(items) <= max_rows else [items[:(len(items) + 1) // 2], items[(len(items) + 1) // 2:]]
        kinds = {"mcb": "מא\"ז", "mccb": "מפסק יצוק", "acb": "מפסק אוויר", "rcd": "פחת", "rcbo": "מא\"ז+פחת", "switch": "מנתק",
                 "fuse": "נתיך", "spd": "מגן ברקים", "meter": "מונה", "ct": "משנה זרם", "contactor": "מגען", "terminal": "מהדק"}
        ctx.text("טבלת ציוד — X מקצה שמאל של שורת המסילה", (x_right - 1.5, y - 1.0), 2.2, "legend", TA.TOP_RIGHT, bold=True)
        xr = x_right
        for chunk in chunks:
            n = len(chunk)
            th = rh2 * (n + 2)
            ctx.rect(xr - tw, y - th, tw, th, "legend")
            xx = xr
            for name, cw in cols:
                ctx.text(name, (xx - cw / 2, y - rh2 * 1.5), 1.5, "legend", TA.MIDDLE_CENTER, bold=True)
                xx -= cw
                ctx.line((xx, y - th), (xx, y - rh2), "legend")
            for i, p in enumerate(chunk):
                yy = y - rh2 * (i + 2.5)
                ctx.line((xr - tw, yy + rh2 / 2), (xr, yy + rh2 / 2), "legend")
                vals = [p.tag, kinds.get(p.device.kind, p.device.kind), " ".join(p.device.label_lines()[:2]), str(p.row + 1), f"{p.x_mm:.0f}"]
                xx = xr
                for (name, cw), v in zip(cols, vals):
                    ctx.text(v, (xx - cw / 2, yy), 1.4, "legend", TA.MIDDLE_CENTER)
                    xx -= cw
            xr -= tw + 4.0

    def draw(self) -> list[str]:
        ctx = self.ctx
        e = self.layout.enclosure
        ox, oy = ctx.x0 + 30.0, ctx.y0 + 36.0 + self.s(e.plinth_mm)
        W, Hh = self.draw_front(ox, oy)
        base = oy - self.s(e.plinth_mm)
        ctx.text(f"{self.board.title} — חזית, דלת פתוחה   1:{int(self.scale)}", (ox + W / 2, base - 5.0), 2.6, "panel_text", TA.TOP_CENTER, bold=True)
        D = self.draw_side(ox + W + 30.0, oy)
        self.draw_tables(ctx.x1 - 4.0, ctx.y1 - 14.0)
        notes = ["מידות במ\"מ, לפי קטלוג יצרן הארון — לאימות מול הדגם שיוזמן.",
                 "סדר הרכיבים על המסילות זהה לסדר בחד-קווי; מודול = 18 מ\"מ (DIN 43880).",
                 "יש לשלט כל מא\"ז ומפסק לפי התג בתוכנית."] + self.layout.warnings
        nx = ox + W + 30.0 + D
        ctx.text("הערות", (nx, base - 12.0), 2.4, "notes", TA.TOP_RIGHT, bold=True)
        ctx.mtext([f"{i + 1}. {t}" for i, t in enumerate(notes)], (nx, base - 16.0), 1.7, "notes", width=nx - ctx.x0 - 4.0)
        return self.layout.warnings


def draw_panel(ctx: SheetContext, design: Design, board: Board) -> list[str]:
    return PanelRenderer(ctx, design, board).draw()
