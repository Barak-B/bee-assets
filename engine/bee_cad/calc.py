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

# IEC 60364-5-52 Annex B, copper — {(insulation, method, loaded conductors): {mm²: A}}. Air methods at 30 °C,
# D1 (multicore in a duct in the ground) at 20 °C soil and 2.5 K·m/W. B1 conductors in conduit, C clipped
# to a wall, E multicore in free air / on a perforated tray.
_SIZES = (1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240)
_IZ: dict[tuple[str, str, int], tuple[float, ...]] = {
    ("PVC", "B1", 2): (17.5, 24, 32, 41, 57, 76, 101, 125, 151, 192, 232, 269, 309, 353, 415),
    ("PVC", "B1", 3): (15.5, 21, 28, 36, 50, 68, 89, 110, 134, 171, 207, 239, 275, 314, 370),
    ("PVC", "C", 2): (19.5, 27, 36, 46, 63, 85, 112, 138, 168, 213, 258, 299, 344, 392, 461),
    ("PVC", "C", 3): (17.5, 24, 32, 41, 57, 76, 96, 119, 144, 184, 223, 259, 299, 341, 403),
    ("PVC", "E", 2): (22, 30, 40, 51, 70, 94, 119, 148, 180, 232, 282, 328, 379, 434, 514),
    ("PVC", "E", 3): (18.5, 25, 34, 43, 60, 80, 101, 126, 153, 196, 238, 276, 319, 364, 430),
    ("PVC", "D1", 2): (22, 29, 38, 47, 63, 81, 104, 125, 148, 183, 216, 246, 278, 312, 361),
    ("PVC", "D1", 3): (18, 24, 31, 39, 52, 67, 86, 103, 122, 151, 179, 203, 230, 258, 297),
    ("XLPE", "B1", 2): (23, 31, 42, 54, 75, 100, 133, 164, 198, 253, 306, 354, 406, 463, 546),
    ("XLPE", "B1", 3): (20, 28, 37, 48, 66, 88, 117, 144, 175, 222, 269, 312, 356, 405, 476),
    ("XLPE", "C", 2): (24, 33, 45, 58, 80, 107, 138, 171, 209, 269, 328, 382, 441, 506, 599),
    ("XLPE", "C", 3): (22, 30, 40, 52, 71, 96, 119, 147, 179, 229, 278, 322, 371, 424, 500),
    ("XLPE", "E", 2): (26, 36, 49, 63, 86, 115, 149, 185, 225, 289, 352, 410, 473, 542, 641),
    ("XLPE", "E", 3): (23, 32, 42, 54, 75, 100, 127, 158, 192, 246, 298, 346, 399, 456, 538),
    ("XLPE", "D1", 2): (25, 33, 43, 53, 71, 91, 116, 139, 164, 203, 239, 271, 306, 343, 395),
    ("XLPE", "D1", 3): (21, 28, 36, 44, 58, 75, 96, 115, 135, 167, 197, 223, 251, 281, 324),
}
AL_FACTOR = 0.78          # aluminium ≈ 0.78 × copper of the same size (16 mm² and up); an estimate to confirm

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


# IEC 60364-5-52 Table B.52.14, ambient air other than 30 °C; Table B.52.15, soil other than 20 °C (method D1)
_K_AMBIENT = {"PVC": {35: 0.94, 40: 0.87, 45: 0.79, 50: 0.71, 55: 0.61, 60: 0.50},
              "XLPE": {35: 0.96, 40: 0.91, 45: 0.87, 50: 0.82, 55: 0.76, 60: 0.71, 65: 0.65, 70: 0.58}}
_K_SOIL = {"PVC": {25: 0.95, 30: 0.89, 35: 0.84, 40: 0.77}, "XLPE": {25: 0.96, 30: 0.93, 35: 0.89, 40: 0.85}}
# IEC 60364-5-52 Table B.52.17: circuits bunched (row 1) or one layer on a perforated tray (row 4)
_K_GROUP = {"bunched": {1: 1.0, 2: 0.80, 3: 0.70, 4: 0.65, 5: 0.60, 6: 0.57, 7: 0.54, 8: 0.52, 9: 0.50, 12: 0.45,
                        16: 0.41, 20: 0.38},
            "tray": {1: 1.0, 2: 0.88, 3: 0.82, 4: 0.77, 5: 0.75, 6: 0.73, 7: 0.73, 8: 0.72, 9: 0.72}}
METHODS = ("B1", "C", "E", "D1")
METHOD_NAMES = {"B1": "מוליכים בצינור", "C": "כבל על קיר", "E": "כבל על סולם/מגש מחורר", "D1": "כבל בצינור בקרקע"}


def _step(table: dict[int, float], value: float) -> float:
    for t in sorted(table):
        if value <= t:
            return table[t]
    return table[max(table)]


def ambient_factor(insulation: str, ambient_c: Optional[float], method: str = "C") -> float:
    if method == "D1":
        return 1.0 if not ambient_c or ambient_c <= 20 else _step(_K_SOIL[insulation], ambient_c)
    if not ambient_c or ambient_c <= 30:
        return 1.0
    return _step(_K_AMBIENT[insulation], ambient_c)


def group_factor(method: str, grouped: Optional[int]) -> float:
    """Reduction for circuits run together; method E on a tray uses the tray row, everything else 'bunched'."""
    if not grouped or grouped <= 1:
        return 1.0
    return _step(_K_GROUP["tray" if method == "E" else "bunched"], grouped)


def ampacity(spec: CableSpec, method: str, loaded: int, ambient_c: Optional[float] = None,
             grouped: Optional[int] = None) -> Optional[float]:
    """Iz after the temperature and grouping factors; None where the table has no value."""
    table = _IZ.get((spec.insulation, method, loaded))
    if table is None or spec.csa_mm2 not in _SIZES or (spec.material == "Al" and spec.csa_mm2 < 16):
        return None
    base = table[_SIZES.index(spec.csa_mm2)] * (AL_FACTOR if spec.material == "Al" else 1.0)
    return round(base * ambient_factor(spec.insulation, ambient_c, method) * group_factor(method, grouped), 1)


def cable_iz(cable: Cable, method: str, loaded: int) -> Optional[float]:
    spec = parse_cable(cable.designation)
    return ampacity(spec, method, loaded, cable.ambient_c, cable.grouped) if spec else None


# Adiabatic short-circuit withstand, IEC 60364-4-43 §434.5.2: k² S² ≥ I² t.  k by conductor / insulation (Table 43A).
K_ADIABATIC = {("Cu", "PVC"): 115, ("Cu", "XLPE"): 143, ("Al", "PVC"): 76, ("Al", "XLPE"): 94}
# Let-through energy I²t [A²s] of an energy-limiting class 3 MCB (EN 60898-1 Annex ZA) by prospective kA,
# ≤16 A and 20–32 A; above 32 A, MCCBs and fuses-free feeders: a non-limiting clearing time.
_MCB_I2T = {16: ((3, 15e3), (4.5, 25e3), (6, 35e3), (10, 70e3)), 32: ((3, 18e3), (4.5, 32e3), (6, 45e3), (10, 90e3))}
T_CLEAR_S = {"mcb": 0.01, "rcbo": 0.01, "mccb": 0.02, "acb": 0.05, "fuse": 0.01}


def let_through_i2t(d: Device, ik_ka: float) -> Optional[float]:
    if not d.rating_a or ik_ka <= 0:
        return None
    if d.kind in ("mcb", "rcbo") and d.rating_a <= 32:
        steps = _MCB_I2T[16 if d.rating_a <= 16 else 32]
        for ka, e in steps:
            if ik_ka <= ka:
                return e
        return steps[-1][1] * (ik_ka / steps[-1][0]) ** 2
    t = T_CLEAR_S.get(d.kind)
    return (ik_ka * 1000) ** 2 * t if t else None


def withstand_i2t(spec: CableSpec) -> float:
    k = K_ADIABATIC[(spec.material, spec.insulation)]
    return (k * spec.csa_mm2) ** 2


def min_csa_for(i2t: float, spec: CableSpec) -> float:
    k = K_ADIABATIC[(spec.material, spec.insulation)]
    return math.sqrt(i2t) / k


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


RHO_AL = 0.036    # Ω·mm²/m, aluminium near operating temperature


def voltage_drop_pct(cable: Cable, current_a: float, three_phase: bool) -> Optional[float]:
    spec = parse_cable(cable.designation)
    if spec is None or not cable.length_m:
        return None
    r = (RHO_AL if spec.material == "Al" else RHO_CU) * cable.length_m / spec.csa_mm2
    if three_phase:
        return 100 * math.sqrt(3) * current_a * r / U_LL
    return 100 * 2 * current_a * r / U_PH


def source_impedance(ik_ka: float) -> float:
    """Network impedance behind the origin from the declared 3-phase fault level."""
    return C_MAX * U_LL / (math.sqrt(3) * ik_ka * 1000)


RHO_AL_20 = 0.0282


def _rho20(spec: CableSpec) -> float:
    return RHO_AL_20 if spec.material == "Al" else RHO_CU_20


def ik3_max_ka(zs: float, cables: list[Cable]) -> float:
    r = sum(_rho20(s) * (c.length_m or 0) / s.csa_mm2 for c in cables if (s := parse_cable(c.designation)))
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
        r += 2 * 1.5 * _rho20(s) * c.length_m / s.csa_mm2
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


@dataclass
class Origin:
    """What feeds a board, traced back to the utility: source impedance, cables in series, earthing system."""
    zs: float
    cables: list[Cable]
    ik_known: bool
    earthing: str


def board_origins(design) -> dict[str, Origin]:
    """Every board reached from a utility/transformer supply, through the feeders of the boards above it."""
    boards = {b.id: b for b in design.boards}
    out: dict[str, Origin] = {}

    def walk(bid: str, seen: frozenset[str]) -> Optional[Origin]:
        if bid in out:
            return out[bid]
        b = boards.get(bid)
        if b is None or bid in seen:
            return None
        sup = b.supply
        if sup.kind in ("utility", "transformer"):
            up = [sup.cable] if sup.cable and sup.cable.length_m else []
            o = Origin(source_impedance(sup.ik_ka) if sup.ik_ka else 0.0, up, bool(sup.ik_ka), sup.earthing)
        elif sup.kind == "board" and sup.from_board:
            parent = walk(sup.from_board, seen | {bid})
            feeder = next((c for c in boards[sup.from_board].all_circuits() if c.to_board == bid), None) \
                if parent and sup.from_board in boards else None
            if parent is None or feeder is None or not feeder.cable or not feeder.cable.length_m:
                return None
            o = Origin(parent.zs, parent.cables + [feeder.cable], parent.ik_known, parent.earthing)
        else:
            return None
        out[bid] = o
        return o

    for b in design.boards:
        walk(b.id, frozenset())
    return out
