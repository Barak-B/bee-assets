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
RHO_CU_20 = 0.0178                 # at 20 °C — maximum short-circuit (IEC 60909)
RHO_CU_HOT = 1.5 * RHO_CU_20       # end of fault — minimum short-circuit (CENELEC TR 50480)
X_CABLE = 0.08e-3                  # Ω/m per conductor, multicore LV cable
C_MAX, C_MIN = 1.1, 0.95           # IEC 60909 voltage factors, LV
TRIP_MULTIPLE = {"B": 5, "C": 10, "D": 20}   # upper edge of the magnetic band, IEC 60898-1
U_PH = 230.0
U_LL = 400.0

_DESIG = re.compile(r"(\d+)\s*[xX×gG]\s*(\d+(?:[.,]\d+)?)")


@dataclass
class CableSpec:
    cores: int
    csa_mm2: float
    insulation: Insulation
    material: Literal["Cu", "Al"] = "Cu"


def parse_cable(designation: str) -> Optional[CableSpec]:
    """'3X2.5' / '3x1,5' / 'H07RN-F 3G2.5' → PVC; 'N2XY 4X10' / '5X6mm² Cu XLPE' → XLPE; 'NA2XY' / 'Al' → aluminium.
    Returns None for MV / parallel single-core designations the table does not cover."""
    s = designation or ""
    if "(" in s:
        return None
    m = _DESIG.search(s)
    if not m:
        return None
    u = s.upper()
    ins: Insulation = "XLPE" if any(k in u for k in ("N2X", "NA2X", "XLPE", "2XY")) else "PVC"
    al = bool(re.search(r"\bAL\b", u) or "NA2X" in u or "NAYY" in u)
    return CableSpec(int(m.group(1)), float(m.group(2).replace(",", ".")), ins, "Al" if al else "Cu")


def loaded_conductors(phase: str, poles: int) -> int:
    return 3 if phase == "L1-3" or poles >= 3 else 2


# IEC 60364-5-52 Table B.52.14, ambient air temperature other than 30 °C
_K_AMBIENT = {"PVC": {35: 0.94, 40: 0.87, 45: 0.79, 50: 0.71}, "XLPE": {35: 0.96, 40: 0.91, 45: 0.87, 50: 0.82}}
METHODS = ("B1", "C")


def ambient_factor(insulation: str, ambient_c: Optional[float]) -> float:
    if not ambient_c or ambient_c <= 30:
        return 1.0
    steps = _K_AMBIENT[insulation]
    for t in sorted(steps):
        if ambient_c <= t:
            return steps[t]
    return steps[max(steps)]


def ampacity(spec: CableSpec, method: str, loaded: int, ambient_c: Optional[float] = None) -> Optional[float]:
    """Copper only; None where the table has no value (aluminium, size or method outside the table)."""
    table = _IZ.get((spec.insulation, method, loaded))
    if table is None or spec.material != "Cu" or spec.csa_mm2 not in _SIZES:
        return None
    return round(table[_SIZES.index(spec.csa_mm2)] * ambient_factor(spec.insulation, ambient_c), 1)


def design_current(c: Circuit, kw: Optional[float] = None) -> Optional[float]:
    """Load current from load_kw (or the fed node's kW, e.g. the inverter) at cos φ 1, else the device rating."""
    three = c.phase == "L1-3" or c.device.poles >= 3
    kw = c.load_kw or kw
    if kw:
        return kw * 1000 / (math.sqrt(3) * U_LL if three else U_PH)
    return c.device.rating_a


def node_kw(rating: str) -> Optional[float]:
    m = re.search(r"(\d+(?:\.\d+)?)\s*kW\b", rating or "")
    return float(m.group(1)) if m else None


def voltage_drop_pct(cable: Cable, current_a: float, three_phase: bool) -> Optional[float]:
    spec = parse_cable(cable.designation)
    if spec is None or not cable.length_m:
        return None
    r = RHO_CU * cable.length_m / spec.csa_mm2
    if three_phase:
        return 100 * math.sqrt(3) * current_a * r / U_LL
    return 100 * 2 * current_a * r / U_PH


def source_impedance(ik_ka: float) -> float:
    """Network impedance behind the origin from the declared 3-phase fault level."""
    return C_MAX * U_LL / (math.sqrt(3) * ik_ka * 1000)


def ik3_max_ka(zs: float, cables: list[Cable]) -> float:
    r = sum(RHO_CU_20 * (c.length_m or 0) / s.csa_mm2 for c in cables if (s := parse_cable(c.designation)))
    x = sum(X_CABLE * (c.length_m or 0) for c in cables)
    z = math.hypot(zs + r, x) if r or x else zs
    return C_MAX * U_LL / (math.sqrt(3) * z) / 1000


def ik1_min_a(zs: float, cables: list[Cable]) -> Optional[float]:
    """Phase–protective-conductor fault at the far end (TN): source loop + out and back in every cable."""
    r = 0.0
    x = 0.0
    for c in cables:
        s = parse_cable(c.designation)
        if s is None or not c.length_m:
            return None
        r += 2 * RHO_CU_HOT * c.length_m / s.csa_mm2
        x += 2 * X_CABLE * c.length_m
    z = math.hypot(2 * zs + r, x)
    return C_MIN * U_PH / z if z else None


# IEC 81346-2:2019 class letters by device kind (FA overvoltage, FB fault current, FC overcurrent);
# circuit-breakers take QA as Ecodial tags them. To be confirmed against the standard's table.
IEC_CLASS: dict[str, str] = {
    "mcb": "QA", "mccb": "QA", "acb": "QA", "rcbo": "QA", "contactor": "QA", "switch": "QB",
    "fuse": "FC", "rcd": "FB", "spd": "FA", "meter": "PG", "ct": "BE", "terminal": "XD",
}


def iec_class(d: Device) -> str:
    return IEC_CLASS.get(d.kind, "")
