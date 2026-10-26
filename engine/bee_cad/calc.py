"""Engineering calculations on the design model: cable designation parsing, current-carrying
capacity (IEC 60364-5-52 Annex B with temperature and grouping factors), voltage drop, short-circuit
currents, overload coordination, thermal withstand (k²S² ≥ I²t), PE size and IEC 81346-2 class letters.

The ampacity tables are copper (aluminium is resistive-only: voltage drop and fault currents). They are
the starting point an engineer checks, not a substitute for the engineer's own derating.
"""
from __future__ import annotations

import math
import re
from dataclasses import dataclass
from typing import Literal, Optional

from .model import Cable, Circuit, Device

Insulation = Literal["PVC", "XLPE"]

# IEC 60364-5-52 Annex B, copper, 30 °C air / 20 °C ground — {(insulation, method, loaded conductors): {mm²: A}}
# B1 conductors in conduit on/in a wall, C cable clipped to a wall, E multicore cable in free air / on a perforated
# tray, D1 cable in a duct in the ground (2.5 K·m/W). Tables B.52.2–B.52.5, B.52.10, B.52.12.
_SIZES = (1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240)
_IZ: dict[tuple[str, str, int], tuple[float, ...]] = {
    ("PVC", "B1", 2): (17.5, 24, 32, 41, 57, 76, 101, 125, 151, 192, 232, 269, 309, 353, 415),
    ("PVC", "B1", 3): (15.5, 21, 28, 36, 50, 68, 89, 110, 134, 171, 207, 239, 275, 314, 370),
    ("PVC", "C", 2): (19.5, 27, 36, 46, 63, 85, 112, 138, 168, 213, 258, 299, 344, 392, 461),
    ("PVC", "C", 3): (17.5, 24, 32, 41, 57, 76, 96, 119, 144, 184, 223, 259, 299, 341, 403),
    ("PVC", "E", 2): (22, 30, 40, 51, 70, 94, 119, 148, 180, 232, 282, 328, 379, 434, 514),
    ("PVC", "E", 3): (18.5, 25, 34, 43, 60, 80, 101, 126, 153, 196, 238, 276, 319, 364, 430),
    ("PVC", "D1", 2): (22, 29, 37, 46, 60, 78, 99, 119, 140, 173, 204, 231, 261, 292, 336),
    ("PVC", "D1", 3): (18, 24, 30, 38, 50, 64, 82, 98, 116, 143, 169, 192, 217, 243, 280),
    ("XLPE", "B1", 2): (23, 31, 42, 54, 75, 100, 133, 164, 198, 253, 306, 354, 407, 464, 546),
    ("XLPE", "B1", 3): (20, 28, 37, 48, 66, 88, 117, 144, 175, 222, 269, 312, 358, 408, 481),
    ("XLPE", "C", 2): (24, 33, 45, 58, 80, 107, 138, 171, 209, 269, 328, 382, 441, 506, 599),
    ("XLPE", "C", 3): (22, 30, 40, 52, 71, 96, 119, 147, 179, 229, 278, 322, 371, 424, 500),
    ("XLPE", "E", 2): (26, 36, 49, 63, 86, 115, 149, 185, 225, 289, 352, 410, 473, 542, 641),
    ("XLPE", "E", 3): (23, 32, 42, 54, 75, 100, 127, 158, 192, 246, 298, 346, 399, 456, 538),
    ("XLPE", "D1", 2): (25, 33, 43, 53, 71, 91, 116, 139, 164, 203, 239, 271, 306, 343, 395),
    ("XLPE", "D1", 3): (21, 28, 36, 44, 58, 75, 96, 116, 135, 167, 197, 223, 251, 281, 324),
}

RHO_CU = 0.0225   # Ω·mm²/m, copper near operating temperature
RHO_CU_20 = 0.0178                 # at 20 °C — maximum short-circuit (IEC 60909)
RHO_CU_HOT = 1.5 * RHO_CU_20       # end of fault — minimum short-circuit (CENELEC TR 50480)
RHO_AL, RHO_AL_20 = 0.036, 0.0282  # aluminium, the same three conditions
RHO_AL_HOT = 1.5 * RHO_AL_20
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


# IEC 60364-5-52 Table B.52.14 (air, reference 30 °C) and B.52.15 (ground, reference 20 °C)
_K_AMBIENT = {"PVC": {35: 0.94, 40: 0.87, 45: 0.79, 50: 0.71}, "XLPE": {35: 0.96, 40: 0.91, 45: 0.87, 50: 0.82}}
_K_GROUND = {"PVC": {25: 0.95, 30: 0.89, 35: 0.84, 40: 0.77}, "XLPE": {25: 0.96, 30: 0.93, 35: 0.89, 40: 0.85}}
METHODS = ("B1", "C", "E", "D1")

# Grouping factors by number of circuits run together — Table B.52.17 items 1 (bunched in conduit / on a surface:
# B1), 2 (single layer on a wall: C), 4 (single layer on a perforated tray: E), Table B.52.19 (cables in ducts
# touching in the ground: D1). Past the last entry the last factor holds.
_GROUPING = {
    "B1": {1: 1.0, 2: 0.80, 3: 0.70, 4: 0.65, 5: 0.60, 6: 0.57, 7: 0.54, 8: 0.52, 9: 0.50, 12: 0.45, 16: 0.41, 20: 0.38},
    "C": {1: 1.0, 2: 0.85, 3: 0.79, 4: 0.75, 5: 0.73, 6: 0.72, 7: 0.72, 8: 0.71, 9: 0.70},
    "E": {1: 1.0, 2: 0.88, 3: 0.82, 4: 0.77, 5: 0.75, 6: 0.73, 7: 0.73, 8: 0.72, 9: 0.72},
    "D1": {1: 1.0, 2: 0.85, 3: 0.75, 4: 0.70, 5: 0.65, 6: 0.60},
}


def ambient_factor(insulation: str, ambient_c: Optional[float], method: str = "C") -> float:
    ground = method == "D1"
    if not ambient_c or ambient_c <= (20 if ground else 30):
        return 1.0
    steps = (_K_GROUND if ground else _K_AMBIENT)[insulation]
    for t in sorted(steps):
        if ambient_c <= t:
            return steps[t]
    return steps[max(steps)]


def grouping_factor(method: str, circuits: Optional[int]) -> float:
    if not circuits or circuits <= 1:
        return 1.0
    table = _GROUPING.get(method, _GROUPING["B1"])
    return table[max(n for n in table if n <= circuits)]


def ampacity(spec: CableSpec, method: str, loaded: int, ambient_c: Optional[float] = None,
             grouped: Optional[int] = None) -> Optional[float]:
    """Copper only; None where the table has no value (aluminium, size or method outside the table).
    Iz = table value × temperature factor × grouping factor."""
    table = _IZ.get((spec.insulation, method, loaded))
    if table is None or spec.material != "Cu" or spec.csa_mm2 not in _SIZES:
        return None
    k = ambient_factor(spec.insulation, ambient_c, method) * grouping_factor(method, grouped)
    return round(table[_SIZES.index(spec.csa_mm2)] * k, 1)


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


def _rho(spec: CableSpec, which: str) -> float:
    """Resistivity for the condition: "op" (load, voltage drop), "cold" (20 °C, Ik max), "hot" (end of fault, Ik min)."""
    cu = {"op": RHO_CU, "cold": RHO_CU_20, "hot": RHO_CU_HOT}
    al = {"op": RHO_AL, "cold": RHO_AL_20, "hot": RHO_AL_HOT}
    return (al if spec.material == "Al" else cu)[which]


def voltage_drop_pct(cable: Cable, current_a: float, three_phase: bool, cos_phi: float = 1.0) -> Optional[float]:
    """IEC 60364-5-52 G.52.1: ΔU = b·(ρ·L/S·cos φ + λ·L·sin φ)·Ib, b = 1 three-phase (line-to-line), 2 single-phase."""
    spec = parse_cable(cable.designation)
    if spec is None or not cable.length_m:
        return None
    sin_phi = math.sqrt(max(0.0, 1 - cos_phi ** 2))
    z = _rho(spec, "op") * cable.length_m / spec.csa_mm2 * cos_phi + X_CABLE * cable.length_m * sin_phi
    if three_phase:
        return 100 * math.sqrt(3) * current_a * z / U_LL
    return 100 * 2 * current_a * z / U_PH


def source_impedance(ik_ka: float) -> float:
    """Network impedance behind the origin from the declared 3-phase fault level."""
    return C_MAX * U_LL / (math.sqrt(3) * ik_ka * 1000)


def ik3_max_ka(zs: float, cables: list[Cable]) -> float:
    r = sum(_rho(s, "cold") * (c.length_m or 0) / s.csa_mm2 for c in cables if (s := parse_cable(c.designation)))
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
        r += 2 * _rho(s, "hot") * c.length_m / s.csa_mm2
        x += 2 * X_CABLE * c.length_m
    z = math.hypot(2 * zs + r, x)
    return C_MIN * U_PH / z if z else None


def overload_ok(ib: Optional[float], i_n: Optional[float], iz: Optional[float], kind: str = "mcb") -> Optional[bool]:
    """IEC 60364-4-43 cl. 433.1: Ib ≤ In ≤ Iz and I2 ≤ 1.45·Iz. Breakers to IEC 60898 / 60947-2 trip at
    I2 = 1.45·In, so the second rule holds whenever In ≤ Iz; a gG fuse (I2 = 1.6·In) needs In ≤ 0.9·Iz."""
    if not i_n or iz is None:
        return None
    i2 = (1.6 if kind == "fuse" else 1.45) * i_n
    return (ib is None or ib <= i_n + 1e-9) and i_n <= iz + 1e-9 and i2 <= 1.45 * iz + 1e-9


# Adiabatic k (IEC 60364-4-43 Table 43A / 60364-5-54 Table A.54.3): conductor and insulation
K_ADIABATIC = {("Cu", "PVC"): 115, ("Cu", "XLPE"): 143, ("Al", "PVC"): 76, ("Al", "XLPE"): 94}

# EN 60898-1 Annex ZA, energy-limiting class 3, type C (type B is lower): maximum I²t [A²s] by prospective Ik [kA]
_I2T_CLASS3 = {16: {3: 17_000, 4.5: 28_000, 6: 40_000, 10: 80_000},
               32: {3: 20_000, 4.5: 37_000, 6: 50_000, 10: 100_000}}
T_BREAKER_S = 0.1          # MCCB / ACB without a let-through curve: the instantaneous trip, conservatively


def let_through_i2t(d: Device, ik_ka: float) -> Optional[float]:
    """Energy the device lets through on a fault of ik_ka. MCB ≤ 32A: class 3 limits (interpolated on Ik);
    MCCB / ACB: Ik²·0.1 s; None where no defensible figure exists (fuses, MCB above 32A or 10kA)."""
    if d.kind in ("mcb", "rcbo"):
        if not d.rating_a or d.rating_a > 32 or ik_ka > 10:
            return None
        row = _I2T_CLASS3[16 if d.rating_a <= 16 else 32]
        ks = sorted(row)
        if ik_ka <= ks[0]:
            return row[ks[0]] * (ik_ka / ks[0]) ** 2
        for lo, hi in zip(ks, ks[1:]):
            if ik_ka <= hi:
                return row[lo] + (row[hi] - row[lo]) * (ik_ka - lo) / (hi - lo)
    if d.kind in ("mccb", "acb"):
        return (ik_ka * 1000) ** 2 * T_BREAKER_S
    return None


def withstand_i2t(spec: CableSpec) -> float:
    """k²S² — the energy the conductor takes from operating temperature to its short-circuit limit."""
    return (K_ADIABATIC[(spec.material, spec.insulation)] * spec.csa_mm2) ** 2


def pe_min_mm2(phase_mm2: float) -> float:
    """IEC 60364-5-54 Table 54.2: PE of the same material as the line conductor."""
    if phase_mm2 <= 16:
        return phase_mm2
    if phase_mm2 <= 35:
        return 16.0
    return phase_mm2 / 2


# IEC 81346-2:2019 class letters by device kind (FA overvoltage, FB fault current, FC overcurrent);
# circuit-breakers take QA as Ecodial tags them. To be confirmed against the standard's table.
IEC_CLASS: dict[str, str] = {
    "mcb": "QA", "mccb": "QA", "acb": "QA", "rcbo": "QA", "contactor": "QA", "switch": "QB",
    "fuse": "FC", "rcd": "FB", "spd": "FA", "meter": "PG", "ct": "BE", "terminal": "XD",
}


def iec_class(d: Device) -> str:
    return IEC_CLASS.get(d.kind, "")
