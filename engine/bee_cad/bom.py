"""Bill of materials — every device in the design, grouped into identical lines with IEC 81346 class.

The BOM is read from the same model as the drawings, so the quote and the sheets cannot disagree.
"""
from __future__ import annotations

import csv
from dataclasses import dataclass, field
from pathlib import Path

from .calc import iec_class
from .model import Design, Device

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
    qty: int = 0
    tags: list[str] = field(default_factory=list)


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
            line = lines[key] = BomLine(iec_class(d), KIND_HE.get(d.kind, d.kind), _spec(d), d.manufacturer or "", d.catno or "")
        line.qty += 1
        line.tags.append(f"{board}:{d.tag}")

    for b in design.boards:
        add(b.id, b.incomer)
        add(b.id, b.spd)
        for g in b.groups:
            add(b.id, g.device)
        for c in b.all_circuits():
            add(b.id, c.device)
            add(b.id, c.rcd)
    return sorted(lines.values(), key=lambda x: (x.iec, x.item, x.spec))


def write_csv(rows: list[BomLine], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as f:   # BOM byte so Excel opens Hebrew correctly
        w = csv.writer(f)
        w.writerow(["IEC 81346", "פריט", "מפרט", "יצרן", "מק\"ט", "כמות", "תגים"])
        for r in rows:
            w.writerow([r.iec, r.item, r.spec, r.manufacturer, r.catno, r.qty, " ".join(r.tags)])
