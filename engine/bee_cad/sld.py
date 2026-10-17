"""Single-line diagram (חד-קווי) of LV boards — E-xx sheet.

Deterministic column layout, in the office's arrangement (see the house set E-05):
supply cabinet top-left → incomer → busbar → RCD groups with their final circuits hanging
below → feeders to nodes (inverter, battery, generator) and to sub-boards on the right →
PE / N bars at the bottom → legend bottom-left, notes and load summary bottom-right.
"""
from __future__ import annotations

from dataclasses import dataclass

from ezdxf.enums import TextEntityAlignment as TA

from .layers import LAYERS
from .model import Board, Circuit, Design, Device, Node
from .sheet import SheetContext, TB_H, TB_W
from .symbols import H as SYM_H
from .symbols import device_block_name

PITCH = 9.0             # x pitch between final circuits
GROUP_GAP = 7.0         # gap between groups
BOARD_GAP = 28.0        # gap between boards
SUB_DROP = 24.0         # busbar → sub-bus (RCD) drop
CIRC_LEN = 26.0         # sub-bus → arrow length of a final circuit
NODE_W, NODE_H = 52.0, 18.0


@dataclass
class Placed:
    x: float
    y: float


class SldRenderer:
    def __init__(self, ctx: SheetContext, design: Design):
        self.ctx = ctx
        self.design = design
        self.board_x: dict[str, float] = {}           # incomer x per board
        self.board_bus: dict[str, tuple[float, float, float]] = {}  # (x_start, x_end, y_bus)
        self.feeder_pts: dict[tuple[str, str], Placed] = {}          # (board, circuit tag) → bottom of device
        self.node_pts: dict[str, Placed] = {}          # node id → left mid point
        self.warnings: list[str] = []

    # ------------------------------------------------------------------ helpers
    def device_labels(self, d: Device, x: float, y_top: float, side: str = "right", h: float = 1.6) -> None:
        """Tag (bold) + rating lines beside a vertical device whose top terminal is at y_top."""
        ctx = self.ctx
        sx = x + 2.2 if side == "right" else x - 2.2
        align = TA.TOP_LEFT if side == "right" else TA.TOP_RIGHT
        ctx.text(d.tag, (sx, y_top - 1.0), 2.2, "sld_tag", align, bold=True)
        yy = y_top - 4.0
        for line in d.label_lines():
            ctx.text(line, (sx, yy), h, "sld_text", align)
            yy -= h + 0.7
        if d.lock:
            ctx.insert("BEE_LOCK", (x - 5.5, y_top - SYM_H + 2.0))

    def vdevice(self, d: Device, x: float, y_top: float, side: str = "right") -> float:
        """Insert a device whose upper terminal is at (x, y_top). Returns the y of the lower terminal."""
        self.ctx.insert(device_block_name(d.kind, d.poles), (x, y_top - SYM_H))
        self.device_labels(d, x, y_top, side)
        return y_top - SYM_H

    # ------------------------------------------------------------------ widths
    @staticmethod
    def group_width(circuits: list[Circuit]) -> float:
        return max(1, len(circuits)) * PITCH

    def board_width(self, b: Board) -> float:
        w = 0.0
        for g in b.groups:
            w += self.group_width(g.circuits) + GROUP_GAP
        w += len(b.feeders) * (PITCH + 4.0)
        if b.spd:
            w += 14.0
        return max(w + 14.0, 60.0)

    # ------------------------------------------------------------------ drawing
    def draw_supply(self, b: Board, x: float, y_top: float) -> float:
        """Supply cabinet (utility meter) frame. Returns y of the line leaving it downward."""
        ctx = self.ctx
        s = b.supply
        if s.kind == "utility":
            fw, fh = 44.0, 24.0
            fx = x - 10.0
            fy = y_top - fh
            ctx.msp.add_lwpolyline([(fx, fy), (fx + fw, fy), (fx + fw, fy + fh), (fx, fy + fh)], close=True,
                                   dxfattribs={"layer": LAYERS["sld_board"].name})
            ctx.text("ארון מונה חח\"י", (fx + fw - 1.5, fy + fh - 1.5), 2.4, "sld_text", TA.TOP_RIGHT, bold=True)
            ctx.text("באחריות חח\"י", (fx + fw - 1.5, fy + fh - 5.0), 1.6, "sld_text", TA.TOP_RIGHT)
            ctx.line((x, fy + fh), (x, fy + fh - 3.0))
            ctx.insert("BEE_METER_KWH", (x, fy + fh - 3.0 - SYM_H))
            ym = fy + fh - 3.0 - SYM_H
            ctx.text("מונה חח\"י", (x + 5.0, ym + 7.0), 1.8, "sld_text", TA.MIDDLE_LEFT)
            if s.meter:
                ctx.text(s.meter, (x + 5.0, ym + 4.0), 2.0, "sld_text", TA.MIDDLE_LEFT, bold=True)
            ctx.text(f"{s.voltage} {s.frequency}", (x + 5.0, ym + 1.0), 1.6, "sld_text", TA.MIDDLE_LEFT)
            ctx.line((x, ym), (x, fy))
            return fy
        # fed from another board / node: a stub with the label beside it
        ctx.text(s.label, (x + 2.0, y_top - 1.0), 1.8, "sld_text", TA.TOP_LEFT)
        return y_top - 4.0

    def draw_board(self, b: Board, x_in: float, y_top: float, is_main: bool) -> tuple[float, float]:
        """Draw one board. x_in = x of the incomer line. Returns (x_right, y_bottom)."""
        ctx = self.ctx
        y = self.draw_supply(b, x_in, y_top)
        # feeder cable label
        if b.supply.cable:
            c = b.supply.cable
            ctx.text(c.designation, (x_in - 2.0, y - 4.0), 2.0, "sld_text", TA.MIDDLE_RIGHT, bold=True)
            extra = []
            if c.length_m:
                extra.append(f"{c.length_m:g}m")
            if c.du_pct is not None:
                extra.append(f"ΔU={c.du_pct:g}%")
            if extra:
                ctx.text("  ".join(extra), (x_in - 2.0, y - 7.0), 1.6, "sld_text", TA.MIDDLE_RIGHT)
        y_board_top = y - 12.0
        ctx.line((x_in, y), (x_in, y_board_top))
        if b.supply.earthing and is_main:
            ctx.text(f"PEN  איפוס {b.supply.earthing}", (x_in + 2.0, y_board_top + 2.0), 1.6, "sld_text", TA.BOTTOM_LEFT)

        # board frame (dash-dot) — closed after we know the extent
        x_left = x_in - 14.0
        width = self.board_width(b)
        y_in = y_board_top - 6.0
        ctx.line((x_in, y_board_top), (x_in, y_in))
        y_cur = y_in
        if b.incomer:
            y_cur = self.vdevice(b.incomer, x_in, y_cur, side="right")
            ctx.text("מאופס" if b.supply.earthing == "TN-C-S" and is_main else "", (x_in - 3.0, y_cur + 6.0), 1.6, "sld_text", TA.MIDDLE_RIGHT)
        if b.ct:
            ctx.line((x_in, y_cur), (x_in, y_cur - 3.0))
            ctx.insert("BEE_CT", (x_in, y_cur - 3.0 - SYM_H))
            ctx.text(b.ct, (x_in - 3.0, y_cur - 8.0), 1.6, "sld_text", TA.MIDDLE_RIGHT)
            y_cur = y_cur - 3.0 - SYM_H
        y_bus = y_cur - 8.0
        ctx.line((x_in, y_cur), (x_in, y_bus))
        # busbar
        x_bus0 = x_in - 4.0
        x_bus1 = x_in + width - 10.0
        ctx.msp.add_lwpolyline([(x_bus0, y_bus), (x_bus1, y_bus)], dxfattribs={"layer": LAYERS["sld_bus"].name, "const_width": 1.2})
        bl = b.busbar.label + (f"  {b.busbar.rating_a:g}A" if b.busbar.rating_a else "") + (f"  Icw {b.busbar.icw_ka:g}kA" if b.busbar.icw_ka else "")
        ctx.text(bl, (x_bus0, y_bus + 1.6), 1.8, "sld_text", TA.BOTTOM_LEFT)
        ctx.text(b.busbar.note, (x_bus1, y_bus + 1.6), 1.6, "sld_text", TA.BOTTOM_RIGHT)
        self.board_x[b.id] = x_in
        self.board_bus[b.id] = (x_bus0, x_bus1, y_bus)
        # SPD on the busbar
        x = x_in + 10.0
        if b.spd:
            ctx.line((x, y_bus), (x, y_bus - 3.0))
            ctx.insert("BEE_SPD", (x, y_bus - 3.0 - SYM_H))
            ctx.insert("BEE_EARTH", (x, y_bus - 3.0 - SYM_H - 2.0))
            self.device_labels(b.spd, x, y_bus - 3.0, side="right", h=1.5)
            x += 14.0

        # groups
        y_bottom = y_bus
        y_pe = None
        for g in b.groups:
            gx0 = x
            y_sub = y_bus - SUB_DROP
            if g.device:
                ctx.line((gx0, y_bus), (gx0, y_bus - 4.0))
                yb = self.vdevice(g.device, gx0, y_bus - 4.0, side="right")
                ctx.line((gx0, yb), (gx0, y_sub))
            else:
                ctx.line((gx0, y_bus), (gx0, y_sub))
            gw = self.group_width(g.circuits)
            ctx.msp.add_lwpolyline([(gx0 - 2.0, y_sub), (gx0 + gw - PITCH + 2.0, y_sub)],
                                   dxfattribs={"layer": LAYERS["sld_bus"].name, "const_width": 0.7})
            if g.title:
                ctx.text(g.title, (gx0 + gw - PITCH + 2.0, y_sub + 1.2), 1.6, "sld_text", TA.BOTTOM_RIGHT)
            for i, c in enumerate(g.circuits):
                cx = gx0 + i * PITCH
                self.draw_final_circuit(c, cx, y_sub)
            y_bottom = min(y_bottom, y_sub - CIRC_LEN - 36.0)
            # N bar of the group (blue)
            if g.device and g.device.kind in ("rcd", "rcbo"):
                yn = y_sub - CIRC_LEN - 31.0
                ctx.msp.add_lwpolyline([(gx0 - 2.0, yn), (gx0 + gw - PITCH + 2.0, yn)],
                                       dxfattribs={"layer": LAYERS["n"].name, "const_width": 0.6})
                ctx.text(f"פס N — {g.device.tag}", (gx0 - 2.0, yn - 1.2), 1.5, "sld_text", TA.TOP_LEFT)
            x = gx0 + gw + GROUP_GAP

        # feeders (from the main busbar)
        for f in b.feeders:
            ctx.line((x, y_bus), (x, y_bus - 4.0))
            yb = self.vdevice(f.device, x, y_bus - 4.0, side="right")
            if f.rcd:
                ctx.line((x, yb), (x, yb - 4.0))
                yb = self.vdevice(f.rcd, x, yb - 4.0, side="right")
            self.feeder_pts[(b.id, f.tag)] = Placed(x, yb)
            if f.cable:
                ctx.text(f.cable.designation, (x - 2.0, yb - 2.0), 1.6, "sld_text", TA.TOP_RIGHT)
            x += PITCH + 4.0

        # PE bar
        y_pe = y_bottom + 4.0
        ctx.msp.add_lwpolyline([(x_left + 2.0, y_pe), (x_in + width - 10.0, y_pe)],
                               dxfattribs={"layer": LAYERS["pe"].name, "const_width": 0.8})
        ctx.text("פס PE", (x_left + 2.0, y_pe - 1.2), 1.6, "sld_text", TA.TOP_LEFT)
        # frame
        fy0 = y_pe - 6.0
        ctx.msp.add_lwpolyline([(x_left, fy0), (x_in + width - 6.0, fy0), (x_in + width - 6.0, y_board_top + 4.0), (x_left, y_board_top + 4.0)],
                               close=True, dxfattribs={"layer": LAYERS["sld_board"].name})
        ctx.text(b.title, (x_in + width - 7.5, y_board_top + 2.5), 3.0, "sld_tag", TA.TOP_RIGHT, bold=True)
        if b.enclosure:
            e = b.enclosure
            ctx.text(f"{e.rows}×{e.modules_per_row} מודולים", (x_left + 1.5, y_board_top + 2.5), 1.6, "sld_text", TA.TOP_LEFT)
        if is_main:
            # equipotential bar + earth electrode below the PE bar
            ex = x_left + 10.0
            ctx.msp.add_line((ex, y_pe), (ex, fy0 - 8.0), dxfattribs={"layer": LAYERS["pe"].name})
            ctx.insert("BEE_EARTH", (ex, fy0 - 8.0))
            ctx.text("פס השוואת פוטנציאלים", (ex + 3.0, fy0 - 5.0), 1.8, "sld_text", TA.MIDDLE_LEFT)
        return x_in + width - 6.0, fy0

    def draw_final_circuit(self, c: Circuit, x: float, y_sub: float) -> None:
        ctx = self.ctx
        d = c.device
        ctx.line((x, y_sub), (x, y_sub - 3.0), "sld_sec")
        ctx.insert(device_block_name(d.kind, d.poles), (x, y_sub - 3.0 - SYM_H))
        ctx.text(d.tag, (x + 1.8, y_sub - 2.0), 2.0, "sld_tag", TA.TOP_LEFT, bold=True)
        lines = d.label_lines()
        yy = y_sub - 5.2
        for line in lines[:2]:
            ctx.text(line, (x + 1.8, yy), 1.4, "sld_text", TA.TOP_LEFT)
            yy -= 2.0
        if c.phase:
            ctx.text(c.phase, (x + 1.8, yy), 1.4, "sld_text", TA.TOP_LEFT)
        y_dev = y_sub - 3.0 - SYM_H
        y_end = y_sub - CIRC_LEN
        ctx.line((x, y_dev), (x, y_end), "sld_sec")
        ctx.insert("BEE_LOAD", (x, y_end - 4.0))
        # rotated labels: cable then load, reading upward, placed left of the line
        yt = y_end - 6.0
        if c.cable:
            ctx.text(c.cable.designation, (x - 0.6, yt), 1.6, "sld_text", TA.TOP_RIGHT, rotation=90)
        if c.load:
            ctx.text(c.load, (x + 2.4, yt), 1.8, "sld_text", TA.TOP_RIGHT, rotation=90)

    def draw_node(self, n: Node, x_right: float, y_top: float) -> None:
        ctx = self.ctx
        x0, y0 = x_right - getattr(self, "node_w", NODE_W), y_top - NODE_H
        ctx.msp.add_lwpolyline([(x0, y0), (x_right, y0), (x_right, y0 + NODE_H), (x0, y0 + NODE_H)], close=True,
                               dxfattribs={"layer": LAYERS["sld_board"].name})
        block = {"inverter": "BEE_INVERTER", "battery": "BEE_BATTERY", "generator": "BEE_GENERATOR",
                 "pv": "BEE_PV", "transformer": "BEE_TRANSFORMER", "bess": "BEE_BATTERY", "ups": "BEE_INVERTER",
                 "load": "BEE_LOAD", "meter": "BEE_METER_KWH"}[n.kind]
        ctx.msp.add_blockref(block, (x0 + 8.0, y0 + 4.0), dxfattribs={"layer": LAYERS["sld_sym"].name, "xscale": 0.7, "yscale": 0.7})
        ctx.text(n.label, (x_right - 2.0, y0 + NODE_H - 1.5), 2.2, "sld_tag", TA.TOP_RIGHT, bold=True)
        ctx.text(n.sublabel, (x_right - 2.0, y0 + NODE_H - 5.2), 1.5, "sld_text", TA.TOP_RIGHT)
        ctx.text(n.rating, (x_right - 2.0, y0 + NODE_H - 8.4), 1.6, "sld_text", TA.TOP_RIGHT)
        if n.device:
            ctx.text(" ".join([n.device.tag] + n.device.label_lines()[:1]), (x_right - 2.0, y0 + 1.5), 1.4, "sld_text", TA.BOTTOM_RIGHT)
        self.node_pts[n.id] = Placed(x0, y0 + NODE_H / 2)

    def connect(self, a: Placed, b: Placed, label: str = "", x_turn: float | None = None) -> None:
        """Orthogonal route from a feeder device bottom (a) to a target left-mid point (b).

        The vertical run goes up the corridor left of the right band (``x_turn``) so it never
        crosses a sub-board drawn under the nodes."""
        ctx = self.ctx
        y_run = a.y - 5.0
        if x_turn is None:
            x_turn = b.x - 6.0
        pts = [(a.x, a.y), (a.x, y_run), (x_turn, y_run), (x_turn, b.y), (b.x, b.y)]
        ctx.msp.add_lwpolyline(pts, dxfattribs={"layer": LAYERS["sld_main"].name})
        if label:
            ctx.text(label, (x_turn + 1.0, (y_run + b.y) / 2), 1.6, "sld_text", TA.MIDDLE_LEFT, rotation=90)

    def draw_legend(self, x: float, y: float) -> None:
        ctx = self.ctx
        items = [
            ("BEE_MCB_4P", "מא\"ז / מפסק ראשי"), ("BEE_RCD_4P", "מפסק פחת"), ("BEE_MCB_1P", "מפסק זעיר"),
            ("BEE_SPD", "מגן ברקים"), ("BEE_METER_KWH", "מונה אנרגיה"), ("BEE_CT", "משנה זרם"),
            ("BEE_INVERTER", "ממיר DC/AC"), ("BEE_BATTERY", "מצבר"), ("BEE_EARTH", "הארקה"), ("BEE_LOAD", "צרכן"),
        ]
        cols = 2
        cw, rh = 46.0, 13.0
        rows = (len(items) + cols - 1) // cols
        w, h = cols * cw + 4.0, rows * rh + 8.0
        ctx.rect(x, y, w, h, "legend")
        ctx.text("מקרא", (x + w - 2.0, y + h - 1.5), 2.6, "legend", TA.TOP_RIGHT, bold=True)
        for i, (blk, label) in enumerate(items):
            cx = x + 2.0 + (i % cols) * cw
            cy = y + h - 8.0 - (i // cols) * rh - 10.0
            scale = 0.8
            self.ctx.msp.add_blockref(blk, (cx + 5.0, cy + 1.0), dxfattribs={"layer": LAYERS["legend"].name, "xscale": scale, "yscale": scale})
            ctx.text(label, (cx + cw - 2.0, cy + 5.0), 1.8, "legend", TA.MIDDLE_RIGHT)

    def draw_phase_summary(self, x_right: float, y: float) -> None:
        """Σ ratings of 1P circuits per phase and board — the office's 'סיכום מאמ"תים לפי מופע'."""
        ctx = self.ctx
        boards = self.design.boards
        cols = ["מופע"] + [b.id for b in boards] + ["סה\"כ"]
        cw = 16.0
        w = cw * len(cols)
        x0 = x_right - w
        rows = []
        for ph in ("L1", "L2", "L3"):
            vals = []
            for b in boards:
                s = sum((c.device.rating_a or 0) for c in b.all_circuits() if c.phase == ph and c.device.poles == 1)
                vals.append(s)
            rows.append([ph] + [f"{v:g}" for v in vals] + [f"{sum(vals):g}"])
        rh = 5.0
        h = rh * (len(rows) + 1)
        ctx.rect(x0, y, w, h, "legend")
        ctx.text("סיכום מאמ\"תים לפי מופע [A]", (x_right, y + h + 1.0), 2.0, "legend", TA.BOTTOM_RIGHT, bold=True)
        for j, col in enumerate(cols):
            cx = x_right - (j + 0.5) * cw
            ctx.text(col, (cx, y + h - rh / 2), 1.8, "legend", TA.MIDDLE_CENTER, bold=True)
            if j:
                ctx.line((x_right - j * cw, y), (x_right - j * cw, y + h), "legend")
        for i, row in enumerate(rows):
            yy = y + h - rh * (i + 1.5)
            ctx.line((x0, y + h - rh * (i + 1)), (x_right, y + h - rh * (i + 1)), "legend")
            for j, val in enumerate(row):
                ctx.text(val, (x_right - (j + 0.5) * cw, yy), 1.8, "legend", TA.MIDDLE_CENTER)

    # ------------------------------------------------------------------ main
    def draw(self) -> None:
        ctx = self.ctx
        d = self.design
        y_top = ctx.y1 - 12.0
        fed = {f.to_board for b in d.boards for f in b.feeders if f.to_board}
        fed |= {b.id for b in d.boards if b.supply.kind != "utility"}
        mains = [b for b in d.boards if b.id not in fed]
        subs = [b for b in d.boards if b.id in fed]
        # right band: nodes at the top (1–2 columns, depending on the room left), sub-boards below them
        x_main_right = ctx.x0 + 22.0 + sum(self.board_width(b) - 6.0 + BOARD_GAP + 14.0 for b in mains) - BOARD_GAP - 14.0
        room = ctx.x1 - 4.0 - (x_main_right + 10.0)
        self.node_w = NODE_W
        node_cols = 1
        if len(d.nodes) > 3:
            if room >= 2 * (NODE_W + 4.0):
                node_cols = 2
            elif room >= 2 * (44.0 + 4.0):
                node_cols, self.node_w = 2, 44.0
        band_w = max([node_cols * (self.node_w + 4.0) - 4.0] + [self.board_width(b) + 10.0 for b in subs])
        x_band_right = ctx.x1 - 4.0
        x_band_left = x_band_right - band_w
        x = ctx.x0 + 22.0
        y_main_bottom = y_top
        for b in mains:
            xr, yb = self.draw_board(b, x, y_top, True)
            y_main_bottom = min(y_main_bottom, yb)
            x = xr + BOARD_GAP + 14.0
            if xr + 2.0 > x_band_left and (d.nodes or subs):
                self.warnings.append(f"board {b.id} overlaps the right band — reduce circuits per sheet")
        yn = y_top
        for i, n in enumerate(d.nodes):
            col = i % node_cols
            xr_node = x_band_right - col * (self.node_w + 4.0)
            self.draw_node(n, xr_node, yn)
            if col == node_cols - 1 or i == len(d.nodes) - 1:
                yn -= NODE_H + 4.0
        for b in subs:
            y_sub_top = yn - 6.0
            xr, yb = self.draw_board(b, x_band_left + 14.0, y_sub_top, False)
            yn = yb - 4.0
            if yb < ctx.y0 + TB_H + 12.0:
                self.warnings.append(f"sub-board {b.id} runs into the title block — move it to its own sheet")
        # connections: feeders → nodes / boards (one corridor lane per feeder, left of the band)
        lane = 0
        for b in d.boards:
            for f in b.feeders:
                src = self.feeder_pts.get((b.id, f.tag))
                if not src:
                    continue
                label = f.cable.designation if f.cable else ""
                if f.to_node and f.to_node in self.node_pts:
                    self.connect(src, self.node_pts[f.to_node], label, x_turn=x_band_left - 4.0 - 3.0 * lane)
                    lane += 1
                elif f.to_board and f.to_board in self.board_x:
                    bx = self.board_x[f.to_board]
                    self.connect(src, Placed(bx - 6.0, self.board_bus[f.to_board][2] + 46.0), label)
                elif f.to_board or f.to_node:
                    self.warnings.append(f"feeder {f.tag}: target {f.to_board or f.to_node} not drawn")
        # legend, notes, summary
        if d.legend:
            self.draw_legend(ctx.x0 + 2.0, ctx.y0 + 2.0)
        if d.notes:
            nx = x_band_left - 6.0
            ny = min(y_main_bottom - 4.0, ctx.y0 + 108.0)
            ctx.text("הערות", (nx, ny), 2.6, "notes", TA.TOP_RIGHT, bold=True)
            ctx.mtext([f"{i + 1}. {t}" for i, t in enumerate(d.notes)], (nx, ny - 4.0), 1.8, "notes", width=118.0)
        self.draw_phase_summary(ctx.x1 - TB_W - 6.0, ctx.y0 + 4.0)


def draw_sld(ctx: SheetContext, design: Design) -> list[str]:
    r = SldRenderer(ctx, design)
    r.draw()
    return r.warnings
