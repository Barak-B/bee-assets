"""Cable schedule (טבלת כבלים) — every AC and DC cable of the design with the numbers that sized it.

One row per cable: where it runs, its type, installation method and derating, design current, protective
device, capacity after derating, voltage drop and whether it withstands the fault energy its device lets
through. The DC rows are the string cables from bee_cad.pv. Exported as CSV for the office and the installer.
"""
from __future__ import annotations

import csv
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Optional

from .calc import (METHOD_NAMES, board_origins, ampacity, design_current, group_factor, ambient_factor, ik3_max_ka, let_through_i2t,
                   loaded_conductors, node_kw, parse_cable, source_impedance, voltage_drop_pct, withstand_i2t)
from .checks import _method, check
from .model import Cable, Design, Device
from .pv import SOLAR_CABLE_IZ, dc_rows, string_cable_need_a


@dataclass
class CableRow:
    ref: str              # "MDB:Q-INV"
    route: str            # "MDB → INV1"
    designation: str
    kind: str             # "AC" / "DC"
    method: str
    length_m: Optional[float]
    k_total: Optional[float]
    ib_a: Optional[float]
    in_a: Optional[float]
    iz_a: Optional[float]
    du_pct: Optional[float]
    ik_ka: Optional[float]
    thermal_ok: Optional[bool]

    @property
    def ok(self) -> bool:
        cap = self.iz_a is None or (self.in_a or self.ib_a or 0) <= self.iz_a
        return cap and self.thermal_ok is not False


def _ac_row(ref: str, route: str, cable: Cable, d: Optional[Device], ib: Optional[float], three: bool, loaded: int,
            method: str, ik_ka: Optional[float]) -> CableRow:
    spec = parse_cable(cable.designation)
    iz = ampacity(spec, method, loaded, cable.ambient_c, cable.grouped) if spec else None
    k = (ambient_factor(spec.insulation, cable.ambient_c, method) * group_factor(method, cable.grouped)) if spec else None
    du = voltage_drop_pct(cable, ib, three) if ib else None
    thermal = None
    if spec and d and ik_ka:
        i2t = let_through_i2t(d, ik_ka)
        thermal = None if i2t is None else withstand_i2t(spec) >= i2t
    return CableRow(ref, route, cable.designation, "AC", method, cable.length_m, round(k, 2) if k else None,
                    round(ib, 1) if ib else None, d.rating_a if d else None, iz, round(du, 2) if du is not None else None,
                    round(ik_ka, 2) if ik_ka else None, thermal)


def cable_rows(design: Design) -> list[CableRow]:
    work = design.model_copy(deep=True)
    check(work)
    nodes = {n.id: n for n in work.nodes}
    rows: list[CableRow] = []
    origins = board_origins(work)
    for b in work.boards:
        o = origins.get(b.id)
        ik = ik3_max_ka(o.zs, o.cables) if o and o.ik_known else None
        if b.supply.cable and not b.existing:
            cab = b.supply.cable
            src = "מונה" if b.supply.kind in ("utility", "transformer") else (b.supply.from_board or b.supply.label)
            rows.append(_ac_row(f"{b.id}:הזנה", f"{src} → {b.id}", cab, b.incomer,
                                b.incomer.rating_a if b.incomer else None, True, 3,
                                cab.method if cab.method in METHOD_NAMES else "C", b.supply.ik_ka))
        for c in b.all_circuits():
            if not c.cable:
                continue
            node = nodes.get(c.to_node or "")
            ib = design_current(c, node_kw(node.rating) if node else None)
            to = c.to_board or c.to_node or c.load or c.tag
            rows.append(_ac_row(f"{b.id}:{c.tag}", f"{b.id} → {to}", c.cable, c.device, ib,
                                c.phase == "L1-3" or c.device.poles >= 3, loaded_conductors(c.phase, c.device.poles),
                                _method(c), ik))
    pv = work.pv
    if pv:
        for r in dc_rows(pv):
            rows.append(CableRow(f"PV:MPPT{r.mppt}", f"{r.face or 'מערך'} → INV{r.inverter} MPPT{r.mppt}",
                                 f"H1Z2Z2-K 1X{r.cable_mm2:g}", "DC", "EN 50618", r.length_m, None,
                                 round(string_cable_need_a(pv, r.strings), 1), r.fuse_a,
                                 SOLAR_CABLE_IZ.get(r.cable_mm2), r.du_pct, None, None))
    return rows


HEADER = ["מזהה", "תוואי", "כבל", "AC/DC", "שיטת התקנה", "אורך [מ']", "מקדם הורדה", "Ib [A]", "In [A]", "Iz [A]",
          "ΔU %", "Ik בתחילת הכבל [kA]", "עמידות בקצר", "תקין"]


def _cell(v: object) -> str:
    if v is None:
        return ""
    if isinstance(v, bool):
        return "כן" if v else "לא"
    return f"{v:g}" if isinstance(v, float) else str(v)


def write_cables_csv(rows: list[CableRow], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(HEADER)
        for r in rows:
            method = f"{r.method} {METHOD_NAMES[r.method]}" if r.method in METHOD_NAMES else r.method
            w.writerow([r.ref, r.route, r.designation, r.kind, method] +
                       [_cell(x) for x in (r.length_m, r.k_total, r.ib_a, r.in_a, r.iz_a, r.du_pct, r.ik_ka, r.thermal_ok)] +
                       ["כן" if r.ok else "לבדוק"])


def as_dicts(rows: list[CableRow]) -> list[dict]:
    return [{**asdict(r), "ok": r.ok} for r in rows]
