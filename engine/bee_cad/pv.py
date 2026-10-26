"""PV DC side — string voltage window, MPPT current and DC/AC ratio.

The same rules and defaults as the app's string sizing (B.E.E packages/quote-engine/src/string-sizing.ts),
so a quote and its drawings cannot disagree about the strings:
  - Voc at the coldest dawn (−3 °C, β Voc) ≤ the inverter's max DC voltage;
  - Vmp at that cold (β Voc) ≤ MPPT max;  Vmp on a hot roof (70 °C cell, γ Pmax as stand-in) ≥ MPPT min;
  - parallel strings per MPPT ≤ min(strings_per_mppt, floor(I_mppt_max / Imp));
  - DC/AC between 1.0 and 1.35 (target 1.2).
The values are defaults to check against the real datasheets.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Optional

from .model import PvArray, PvModule

T_MIN_C = -3.0            # coldest dawn, inland Israel
T_CELL_MAX_C = 70.0       # hottest cell on a summer roof
T_STC_C = 25.0
DC_AC_MIN, DC_AC_TARGET, DC_AC_MAX = 1.0, 1.2, 1.35
FUSE_FROM_STRINGS = 3     # string fuses from three parallel strings (IEC 60364-7-712)
DC_DROP_PCT = 1.5         # string cable voltage drop at Imp, of the string Vmp (design target ~1 %)
RHO_DC = 0.0225           # Ω·mm²/m, tinned copper at ~70 °C on a roof (≈ 0.0178 × 1.25)
# EN 50618 Annex A (H1Z2Z2-K, 60 °C ambient, 120 °C conductor), single cable on a surface
SOLAR_CABLE_IZ = {1.5: 30, 2.5: 39, 4: 52, 6: 67, 10: 93, 16: 125, 25: 167, 35: 207}
GPV_FUSES = (10, 12, 15, 16, 20, 25, 30, 32, 35, 40)


@dataclass
class StringVolts:
    voc_cold: float
    vmp_cold: float
    vmp_hot: float


def module_volts(m: PvModule) -> StringVolts:
    """Per-module voltages at the temperature extremes."""
    cold = 1 + (m.beta_voc_pct / 100) * (T_MIN_C - T_STC_C)
    hot = 1 + (m.gamma_pmax_pct / 100) * (T_CELL_MAX_C - T_STC_C)
    return StringVolts(m.voc * cold, m.vmp * cold, m.vmp * hot)


def string_window(pv: PvArray) -> tuple[Optional[int], Optional[int]]:
    """(shortest, longest) string the inverter accepts, None where the limit is unknown."""
    v = module_volts(pv.module)
    inv = pv.inverter
    longs = [math.floor(x / y) for x, y in ((inv.vdc_max, v.voc_cold), (inv.mppt_max, v.vmp_cold)) if x]
    return (math.ceil(inv.mppt_min / v.vmp_hot) if inv.mppt_min else None, min(longs) if longs else None)


def strings_per_mppt_max(pv: PvArray) -> Optional[int]:
    inv = pv.inverter
    lims = [n for n in (inv.strings_per_mppt,
                        math.floor(inv.imppt_max / pv.module.imp) if inv.imppt_max else None) if n is not None]
    return min(lims) if lims else None


def inverter_of(pv: PvArray, mppt: int) -> int:
    """1-based inverter number of a site-wide MPPT number."""
    per = pv.inverter.mppts or 0
    return 1 if per <= 0 else (mppt - 1) // per + 1


def dc_ac(pv: PvArray) -> Optional[float]:
    ac = pv.inverter.kw * max(1, pv.inverter.count)
    return pv.kwp() / ac if ac else None


@dataclass
class DcRow:
    """One MPPT input, for the calc sheet and the studio."""
    inverter: int
    mppt: int
    face: str
    strings: int
    modules: int
    voc_cold: float
    vmp_cold: float
    vmp_hot: float
    i_mppt: float
    cable_mm2: float = 6.0
    length_m: Optional[float] = None
    du_pct: Optional[float] = None
    fuse_a: Optional[int] = None


def dc_rows(pv: PvArray) -> list[DcRow]:
    v = module_volts(pv.module)
    rows = []
    for s in pv.strings:
        length = s.length_m or pv.dc_length_m
        du = string_drop_pct(pv, s.modules, length)
        rows.append(DcRow(inverter_of(pv, s.mppt), s.mppt, s.face, s.count, s.modules, s.modules * v.voc_cold,
                          s.modules * v.vmp_cold, s.modules * v.vmp_hot, s.count * pv.module.imp, pv.dc_cable_mm2,
                          length, round(du, 2) if du is not None else None,
                          string_fuse_a(pv.module) if s.count >= FUSE_FROM_STRINGS else None))
    return rows


def string_fuse_a(m: PvModule) -> Optional[int]:
    """gPV fuse per IEC 62548: 1.5 × Isc ≤ In ≤ 2.4 × Isc, and not above the module's maximum series fuse."""
    top = min(2.4 * m.isc, m.max_fuse_a or 1e9)
    return next((f for f in GPV_FUSES if 1.5 * m.isc <= f <= top), None)


def string_cable_need_a(pv: PvArray, parallel: int) -> float:
    """Current the string cable must carry: 1.25 × Isc, or the string fuse when strings are fused."""
    if parallel >= FUSE_FROM_STRINGS:
        return float(string_fuse_a(pv.module) or 1.5 * pv.module.isc)
    return 1.25 * pv.module.isc


def string_drop_pct(pv: PvArray, modules: int, length_m: Optional[float]) -> Optional[float]:
    if not length_m:
        return None
    return 100 * 2 * length_m * pv.module.imp * RHO_DC / pv.dc_cable_mm2 / (modules * pv.module.vmp)
