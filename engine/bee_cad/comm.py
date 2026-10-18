"""Communication diagram (דיאגרמת חיבור תקשורת): meters, EMS, switch, router, PCS cabinets, links.

Deterministic block layout (reference: Roche G009 "דיאגרמת חיבור תקשורת"):

* **field column** (left) — meters / sensors / third-party controllers, one box per device;
* **comm panel** (right, dashed frame) — EMS, switch, router, PSU … stacked;
* **row** (bottom) — PCS / inverter cabinets, or any device with ``place = "row"``;
* links are orthogonal: field → panel horizontally into the switch, panel → row downwards.

Every link carries its medium (Cat7 / RS485 / LTE / fibre) and is listed in the link table, so
the drawing and the schedule are one object.
"""
from __future__ import annotations

from typing import Literal, Optional

from ezdxf.enums import TextEntityAlignment as TA
from pydantic import BaseModel, Field

from .layers import LAYERS
from .model import Design
from .sheet import SheetContext, TB_H, TB_W

DevKind = Literal["meter", "ems", "switch", "router", "psu", "ups", "pcs", "inverter", "sensor", "server", "panel", "other"]
Place = Literal["field", "panel", "row"]


class CommDevice(BaseModel):
    id: str
    label: str                       # "SATEC Meter *3 — P.O.C"
    kind: DevKind = "other"
    place: Place = "field"
    sublabel: str = ""               # "Power.IN | RS485 | LAN"
    ports: list[str] = Field(default_factory=list)


class CommLink(BaseModel):
    a: str
    b: str
    medium: str = "Cat7"             # Cat7 / RS485 / LTE / Fiber
    label: str = ""
    kind: Literal["lan", "serial", "wireless", "power"] = "lan"


class CommNetwork(BaseModel):
    title: str = "דיאגרמת חיבור תקשורת"
    sheet_no: str = "E-07"
    panel_label: str = "Comm Panel"
    devices: list[CommDevice] = Field(default_factory=list)
    links: list[CommLink] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)
    verify: list[str] = Field(default_factory=list)


BOX_W, BOX_H = 44.0, 16.0
ROW_W, ROW_H = 30.0, 26.0
MEDIUM_LAYER = {"lan": "comm", "serial": "comm", "wireless": "existing", "power": "ac"}


class CommRenderer:
    def __init__(self, ctx: SheetContext, design: Design, net: CommNetwork):
        self.ctx, self.design, self.net = ctx, design, net
        self.box: dict[str, tuple[float, float, float, float]] = {}
        self.place: dict[str, str] = {d.id: d.place for d in net.devices}
        self.warnings: list[str] = []

    def device_box(self, d: CommDevice, x0: float, y0: float, w: float, h: float, layer: str = "panel_dev") -> None:
        ctx = self.ctx
        ctx.rect(x0, y0, w, h, layer)
        if d.kind in ("pcs", "inverter"):
            # cabinet face with the unit tag
            ctx.rect(x0 + 0.15 * w, y0 + 0.3 * h, 0.7 * w, 0.45 * h, "panel_rail")
            ctx.text(d.label, (x0 + w / 2, y0 + 0.52 * h), 2.4, "panel_text", TA.MIDDLE_CENTER, bold=True)
            if d.sublabel:
                ctx.text(d.sublabel, (x0 + w / 2, y0 + 0.12 * h), 1.4, "panel_text", TA.MIDDLE_CENTER)
        else:
            ctx.text(d.label, (x0 + w / 2, y0 + h - 4.0), 2.0, "panel_text", TA.MIDDLE_CENTER, bold=True)
            if d.sublabel:
                ctx.text(d.sublabel, (x0 + w / 2, y0 + h - 8.0), 1.5, "panel_text", TA.MIDDLE_CENTER)
            if d.ports:
                pw = w / len(d.ports)
                for i, p in enumerate(d.ports):
                    px = x0 + i * pw
                    ctx.rect(px, y0, pw, 4.0, "panel_rail")
                    ctx.text(p, (px + pw / 2, y0 + 2.0), 1.2, "panel_text", TA.MIDDLE_CENTER)
        self.box[d.id] = (x0, y0, x0 + w, y0 + h)

    def route(self, lk: CommLink, lane: int) -> None:
        ctx = self.ctx
        a, b = self.box.get(lk.a), self.box.get(lk.b)
        if not a or not b:
            self.warnings.append(f"תקשורת: קישור {lk.a}→{lk.b} — התקן לא צויר")
            return
        layer = LAYERS[MEDIUM_LAYER[lk.kind]].name
        ax, ay = (a[0] + a[2]) / 2, (a[1] + a[3]) / 2
        bx, by = (b[0] + b[2]) / 2, (b[1] + b[3]) / 2
        text = lk.medium + (f" — {lk.label}" if lk.label else "")
        pa, pb = self.place.get(lk.a, "field"), self.place.get(lk.b, "field")
        if pb == "row" or pa == "row":
            if pa == "row":              # draw from the upper device downwards
                a, b = b, a
                ax, ay, bx, by = bx, by, ax, ay
            mode = "drop"
        elif a[2] <= b[0] or b[2] <= a[0]:
            mode = "side"
        else:
            mode = "vertical"
        if mode == "drop":      # a above b: leave a's bottom (spread along it), run at a lane level, drop into b's top
            ax_out = a[0] + (a[2] - a[0]) * (lane + 1) / 6.0
            ys = b[3] + 10.0 + 3.0 * lane
            pts = [(ax_out, a[1]), (ax_out, ys), (bx, ys), (bx, b[3])]
            ctx.text(text, (bx + 1.5, b[3] + 1.5), 1.5, "sld_text", TA.BOTTOM_LEFT, rotation=90.0)
        elif mode == "side" and a[2] <= b[0]:      # a left of b: leave a's right edge, vertical step in a lane, enter b's left edge
            xs = a[2] + 8.0 + 3.0 * lane
            by_in = b[1] + 3.0 + 2.5 * lane            # separate entry heights on the target
            pts = [(a[2], ay), (xs, ay), (xs, by_in), (b[0], by_in)]
            ctx.text(text, (a[2] + 1.5, ay + 1.0), 1.5, "sld_text", TA.BOTTOM_LEFT)
        elif mode == "side":
            xs = b[2] + 8.0 + 3.0 * lane
            by_in = b[1] + 3.0 + 2.5 * lane
            pts = [(a[0], ay), (xs, ay), (xs, by_in), (b[2], by_in)]
            ctx.text(text, (a[0] - 1.5, ay + 1.0), 1.5, "sld_text", TA.BOTTOM_RIGHT)
        else:                   # vertical neighbours inside the panel: straight drop between the boxes
            if a[1] >= b[3]:
                pts = [(ax + 2.0 * lane, a[1]), (ax + 2.0 * lane, b[3])]
                ctx.text(text, (ax + 2.0 * lane + 1.0, (a[1] + b[3]) / 2), 1.4, "sld_text", TA.MIDDLE_LEFT)
            else:
                pts = [(ax + 2.0 * lane, a[3]), (ax + 2.0 * lane, b[1])]
                ctx.text(text, (ax + 2.0 * lane + 1.0, (a[3] + b[1]) / 2), 1.4, "sld_text", TA.MIDDLE_LEFT)
        ctx.msp.add_lwpolyline(pts, dxfattribs={"layer": layer})

    def draw_table(self, x_right: float, y_top: float) -> float:
        ctx, net = self.ctx, self.net
        cols = [("מ-", 26.0), ("אל", 26.0), ("מדיה", 18.0), ("הערה", 40.0)]
        tw, rh = sum(c[1] for c in cols), 4.2
        rows = [(lk.a, lk.b, lk.medium, lk.label) for lk in net.links][:20]
        h = rh * (len(rows) + 1)
        ctx.text("טבלת קישורי תקשורת", (x_right, y_top + 1.2), 2.2, "legend", TA.BOTTOM_RIGHT, bold=True)
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
                ctx.text(v[:28], (cx - cw / 2, yy), 1.4, "legend", TA.MIDDLE_CENTER)
                cx -= cw
        return y_top - h

    def draw(self) -> list[str]:
        ctx, net = self.ctx, self.net
        if not net.devices:
            self.warnings.append("תקשורת: אין התקנים במודל")
            return self.warnings
        field = [d for d in net.devices if d.place == "field"]
        panel = [d for d in net.devices if d.place == "panel"]
        row = [d for d in net.devices if d.place == "row"]
        y_top = ctx.y1 - 20.0
        # comm panel frame at the right of the diagram area (the right column keeps the table/notes)
        area_right = ctx.x1 - 130.0
        px1 = area_right
        px0 = px1 - (BOX_W + 16.0)
        ph = len(panel) * (BOX_H + 8.0) + 10.0
        ctx.msp.add_lwpolyline([(px0, y_top - ph), (px1, y_top - ph), (px1, y_top), (px0, y_top)], close=True,
                               dxfattribs={"layer": LAYERS["sld_board"].name})
        ctx.text(net.panel_label, (px1 - 2.0, y_top - 1.5), 2.4, "sld_tag", TA.TOP_RIGHT, bold=True)
        yy = y_top - 8.0
        for d in panel:
            self.device_box(d, px0 + 8.0, yy - BOX_H, BOX_W, BOX_H)
            yy -= BOX_H + 8.0
        # field column at the left, spaced vertically
        fx0 = ctx.x0 + 30.0
        fy = y_top - 4.0
        for d in field:
            self.device_box(d, fx0, fy - BOX_H, BOX_W, BOX_H)
            fy -= BOX_H + 10.0
        # row of cabinets along the bottom
        if row:
            ry0 = ctx.y0 + TB_H + 30.0
            total = len(row) * (ROW_W + 10.0) - 10.0
            rx = area_right - total
            if rx < fx0 + BOX_W + 20.0:
                self.warnings.append("תקשורת: שורת הארונות רחבה מהגיליון")
            for d in row:
                self.device_box(d, rx, ry0, ROW_W, ROW_H)
                rx += ROW_W + 10.0
        # links
        field_ids, row_ids = {d.id for d in field}, {d.id for d in row}
        lanes: dict[str, int] = {}
        for lk in net.links:
            key = "field" if lk.a in field_ids or lk.b in field_ids else ("row" if lk.b in row_ids or lk.a in row_ids else "panel")
            lanes[key] = lanes.get(key, -1) + 1
            self.route(lk, lanes[key])
        ctx.text(net.title, ((fx0 + px1) / 2, y_top + 6.0), 3.0, "panel_text", TA.BOTTOM_CENTER, bold=True)
        # right column: link table + notes
        xr = ctx.x1 - 6.0
        y_after = self.draw_table(xr, ctx.y1 - 16.0)
        notes = list(net.notes) + [f"לאימות: {v}" for v in net.verify]
        ny = y_after - 8.0
        ctx.text("הערות", (xr, ny), 2.4, "notes", TA.TOP_RIGHT, bold=True)
        ctx.mtext([f"{i + 1}. {n}" for i, n in enumerate(notes)], (xr, ny - 4.0), 1.6, "notes", width=110.0)
        return self.warnings


def draw_comm(ctx: SheetContext, design: Design, net: CommNetwork) -> list[str]:
    return CommRenderer(ctx, design, net).draw()
