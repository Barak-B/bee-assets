"""Medium-voltage single-line (חד-קווי מתח גבוה) — a switchgear row in the office's arrangement
(see מצפה שלם E-05): the utility network top-left, the switchgear as a row of dash-dot cells under
a common busbar, each cell top → bottom: breaker (VCB, with CC/TC coils), CT, relay, earthing switch,
VPIS, cable head; the cell tag strip (+H1 CB1) at the bottom; cables down to the transformers / PCS
drawn as nodes under the row; legend and notes. The equipment schedule goes to its own sheet
(E-xxA, "מפרט תאים וציוד"), like the office does.
"""
from __future__ import annotations

import re

from ezdxf.enums import TextEntityAlignment as TA

from .layers import LAYERS
from .model import Design, MVBoard, MVCell, Node
from .sheet import SheetContext, TB_H, TB_W
from .symbols import H as SYM_H
from .symbols import device_block_name

CELL_W = 34.0
CELL_H = 88.0
NODE_H = 24.0
NODE_DROP = 30.0


def wrap(s: str, width: int, max_lines: int = 3) -> list[str]:
    """Wrap on separators (', ', ' — ', ' + ', ' / ') into at most ``max_lines`` lines of ~``width`` chars."""
    parts = re.split(r"(, | — | \+ | / )", s)
    lines: list[str] = [""]
    for i in range(0, len(parts), 2):
        token = parts[i] + (parts[i + 1] if i + 1 < len(parts) else "")
        if lines[-1] and len(lines[-1]) + len(token.strip()) > width and len(lines) < max_lines:
            lines.append("")
        lines[-1] += token
    return [x.strip(" ,—+/") for x in lines if x.strip(" ,—+/")]


class MVRenderer:
    def __init__(self, ctx: SheetContext, design: Design, board: MVBoard):
        self.ctx = ctx
        self.design = design
        self.board = board
        self.warnings: list[str] = []
        self.cell_bottom: dict[str, tuple[float, float]] = {}

    # ------------------------------------------------------------------ cells
    def draw_cell(self, c: MVCell, x0: float, y_bus: float) -> None:
        ctx = self.ctx
        xc = x0 + CELL_W / 2
        y_top = y_bus - 6.0
        y_cell0 = y_bus - CELL_H
        frame_top = y_bus + 12.0
        ctx.msp.add_lwpolyline([(x0 + 1.0, y_cell0), (x0 + CELL_W - 1.0, y_cell0), (x0 + CELL_W - 1.0, frame_top), (x0 + 1.0, frame_top)],
                               close=True, dxfattribs={"layer": LAYERS["sld_board"].name})
        ctx.rect(x0 + 1.0, y_cell0, CELL_W - 2.0, 7.0, "sld_board")
        ctx.text(c.tag, (x0 + 2.5, y_cell0 + 3.5), 2.2, "sld_tag", TA.MIDDLE_LEFT, bold=True)
        ctx.text(c.device_tag, (x0 + CELL_W - 2.5, y_cell0 + 3.5), 2.4, "sld_tag", TA.MIDDLE_RIGHT, bold=True)
        # title: up to two short lines in the strip above the busbar
        yy = frame_top - 1.2
        for line in wrap(c.title, 22, 2):
            ctx.text(line, (x0 + CELL_W - 2.0, yy), 1.4, "sld_text", TA.TOP_RIGHT)
            yy -= 2.2
        ctx.line((xc, y_bus), (xc, y_top), "sld_main")
        y = y_top
        if c.kind == "vt":
            ctx.line((xc, y), (xc, y - 4.0), "sld_main")
            ctx.insert("BEE_FUSE", (xc, y - 4.0 - SYM_H))
            ctx.text("נתיכי מ\"ג", (xc + 2.0, y - 8.0), 1.3, "sld_text", TA.MIDDLE_LEFT)
            y = y - 4.0 - SYM_H
            ctx.line((xc, y), (xc, y - 4.0), "sld_main")
            ctx.insert("BEE_VT", (xc, y - 4.0 - SYM_H))
            ctx.text("VT", (xc + 2.6, y - 8.5), 1.8, "sld_tag", TA.MIDDLE_LEFT, bold=True)
            yy = y - 11.5
            for line in wrap(c.vt or "", 14, 3):
                ctx.text(line, (xc + 2.6, yy), 1.2, "sld_text", TA.MIDDLE_LEFT)
                yy -= 1.9
            y = y - 4.0 - SYM_H
            ctx.line((xc, y), (xc, y - 3.0), "sld_main")
            ctx.insert("BEE_EARTH", (xc, y - 3.0))
            if c.earthing_switch:
                ctx.insert("BEE_ES", (xc, y_top - 2.0))
            return
        if c.breaker:
            blk = device_block_name(c.breaker.kind, c.breaker.poles)
            ctx.insert(blk, (xc, y - SYM_H))
            ctx.text("VCB", (xc - 3.0, y - 3.5), 1.6, "sld_tag", TA.MIDDLE_RIGHT, bold=True)
            lines = c.breaker.label_lines()
            yy = y - 1.0
            for line in lines[:2]:
                ctx.text(line, (xc + 3.2, yy), 1.3, "sld_text", TA.TOP_LEFT)
                yy -= 1.9
            ctx.rect(xc + 3.2, y - SYM_H + 0.2, 4.6, 2.8, "sld_sym")
            ctx.text("CC", (xc + 5.5, y - SYM_H + 1.6), 1.0, "sld_text", TA.MIDDLE_CENTER)
            ctx.rect(xc + 3.2, y - SYM_H - 3.0, 4.6, 2.8, "sld_sym")
            ctx.text("TC", (xc + 5.5, y - SYM_H - 1.6), 1.0, "sld_text", TA.MIDDLE_CENTER)
            if self.board.aux:
                ctx.text(self.board.aux, (xc + 8.4, y - SYM_H - 0.2), 1.1, "sld_text", TA.MIDDLE_LEFT)
            y -= SYM_H
        if c.ct:
            ctx.line((xc, y), (xc, y - 3.0), "sld_main")
            ctx.insert("BEE_CT", (xc, y - 3.0 - SYM_H))
            yy = y - 6.5
            for line in wrap(c.ct.replace("× ", "×"), 10, 2):
                ctx.text(line, (xc - 2.4, yy), 1.2, "sld_text", TA.MIDDLE_RIGHT)
                yy -= 1.9
            y = y - 3.0 - SYM_H
        if c.relay:
            ctx.insert("BEE_RELAY", (xc + 7.0, y + 3.0))
            yy = y + 2.0
            for line in wrap(c.relay, 12, 3):
                ctx.text(line, (xc + 10.0, yy), 1.0, "sld_text", TA.TOP_CENTER)
                yy -= 1.6
        if c.metering:
            ctx.line((xc, y), (xc, y - 3.0), "sld_main")
            ctx.insert("BEE_METER_KWH", (xc, y - 3.0 - SYM_H))
            yy = y - 6.5
            for line in wrap(c.metering, 12, 2):
                ctx.text(line, (xc + 4.2, yy), 1.2, "sld_text", TA.MIDDLE_LEFT)
                yy -= 1.9
            y = y - 3.0 - SYM_H
        if c.earthing_switch:
            ctx.line((xc, y), (xc, y - 6.0), "sld_main")
            ctx.insert("BEE_ES", (xc, y - 8.0))
            ctx.text("QE", (xc - 2.0, y - 3.0), 1.2, "sld_text", TA.MIDDLE_RIGHT)
            y -= 6.0
        if c.vpis:
            ctx.insert("BEE_VPIS", (xc - 10.5, y - 2.0))
        ctx.line((xc, y), (xc, y_cell0 + 7.0 + SYM_H), "sld_main")
        ctx.insert("BEE_CABLE_HEAD", (xc, y_cell0 + 7.0))
        self.cell_bottom[c.device_tag] = (xc, y_cell0)

    # ------------------------------------------------------------------ nodes
    def draw_node(self, n: Node, xc: float, y_top: float) -> None:
        ctx = self.ctx
        w = CELL_W - 2.0
        x0, y0 = xc - w / 2, y_top - NODE_H
        ctx.msp.add_lwpolyline([(x0, y0), (x0 + w, y0), (x0 + w, y_top), (x0, y_top)], close=True,
                               dxfattribs={"layer": LAYERS["sld_board"].name})
        blk = {"transformer": "BEE_TRANSFORMER", "grid": "BEE_METER_KWH", "pcs": "BEE_INVERTER", "rmu": "BEE_SW_3P",
               "battery": "BEE_BATTERY", "pv": "BEE_PV", "generator": "BEE_GENERATOR", "load": "BEE_LOAD",
               "inverter": "BEE_INVERTER", "bess": "BEE_BATTERY", "ups": "BEE_INVERTER", "meter": "BEE_METER_KWH"}[n.kind]
        ctx.msp.add_blockref(blk, (x0 + 4.5, y0 + 3.0), dxfattribs={"layer": LAYERS["sld_sym"].name, "xscale": 0.7, "yscale": 0.7})
        ctx.text(n.label, (x0 + w - 1.5, y_top - 1.2), 1.8, "sld_tag", TA.TOP_RIGHT, bold=True)
        yy = y_top - 4.6
        for line in wrap(n.sublabel, 16, 2):
            ctx.text(line, (x0 + w - 1.5, yy), 1.1, "sld_text", TA.TOP_RIGHT)
            yy -= 1.8
        ctx.text(n.rating, (x0 + w - 1.5, y0 + 1.0), 1.2, "sld_text", TA.BOTTOM_RIGHT)

    def draw_grid(self, n: Node, x0: float, y_top: float) -> tuple[float, float]:
        """Utility network frame top-left; returns the point where the incomer cable leaves it."""
        ctx = self.ctx
        w, h = 60.0, 26.0
        ctx.msp.add_lwpolyline([(x0, y_top - h), (x0 + w, y_top - h), (x0 + w, y_top), (x0, y_top)], close=True,
                               dxfattribs={"layer": LAYERS["sld_board"].name})
        ctx.text(f"{n.label}  {self.board.voltage}", (x0 + w - 2.0, y_top - 1.5), 2.4, "sld_tag", TA.TOP_RIGHT, bold=True)
        ctx.text(n.sublabel, (x0 + w - 2.0, y_top - 5.5), 1.4, "sld_text", TA.TOP_RIGHT)
        ctx.text(n.rating, (x0 + w - 2.0, y_top - 8.5), 1.4, "sld_text", TA.TOP_RIGHT)
        xm = x0 + 10.0
        ctx.insert("BEE_METER_KWH", (xm, y_top - h + 6.0))
        ctx.text("IEC-M", (xm + 5.0, y_top - h + 11.0), 1.4, "sld_text", TA.MIDDLE_LEFT)
        ctx.line((xm, y_top - h + 6.0), (xm, y_top - h), "sld_main")
        return xm, y_top - h

    def draw_legend(self, x: float, y: float) -> None:
        ctx = self.ctx
        items = [("BEE_ACB_3P", "מפסק ואקום VCB (שליף)"), ("BEE_CT", "משנה זרם CT"), ("BEE_VT", "משנה מתח VT"),
                 ("BEE_ES", "מנתק הארקה"), ("BEE_VPIS", "מחוון מתח VPIS"), ("BEE_CABLE_HEAD", "ראש כבל"),
                 ("BEE_TRANSFORMER", "שנאי"), ("BEE_METER_KWH", "מונה אנרגיה"), ("BEE_FUSE", "נתיך מ\"ג"), ("BEE_RELAY", "ממסר הגנה")]
        cols, cw, rh = 2, 48.0, 13.0
        rows = (len(items) + cols - 1) // cols
        w, h = cols * cw + 4.0, rows * rh + 8.0
        ctx.rect(x, y, w, h, "legend")
        ctx.text("מקרא סימנים", (x + w - 2.0, y + h - 1.5), 2.6, "legend", TA.TOP_RIGHT, bold=True)
        for i, (blk, label) in enumerate(items):
            cx = x + 2.0 + (i % cols) * cw
            cy = y + h - 8.0 - (i // cols) * rh - 10.0
            ctx.msp.add_blockref(blk, (cx + 5.0, cy + 1.0), dxfattribs={"layer": LAYERS["legend"].name, "xscale": 0.8, "yscale": 0.8})
            ctx.text(label, (cx + cw - 2.0, cy + 5.0), 1.7, "legend", TA.MIDDLE_RIGHT)

    # ------------------------------------------------------------------ sheet
    def draw(self) -> list[str]:
        ctx, b = self.ctx, self.board
        n_cells = len(b.cells)
        row_w = n_cells * CELL_W
        x_row0 = ctx.x1 - 10.0 - row_w
        if x_row0 < ctx.x0 + 80.0:
            self.warnings.append(f"MV board {b.id}: {n_cells} cells do not fit on one sheet — split the switchgear")
        y_bus = ctx.y1 - 66.0
        frame_top, frame_bottom = y_bus + 16.0, y_bus - CELL_H - 4.0
        ctx.msp.add_lwpolyline([(x_row0 - 4.0, frame_bottom), (x_row0 + row_w + 4.0, frame_bottom),
                                (x_row0 + row_w + 4.0, frame_top), (x_row0 - 4.0, frame_top)], close=True,
                               dxfattribs={"layer": LAYERS["sld_board"].name})
        bus_txt = (f"{b.busbar.rating_a:g}A " if b.busbar.rating_a else "") + b.voltage + (f" {b.busbar.icw_ka:g}kA/1s" if b.busbar.icw_ka else "")
        ctx.text(f"{b.title} — פס צבירה {b.busbar.label} {bus_txt}", (x_row0 + row_w + 2.0, frame_top + 1.5), 3.0, "sld_tag", TA.BOTTOM_RIGHT, bold=True)
        ctx.msp.add_lwpolyline([(x_row0 + 4.0, y_bus), (x_row0 + row_w - 4.0, y_bus)],
                               dxfattribs={"layer": LAYERS["sld_bus"].name, "const_width": 1.4})
        for i, c in enumerate(b.cells):
            self.draw_cell(c, x_row0 + i * CELL_W, y_bus)
        # utility network → incomer cell (cable arrives at the cell bottom from the left)
        grid = next((n for n in self.design.nodes if n.kind == "grid"), None)
        incomer = next((c for c in b.cells if c.kind == "incomer"), None)
        if grid:
            gx, gy = self.draw_grid(grid, ctx.x0 + 6.0, ctx.y1 - 14.0)
            if incomer:
                xc = x_row0 + b.cells.index(incomer) * CELL_W + CELL_W / 2
                y_run = frame_bottom - 8.0
                ctx.msp.add_lwpolyline([(gx, gy), (gx, y_run), (xc, y_run), (xc, y_bus - CELL_H)],
                                       dxfattribs={"layer": LAYERS["sld_main"].name})
                if incomer.cable:
                    ctx.text(incomer.cable.designation + (f" · L = {incomer.cable.length_m:g} m" if incomer.cable.length_m else ""),
                             (gx + 2.0, y_run + 1.5), 1.6, "sld_text", TA.BOTTOM_LEFT)
                if b.cells.index(incomer) != 0:
                    self.warnings.append("incomer cell is not the first cell — the utility cable crosses other drops")
        # nodes under their cells
        y_nodes = frame_bottom - NODE_DROP
        for c in b.cells:
            if not c.to or c.kind == "incomer":
                continue
            node = next((n for n in self.design.nodes if n.id == c.to), None)
            if not node:
                self.warnings.append(f"cell {c.device_tag}: node {c.to} not found")
                continue
            xc, yb = self.cell_bottom[c.device_tag]
            ctx.line((xc, yb), (xc, y_nodes), "sld_main")
            if c.cable:
                txt = c.cable.designation + (f"  L={c.cable.length_m:g}m" if c.cable.length_m else "")
                ctx.text(txt, (xc - 1.2, yb - 6.0), 1.1, "sld_text", TA.RIGHT, rotation=90)
            self.draw_node(node, xc, y_nodes)
        self.draw_legend(ctx.x0 + 2.0, ctx.y0 + 2.0)
        notes = b.notes + self.design.notes
        if notes:   # under the utility frame, left of the switchgear
            nx = ctx.x0 + 90.0
            ny = ctx.y1 - 46.0
            ctx.text("הערות", (nx, ny), 2.4, "notes", TA.TOP_RIGHT, bold=True)
            ctx.mtext([f"{i + 1}. {t}" for i, t in enumerate(notes)], (nx, ny - 4.0), 1.5, "notes", width=70.0)
        return self.warnings


def draw_mv(ctx: SheetContext, design: Design, board: MVBoard) -> list[str]:
    return MVRenderer(ctx, design, board).draw()


def draw_mv_schedule(ctx: SheetContext, design: Design, board: MVBoard) -> list[str]:
    """E-xxA — equipment per cell (מפרט תאים וציוד), full width, in the office's table style."""
    cols = [("תא", 14.0), ("תפקיד", 64.0), ("מפסק", 34.0), ("משני זרם", 44.0), ("משני מתח / מנייה", 52.0),
            ("הגנות", 70.0), ("כבל יוצא / יעד", 70.0)]
    tw = sum(c[1] for c in cols)
    x_right = ctx.x1 - 4.0
    y_top = ctx.y1 - 16.0
    rh = 7.0
    ctx.text(f"{board.title} — ציוד בכל תא", (x_right, y_top + 1.0), 3.0, "legend", TA.BOTTOM_RIGHT, bold=True)
    rows = board.cells
    h = rh * (len(rows) + 1)
    ctx.rect(x_right - tw, y_top - h, tw, h, "legend")
    xx = x_right
    for name, cw in cols:
        ctx.text(name, (xx - cw / 2, y_top - rh / 2), 1.8, "legend", TA.MIDDLE_CENTER, bold=True)
        xx -= cw
        ctx.line((xx, y_top - h), (xx, y_top), "legend")
    nodes = {n.id: n for n in design.nodes}
    for i, c in enumerate(rows):
        yy = y_top - rh * (i + 1.5)
        ctx.line((x_right - tw, yy + rh / 2), (x_right, yy + rh / 2), "legend")
        brk = " ".join(c.breaker.label_lines()[:2]) if c.breaker else ("—")
        target = nodes[c.to].label if c.to in nodes else ""
        cable = (c.cable.designation + (f" · {c.cable.length_m:g} m" if c.cable and c.cable.length_m else "")) if c.cable else ""
        vals = [f"{c.tag} {c.device_tag}", c.title or c.kind, brk, c.ct or "—", c.vt or c.metering or "—", c.relay or "—",
                " → ".join(x for x in (cable, target) if x) or "—"]
        xx = x_right
        for (name, cw), v in zip(cols, vals):
            ctx.text(v, (xx - 1.5, yy), 1.5, "legend", TA.MIDDLE_RIGHT)
            xx -= cw
    # common equipment + notes under the table
    y = y_top - h - 10.0
    common = ["פסי צבירה: " + board.busbar.label + (f" {board.busbar.rating_a:g}A" if board.busbar.rating_a else "") + f" {board.voltage}" +
              (f" Icw {board.busbar.icw_ka:g}kA/1s" if board.busbar.icw_ka else ""),
              "מתח פיקוד: " + (board.aux or "—"),
              "שלט אזהרה 'סכנת מתח גבוה', הארקת מסד, מהדקי כבלים — לפי IEC 62271-200 ונוהלי חח\"י."]
    ctx.text("ציוד משותף למסדר", (x_right, y), 2.4, "legend", TA.TOP_RIGHT, bold=True)
    ctx.mtext([f"{i + 1}. {t}" for i, t in enumerate(common)], (x_right, y - 4.0), 1.7, "notes", width=tw)
    notes = board.notes + design.notes
    if notes:
        y2 = y - 26.0
        ctx.text("הערות", (x_right, y2), 2.4, "notes", TA.TOP_RIGHT, bold=True)
        ctx.mtext([f"{i + 1}. {t}" for i, t in enumerate(notes)], (x_right, y2 - 4.0), 1.7, "notes", width=tw)
    return []
