"""Engineering calculations on the design model: cable designation parsing, current-carrying
capacity (IEC 60364-5-52 Annex B), voltage drop, and IEC 81346-2 class letters.

The ampacity tables are copper, 30 °C ambient, a single circuit (no grouping factor). They are
the starting point an engineer checks, not a substitute for the engineer's own derating.
"""
from __future__ import annotations

import math
import re
from dataclasses import dataclass
from typing import Literal, Optional

from .model import Cable, Circuit, Device

Insulation = Literal["PVC", "XLPE"]

# IEC 60364-5-52 Annex B, copper, 30 °C — {(insulation, method, loaded conductors): {mm²: A}}
_SIZES = (1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120)
_IZ: dict[tuple[str, str, int], tuple[float, ...]] = {
    ("PVC", "B1", 2): (17.5, 24, 32, 41, 57, 76, 101, 125, 151, 192, 232, 269),
    ("PVC", "B1", 3): (15.5, 21, 28, 36, 50, 68, 89, 110, 134, 171, 207, 239),
    ("PVC", "C", 2): (19.5, 27, 36, 46, 63, 85, 112, 138, 168, 213, 258, 299),
    ("PVC", "C", 3): (17.5, 24, 32, 41, 57, 76, 96, 119, 144, 184, 223, 259),
    ("XLPE", "B1", 2): (23, 31, 42, 54, 75, 100, 133, 164, 198, 253, 306, 354),
    ("XLPE", "B1", 3): (20, 28, 37, 48, 66, 88, 117, 144, 175, 222, 269, 312),
    ("XLPE", "C", 2): (24, 33, 45, 58, 80, 107, 138, 171, 209, 269, 328, 382),
    ("XLPE", "C", 3): (22, 30, 40, 52, 71, 96, 119, 147, 179, 229, 278, 322),
}

RHO_CU = 0.0225   # Ω·mm²/m, copper near operating temperature
U_PH = 230.0
U_LL = 400.0

_DESIG = re.compile(r"(\d+)\s*[xX×]\s*(\d+(?:\.\d+)?)")


@dataclass
class CableSpec:
    cores: int
    csa_mm2: float
    insulation: Insulation


def parse_cable(designation: str) -> Optional[CableSpec]:
    """'3X2.5' → 3 cores 2.5 mm² PVC; 'N2XY 4X10' / '5X6mm² Cu XLPE' → XLPE.
    Returns None for MV / parallel single-core designations the table does not cover."""
    s = designation or ""
    if "(" in s or re.search(r"\bAl\b", s):
        return None
    m = _DESIG.search(s)
    if not m:
        return None
    u = s.upper()
    ins: Insulation = "XLPE" if any(k in u for k in ("N2X", "XLPE", "2XY")) else "PVC"
    return CableSpec(int(m.group(1)), float(m.group(2)), ins)


def loaded_conductors(phase: str, poles: int) -> int:
    return 3 if phase == "L1-3" or poles >= 3 else 2


def ampacity(spec: CableSpec, method: str, loaded: int) -> Optional[float]:
    table = _IZ.get((spec.insulation, method, loaded))
    if table is None or spec.csa_mm2 not in _SIZES:
        return None
    return table[_SIZES.index(spec.csa_mm2)]


def design_current(c: Circuit) -> Optional[float]:
    """Load current from load_kw (cos φ 1), else the protective device rating."""
    three = c.phase == "L1-3" or c.device.poles >= 3
    if c.load_kw:
        return c.load_kw * 1000 / (math.sqrt(3) * U_LL if three else U_PH)
    return c.device.rating_a


def voltage_drop_pct(cable: Cable, current_a: float, three_phase: bool) -> Optional[float]:
    spec = parse_cable(cable.designation)
    if spec is None or not cable.length_m:
        return None
    r = RHO_CU * cable.length_m / spec.csa_mm2
    if three_phase:
        return 100 * math.sqrt(3) * current_a * r / U_LL
    return 100 * 2 * current_a * r / U_PH


# IEC 81346-2 class letters by device kind; breakers take QA as Ecodial tags them
IEC_CLASS: dict[str, str] = {
    "mcb": "QA", "mccb": "QA", "acb": "QA", "rcbo": "QA", "contactor": "QA", "switch": "QB",
    "fuse": "FA", "rcd": "FB", "spd": "FC", "meter": "PG", "ct": "BE", "terminal": "XD",
}


def iec_class(d: Device) -> str:
    return IEC_CLASS.get(d.kind, "")
