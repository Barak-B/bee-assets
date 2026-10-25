"""Layer standard of the office (AutoCAD). Colours are ACI indices."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class LayerDef:
    name: str
    color: int
    lineweight: int  # 1/100 mm
    linetype: str = "Continuous"
    plot: bool = True


# ACI: 7 white/black, 1 red, 3 green, 5 blue, 4 cyan, 6 magenta, 8 dark grey, 9 light grey, 2 yellow
LAYERS: dict[str, LayerDef] = {
    "frame": LayerDef("BEE-FRAME", 7, 50),
    "frame_text": LayerDef("BEE-FRAME-TEXT", 7, 18),
    "grid": LayerDef("BEE-FRAME-GRID", 8, 13),
    "sld_main": LayerDef("BEE-SLD-MAIN", 7, 50),       # main circuit lines
    "sld_sec": LayerDef("BEE-SLD-SEC", 7, 25),         # final circuits
    "sld_bus": LayerDef("BEE-SLD-BUS", 7, 100),        # busbars
    "sld_sym": LayerDef("BEE-SLD-SYM", 7, 35),         # device symbols
    "sld_text": LayerDef("BEE-SLD-TEXT", 7, 18),
    "sld_tag": LayerDef("BEE-SLD-TAG", 7, 25),
    "sld_board": LayerDef("BEE-SLD-BOARD", 7, 25, "DASHDOT"),  # board frames
    "pe": LayerDef("BEE-PE", 3, 50),                   # protective earth, green
    "n": LayerDef("BEE-N", 5, 35),                     # neutral, blue
    "dc_pos": LayerDef("BEE-DC-POS", 1, 50),
    "dc_neg": LayerDef("BEE-DC-NEG", 7, 50),
    "ac": LayerDef("BEE-AC", 5, 50),
    "comm": LayerDef("BEE-COMM", 6, 18, "DASHED"),
    "existing": LayerDef("BEE-EXISTING", 8, 25, "DASHED"),
    "panel_encl": LayerDef("BEE-PANEL-ENCL", 7, 50),
    "panel_rail": LayerDef("BEE-PANEL-RAIL", 8, 25),
    "panel_dev": LayerDef("BEE-PANEL-DEV", 7, 35),
    "panel_text": LayerDef("BEE-PANEL-TEXT", 7, 18),
    "dim": LayerDef("BEE-DIM", 8, 13),
    "hatch": LayerDef("BEE-HATCH", 9, 13),
    "legend": LayerDef("BEE-LEGEND", 7, 18),
    "notes": LayerDef("BEE-NOTES", 7, 18),
    "pv_module": LayerDef("BEE-PV-MODULE", 7, 25),
    "pv_string": LayerDef("BEE-PV-STRING", 1, 70),
    "pv_roof": LayerDef("BEE-PV-ROOF", 8, 35),
}

STRING_COLORS = [1, 3, 5, 6, 4, 30, 200, 32]  # S1 red, S2 green, S3 blue, S4 magenta, S5 cyan, S6 orange, S7 violet, S8 brown


def ensure_layers(doc) -> None:
    lt = doc.linetypes
    for name in ("DASHED", "DASHDOT", "CENTER", "HIDDEN"):
        if name not in lt:
            try:
                from ezdxf.tools.standards import linetypes as std

                for ltname, desc, pattern in std():
                    if ltname == name:
                        lt.add(ltname, pattern, description=desc)
            except Exception:  # pragma: no cover
                pass
    for ld in LAYERS.values():
        if ld.name in doc.layers:
            continue
        layer = doc.layers.add(ld.name, color=ld.color, linetype=ld.linetype)
        layer.dxf.lineweight = ld.lineweight
        if not ld.plot:
            layer.dxf.plot = 0
