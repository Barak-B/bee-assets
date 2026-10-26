"""Bill of materials — every device in the design, grouped into identical lines with IEC 81346 class.

The BOM is read from the same model as the drawings, so the quote and the sheets cannot disagree.
"""
from __future__ import annotations

import csv
import math
from dataclasses import dataclass, field
from pathlib import Path

from .calc import iec_class
from .model import Cable, Design, Device
from .pv import FUSE_FROM_STRINGS, string_fuse_a

CABLE_RESERVE = 1.1       # cable length bought = route length + 10%

KIND_HE = {
    "mcb": "מפסק זעיר", "mccb": "מפסק יצוק", "acb": "מפסק אוויר", "rcd": "מפסק פחת", "rcbo": "מפסק זעיר משולב פחת",
    "switch": "מנתק", "fuse": "נתיך", "spd": "מגן מתח יתר", "meter": "מונה", "ct": "משנה זרם",
    "contactor": "מגען", "terminal": "מהדק",
}


@dataclass
class BomLine:
    iec: str
    item: str
    spec: str
    manufacturer: str
    catno: str
    qty: float = 0
    tags: list[str] = field(default_factory=list)
    unit: str = "יח'"
    kind: str = ""          # device kind / "cable" / "enclosure" / "pv_module" / "inverter" / "dc_switch" / "fuse"


def _spec(d: Device) -> str:
    if d.kind == "spd":
        return " ".join(filter(None, [f"{d.poles}P", d.note]))
    return " ".join(d.model_copy(update={"note": None}).label_lines())


def bom(design: Design) -> list[BomLine]:
    lines: dict[tuple[str, ...], BomLine] = {}

    def add(board: str, d: Device | None) -> None:
        if d is None:
            return
        key = (d.kind, _spec(d), d.manufacturer or "", d.catno or "")
        line = lines.get(key)
        if line is None:
            line = lines[key] = BomLine(iec_class(d), KIND_HE.get(d.kind, d.kind), _spec(d), d.manufacturer or "", d.catno or "",
                                        kind=d.kind)
        line.qty += 1
        line.tags.append(f"{board}:{d.tag}")

    def other(kind: str, iec: str, item: str, spec: str, qty: float, tag: str, unit: str = "יח'") -> None:
        key = (kind, spec, "", "")
        line = lines.get(key)
        if line is None:
            line = lines[key] = BomLine(iec, item, spec, "", "", unit=unit, kind=kind)
        line.qty += qty
        if tag:
            line.tags.append(tag)

    def cable(where: str, c: Cable | None) -> None:
        if c is None or not c.length_m:
            return
        # +10% for routing and terminations, whole metres
        other("cable", "WD", "כבל", c.designation, math.ceil(c.length_m * CABLE_RESERVE), where, "מ'")

    for b in design.boards:
        if not b.existing:
            add(b.id, b.incomer)
        add(b.id, b.spd)
        for g in b.groups:
            add(b.id, g.device)
        for c in b.all_circuits():
            add(b.id, c.device)
            add(b.id, c.rcd)
            cable(f"{b.id}:{c.tag}", c.cable)
        if b.supply.kind == "utility" and not b.existing:
            cable(f"{b.id}:הזנה", b.supply.cable)
        if b.enclosure and not b.existing:
            e = b.enclosure
            other("enclosure", "UB", "ארון לוח", f"{e.model} {e.width_mm:g}×{e.height_mm:g}×{e.depth_mm:g} {e.ip}", 1, b.id)
    for n in design.nodes:
        add(n.id, n.device)
    pv = design.pv
    if pv:
        m, inv = pv.module, pv.inverter
        other("pv_module", "GA", "פאנל סולארי", f"{m.wp:g}W Voc {m.voc:g}V Isc {m.isc:g}A", pv.modules_total(), "PV")
        other("inverter", "TB", "ממיר", inv.model if "kw" in inv.model.lower() else " ".join(filter(None, [inv.model, f"{inv.kw:g} kW"])), max(1, inv.count), "INV")
        for st in pv.strings:
            other("dc_switch", "QB", "מנתק DC", "2P 1000V DC", 1, f"MPPT{st.mppt}")
            if st.count >= FUSE_FROM_STRINGS:
                fuse = string_fuse_a(m)
                other("fuse", "FC", "נתיך מחרוזת", f"gPV {fuse}A 1000V DC" if fuse else "gPV 1000V DC", 2 * st.count,
                      f"MPPT{st.mppt}")
            other("connector", "XD", "זוג מחברים MC4", "1500V DC", 2 * st.count, f"MPPT{st.mppt}")
            length = st.length_m or pv.dc_length_m
            if length:
                other("cable", "WD", "כבל סולארי", f"H1Z2Z2-K 1X{pv.dc_cable_mm2:g}",
                      math.ceil(2 * length * st.count * CABLE_RESERVE), f"MPPT{st.mppt}", "מ'")
    return sorted(lines.values(), key=lambda x: (x.iec, x.item, x.spec))


def write_csv(rows: list[BomLine], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as f:   # BOM byte so Excel opens Hebrew correctly
        w = csv.writer(f)
        w.writerow(["IEC 81346", "פריט", "מפרט", "יצרן", "מק\"ט", "כמות", "יחידה", "תגים"])
        for r in rows:
            w.writerow([r.iec, r.item, r.spec, r.manufacturer, r.catno, f"{r.qty:g}", r.unit, " ".join(r.tags)])
