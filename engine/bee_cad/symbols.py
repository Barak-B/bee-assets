"""IEC 60617 style symbols as DXF block definitions.

Every symbol is a block with its *lower* terminal at (0, 0) and its *upper* terminal at
(0, H) so the renderer can chain devices along a vertical line. Sizes are paper millimetres
(the single-line is a schematic, scale "-"). Blocks make the DWG editable in AutoCAD the way
the office works: one block per device type, attributes for tag / rating.
"""
from __future__ import annotations

import math

from ezdxf.document import Drawing
from ezdxf.layouts import BlockLayout

from .layers import LAYERS

SYM = LAYERS["sld_sym"].name
H = 10.0          # standard symbol height (terminal to terminal)
BLADE = 4.5       # open-contact blade length


def _stub(blk: BlockLayout, y0: float, y1: float) -> None:
    blk.add_line((0, y0), (0, y1), dxfattribs={"layer": SYM})


def _blade(blk: BlockLayout, y_hinge: float, angle_deg: float = 60.0, length: float = BLADE) -> None:
    """Open contact: blade from the hinge leaning left, towards the upper terminal."""
    a = math.radians(angle_deg)
    blk.add_line((0, y_hinge), (-length * math.cos(a), y_hinge + length * math.sin(a)), dxfattribs={"layer": SYM})


def _cross(blk: BlockLayout, y: float, s: float = 0.9) -> None:
    """Circuit-breaker trip mark (×) at the fixed contact."""
    blk.add_line((-s, y - s), (s, y + s), dxfattribs={"layer": SYM})
    blk.add_line((-s, y + s), (s, y - s), dxfattribs={"layer": SYM})


def _pole_strokes(blk: BlockLayout, y: float, poles: int) -> None:
    """Multi-pole marks: short diagonal strokes across the line (IEC 60617-S00058)."""
    if poles <= 1:
        return
    n = min(poles, 4)
    for i in range(n):
        x = -1.0 + i * 0.7 - (n - 1) * 0.35
        blk.add_line((x - 0.5, y - 0.8), (x + 0.5, y + 0.8), dxfattribs={"layer": SYM})


def _breaker(blk: BlockLayout, poles: int, kind: str) -> None:
    _stub(blk, 0, 3.0)
    _cross(blk, 3.0)
    _blade(blk, 3.0)
    _stub(blk, 7.0, H)
    _pole_strokes(blk, 8.6, poles)
    if kind == "mccb":  # thermal-magnetic trip unit: small rectangle beside the blade
        blk.add_lwpolyline([(1.2, 3.6), (3.0, 3.6), (3.0, 6.4), (1.2, 6.4)], close=True, dxfattribs={"layer": SYM})
    if kind == "acb":   # draw-out: two chevrons
        for y in (2.0, 8.0):
            blk.add_lwpolyline([(-1.2, y - 0.8), (0, y), (1.2, y - 0.8)], dxfattribs={"layer": SYM})


def _rcd(blk: BlockLayout, poles: int, combined: bool) -> None:
    _stub(blk, 0, 3.0)
    if combined:
        _cross(blk, 3.0)
    _blade(blk, 3.0)
    _stub(blk, 7.0, H)
    _pole_strokes(blk, 8.6, poles)
    # residual-current detector: ellipse around the blade + "I∆" box
    blk.add_ellipse(center=(-1.2, 5.0), major_axis=(0, 3.2), ratio=0.55, dxfattribs={"layer": SYM})
    blk.add_lwpolyline([(1.4, 4.0), (4.2, 4.0), (4.2, 6.0), (1.4, 6.0)], close=True, dxfattribs={"layer": SYM})
    blk.add_text("IΔ", dxfattribs={"layer": SYM, "height": 1.3, "style": "BEE-LAT"}).set_placement((2.8, 5.0), align=__import__("ezdxf").enums.TextEntityAlignment.MIDDLE_CENTER)


def _switch(blk: BlockLayout, poles: int) -> None:
    _stub(blk, 0, 3.0)
    blk.add_line((-1.3, 3.0), (1.3, 3.0), dxfattribs={"layer": SYM})  # isolator bar
    _blade(blk, 3.0)
    _stub(blk, 7.0, H)
    _pole_strokes(blk, 8.6, poles)


def _contactor(blk: BlockLayout, poles: int) -> None:
    _stub(blk, 0, 3.0)
    _blade(blk, 3.0)
    blk.add_arc(center=(0, 3.0), radius=1.1, start_angle=90, end_angle=270, dxfattribs={"layer": SYM})
    _stub(blk, 7.0, H)
    _pole_strokes(blk, 8.6, poles)


def _fuse(blk: BlockLayout) -> None:
    _stub(blk, 0, H)
    blk.add_lwpolyline([(-1.2, 2.5), (1.2, 2.5), (1.2, 7.5), (-1.2, 7.5)], close=True, dxfattribs={"layer": SYM})


def _spd(blk: BlockLayout) -> None:
    """Surge protective device: box with the varistor arrow, earth below."""
    _stub(blk, 7.5, H)
    blk.add_lwpolyline([(-2.2, 2.5), (2.2, 2.5), (2.2, 7.5), (-2.2, 7.5)], close=True, dxfattribs={"layer": SYM})
    blk.add_line((-1.6, 3.2), (1.6, 6.8), dxfattribs={"layer": SYM})
    blk.add_line((1.6, 6.8), (0.6, 6.6), dxfattribs={"layer": SYM})
    blk.add_line((1.6, 6.8), (1.4, 5.8), dxfattribs={"layer": SYM})
    _stub(blk, 0, 2.5)


def _meter(blk: BlockLayout, label: str = "kWh") -> None:
    _stub(blk, 0, 1.5)
    blk.add_circle((0, 5.0), 3.5, dxfattribs={"layer": SYM})
    blk.add_text(label, dxfattribs={"layer": SYM, "height": 1.6, "style": "BEE-LAT"}).set_placement((0, 5.0), align=__import__("ezdxf").enums.TextEntityAlignment.MIDDLE_CENTER)
    _stub(blk, 8.5, H)


def _ct(blk: BlockLayout) -> None:
    _stub(blk, 0, H)
    blk.add_circle((0, 5.0), 1.6, dxfattribs={"layer": SYM})
    blk.add_line((1.6, 5.0), (4.0, 5.0), dxfattribs={"layer": SYM})
    blk.add_circle((4.3, 5.0), 0.3, dxfattribs={"layer": SYM})


def _earth(blk: BlockLayout) -> None:
    blk.add_line((0, 0), (0, 3.0), dxfattribs={"layer": LAYERS["pe"].name})
    for i, w in enumerate((2.4, 1.6, 0.8)):
        y = -i * 0.9
        blk.add_line((-w, y), (w, y), dxfattribs={"layer": LAYERS["pe"].name})


def _transformer(blk: BlockLayout) -> None:
    _stub(blk, 0, 1.0)
    blk.add_circle((0, 4.0), 2.6, dxfattribs={"layer": SYM})
    blk.add_circle((0, 7.0), 2.6, dxfattribs={"layer": SYM})
    _stub(blk, 9.6, 12.0)


def _generator(blk: BlockLayout) -> None:
    _stub(blk, 0, 1.5)
    blk.add_circle((0, 5.5), 4.0, dxfattribs={"layer": SYM})
    blk.add_text("G", dxfattribs={"layer": SYM, "height": 2.2, "style": "BEE-LAT"}).set_placement((0, 6.3), align=__import__("ezdxf").enums.TextEntityAlignment.MIDDLE_CENTER)
    blk.add_text("~", dxfattribs={"layer": SYM, "height": 2.2, "style": "BEE-LAT"}).set_placement((0, 4.0), align=__import__("ezdxf").enums.TextEntityAlignment.MIDDLE_CENTER)


def _inverter(blk: BlockLayout) -> None:
    """DC/AC converter: square with a diagonal, '=' top-left, '~' bottom-right. 12×12."""
    s = 12.0
    blk.add_lwpolyline([(-s / 2, 0), (s / 2, 0), (s / 2, s), (-s / 2, s)], close=True, dxfattribs={"layer": SYM})
    blk.add_line((-s / 2, 0), (s / 2, s), dxfattribs={"layer": SYM})
    blk.add_text("=", dxfattribs={"layer": SYM, "height": 2.4, "style": "BEE-LAT"}).set_placement((-s / 4, s * 0.72), align=__import__("ezdxf").enums.TextEntityAlignment.MIDDLE_CENTER)
    blk.add_text("~", dxfattribs={"layer": SYM, "height": 2.4, "style": "BEE-LAT"}).set_placement((s / 4, s * 0.28), align=__import__("ezdxf").enums.TextEntityAlignment.MIDDLE_CENTER)


def _battery(blk: BlockLayout) -> None:
    _stub(blk, 0, 2.0)
    y = 2.0
    for i in range(3):
        blk.add_line((-2.4, y), (2.4, y), dxfattribs={"layer": SYM})
        blk.add_line((-1.0, y + 1.2), (1.0, y + 1.2), dxfattribs={"layer": SYM})
        y += 2.4
    _stub(blk, y - 1.2, H)


def _pv(blk: BlockLayout) -> None:
    """PV generator (IEC 60617-S01364 style): cell symbol in a box with incident arrows."""
    blk.add_lwpolyline([(-5, 0), (5, 0), (5, 8), (-5, 8)], close=True, dxfattribs={"layer": SYM})
    blk.add_line((-2.0, 4.0), (2.0, 4.0), dxfattribs={"layer": SYM})
    blk.add_line((-0.8, 2.6), (0.8, 2.6), dxfattribs={"layer": SYM})
    blk.add_line((0, 4.0), (0, 8.0), dxfattribs={"layer": SYM})
    blk.add_line((0, 2.6), (0, 0), dxfattribs={"layer": SYM})
    for dx in (-3.8, -2.6):
        blk.add_line((dx, 7.4), (dx + 1.4, 5.6), dxfattribs={"layer": SYM})
        blk.add_line((dx + 1.4, 5.6), (dx + 0.7, 5.8), dxfattribs={"layer": SYM})
        blk.add_line((dx + 1.4, 5.6), (dx + 1.3, 6.3), dxfattribs={"layer": SYM})


def _socket(blk: BlockLayout) -> None:
    blk.add_line((0, 0), (0, 4.0), dxfattribs={"layer": SYM})
    blk.add_arc(center=(0, 4.0), radius=2.0, start_angle=180, end_angle=360, dxfattribs={"layer": SYM})


def _load_arrow(blk: BlockLayout) -> None:
    blk.add_line((0, 4), (0, 0), dxfattribs={"layer": SYM})
    blk.add_solid([(0, 0), (-0.9, 2.2), (0.9, 2.2)], dxfattribs={"layer": SYM})


def _lock(blk: BlockLayout) -> None:
    """Padlock: lockable in the open position."""
    blk.add_lwpolyline([(-1.4, 0), (1.4, 0), (1.4, 2.0), (-1.4, 2.0)], close=True, dxfattribs={"layer": SYM})
    blk.add_arc(center=(0, 2.0), radius=0.9, start_angle=0, end_angle=180, dxfattribs={"layer": SYM})


def _emergency(blk: BlockLayout) -> None:
    blk.add_circle((0, 2.5), 2.5, dxfattribs={"layer": SYM})
    blk.add_line((-1.6, 0.9), (1.6, 4.1), dxfattribs={"layer": SYM})
    blk.add_line((-1.6, 4.1), (1.6, 0.9), dxfattribs={"layer": SYM})


def _vt(blk: BlockLayout) -> None:
    """Voltage transformer: two small circles, primary from the top terminal."""
    _stub(blk, 7.0, H)
    blk.add_circle((0, 5.2), 1.9, dxfattribs={"layer": SYM})
    blk.add_circle((0, 2.6), 1.9, dxfattribs={"layer": SYM})
    _stub(blk, 0, 0.7)


def _earthing_switch(blk: BlockLayout) -> None:
    """Earthing switch on a line: isolator blade from the line to earth (drawn to the right)."""
    blk.add_line((0, 5.0), (2.0, 5.0), dxfattribs={"layer": SYM})
    blk.add_line((2.0, 5.0), (4.6, 7.2), dxfattribs={"layer": SYM})
    blk.add_line((5.0, 5.0), (7.0, 5.0), dxfattribs={"layer": SYM})
    blk.add_line((5.0, 3.8), (5.0, 6.2), dxfattribs={"layer": SYM})
    for i, w in enumerate((1.6, 1.0, 0.5)):
        blk.add_line((7.0 + i * 0.7, 5.0 - w), (7.0 + i * 0.7, 5.0 + w), dxfattribs={"layer": LAYERS["pe"].name})


def _cable_head(blk: BlockLayout) -> None:
    """Cable termination: triangle on the line (IEC 60617-S00224 style)."""
    _stub(blk, 4.0, H)
    blk.add_lwpolyline([(0, 4.0), (-1.6, 0.5), (1.6, 0.5)], close=True, dxfattribs={"layer": SYM})
    _stub(blk, 0, 0.5)


def _vpis(blk: BlockLayout) -> None:
    blk.add_lwpolyline([(-3.5, 0), (3.5, 0), (3.5, 3.6), (-3.5, 3.6)], close=True, dxfattribs={"layer": SYM})
    blk.add_text("VPIS", dxfattribs={"layer": SYM, "height": 1.3, "style": "BEE-LAT"}).set_placement((0, 1.8), align=__import__("ezdxf").enums.TextEntityAlignment.MIDDLE_CENTER)


def _relay(blk: BlockLayout) -> None:
    blk.add_lwpolyline([(-3.0, 0), (3.0, 0), (3.0, 4.0), (-3.0, 4.0)], close=True, dxfattribs={"layer": SYM})
    blk.add_text("R", dxfattribs={"layer": SYM, "height": 1.8, "style": "BEE-LAT"}).set_placement((0, 2.0), align=__import__("ezdxf").enums.TextEntityAlignment.MIDDLE_CENTER)


BUILDERS = {
    "BEE_VT": _vt,
    "BEE_ES": _earthing_switch,
    "BEE_CABLE_HEAD": _cable_head,
    "BEE_VPIS": _vpis,
    "BEE_RELAY": _relay,
    "BEE_MCB_1P": lambda b: _breaker(b, 1, "mcb"),
    "BEE_MCB_2P": lambda b: _breaker(b, 2, "mcb"),
    "BEE_MCB_3P": lambda b: _breaker(b, 3, "mcb"),
    "BEE_MCB_4P": lambda b: _breaker(b, 4, "mcb"),
    "BEE_MCCB_3P": lambda b: _breaker(b, 3, "mccb"),
    "BEE_MCCB_4P": lambda b: _breaker(b, 4, "mccb"),
    "BEE_ACB_3P": lambda b: _breaker(b, 3, "acb"),
    "BEE_ACB_4P": lambda b: _breaker(b, 4, "acb"),
    "BEE_RCD_2P": lambda b: _rcd(b, 2, False),
    "BEE_RCD_4P": lambda b: _rcd(b, 4, False),
    "BEE_RCBO_1P": lambda b: _rcd(b, 1, True),
    "BEE_RCBO_2P": lambda b: _rcd(b, 2, True),
    "BEE_RCBO_4P": lambda b: _rcd(b, 4, True),
    "BEE_SW_1P": lambda b: _switch(b, 1),
    "BEE_SW_2P": lambda b: _switch(b, 2),
    "BEE_SW_3P": lambda b: _switch(b, 3),
    "BEE_SW_4P": lambda b: _switch(b, 4),
    "BEE_CONTACTOR_4P": lambda b: _contactor(b, 4),
    "BEE_FUSE": _fuse,
    "BEE_SPD": _spd,
    "BEE_METER_KWH": lambda b: _meter(b, "kWh"),
    "BEE_METER_PM": lambda b: _meter(b, "PM"),
    "BEE_CT": _ct,
    "BEE_EARTH": _earth,
    "BEE_TRANSFORMER": _transformer,
    "BEE_GENERATOR": _generator,
    "BEE_INVERTER": _inverter,
    "BEE_BATTERY": _battery,
    "BEE_PV": _pv,
    "BEE_SOCKET": _socket,
    "BEE_LOAD": _load_arrow,
    "BEE_LOCK": _lock,
    "BEE_ESTOP": _emergency,
}


def device_block_name(kind: str, poles: int) -> str:
    p = max(1, min(poles, 4))
    if kind in ("mcb", "mccb", "acb", "rcd", "rcbo", "switch"):
        prefix = {"mcb": "MCB", "mccb": "MCCB", "acb": "ACB", "rcd": "RCD", "rcbo": "RCBO", "switch": "SW"}[kind]
        if kind == "mccb" and p < 3:
            p = 3
        if kind == "acb" and p < 3:
            p = 3
        if kind == "rcd" and p not in (2, 4):
            p = 2 if p < 3 else 4
        if kind == "rcbo" and p == 3:
            p = 4
        return f"BEE_{prefix}_{p}P"
    return {
        "fuse": "BEE_FUSE",
        "spd": "BEE_SPD",
        "meter": "BEE_METER_KWH",
        "ct": "BEE_CT",
        "contactor": "BEE_CONTACTOR_4P",
        "terminal": "BEE_SW_1P",
    }.get(kind, "BEE_MCB_1P")


def ensure_symbols(doc: Drawing) -> None:
    """Define every symbol block once per document."""
    for name, builder in BUILDERS.items():
        if name in doc.blocks:
            continue
        blk = doc.blocks.new(name=name)
        builder(blk)
