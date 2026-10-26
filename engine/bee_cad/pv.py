"""PV DC side — string voltage window, MPPT current and DC/AC ratio.

The same rules and defaults as the app's string sizing (B.E.E packages/quote-engine/src/string-sizing.ts),
so a quote and its drawings cannot disagree about the strings:
  - Voc at the coldest dawn (−3 °C, β Voc) ≤ the inverter's max DC voltage;
  - Vmp at that cold (β Voc) ≤ MPPT max;  Vmp on a hot roof (70 °C cell, γ Pmax as stand-in) ≥ MPPT min;
  - parallel strings per MPPT ≤ min(strings_per_mppt, floor(I_mppt_max / Imp));
  - DC/AC between 1.0 and 1.35 (target 1.2).
String protection and cabling follow IEC 62548 (and IEC 60364-7-712):
  - Isc_max = 1.25·Isc_STC; string fuses are needed when (Np − 1)·Isc_max > the module's reverse-current rating
    (its maximum series fuse); without that rating, from three parallel strings;
  - a gPV fuse In with 1.5·Isc ≤ In ≤ 2.4·Isc and In ≤ the module's maximum series fuse, in both poles;
  - string cable Iz ≥ the fuse In, or without fuses ≥ Isc_max·(Np − 1) and never below Isc_max (EN 50618 cable,
    single cable in free air at 60 °C);
  - DC voltage drop at Imp / Vmp, conductor at 70 °C: info up to 1 %, warning above 3 %.
The values are defaults to check against the real datasheets.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Optional

from .model import PvArray, PvModule, PvString

T_MIN_C = -3.0            # coldest dawn, inland Israel
T_CELL_MAX_C = 70.0       # hottest cell on a summer roof
T_STC_C = 25.0
DC_AC_MIN, DC_AC_TARGET, DC_AC_MAX = 1.0, 1.2, 1.35
FUSE_FROM_STRINGS = 3     # string fuses from three parallel strings when the reverse-current rating is unknown
ISC_MAX_FACTOR = 1.25     # IEC 62548 Isc_max = 1.25 × Isc_STC
FUSE_LO, FUSE_HI = 1.5, 2.4
GPV_RATINGS = (8, 10, 12, 15, 16, 20, 25, 30, 32, 40)
RHO_CU_70 = 0.0213        # Ω·mm²/m, copper at 70 °C
DC_DU_INFO, DC_DU_WARN = 1.0, 3.0
# EN 50618 (H1Z2Z2-K) single cable in free air, 60 °C ambient, conductor 120 °C
PV_CABLE_IZ = {1.5: 30, 2.5: 41, 4: 55, 6: 70, 10: 98, 16: 132, 25: 176, 35: 218}


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


def isc_max(m: PvModule) -> float:
    return ISC_MAX_FACTOR * m.isc


def fuses_needed(m: PvModule, parallel: int) -> bool:
    """IEC 62548: reverse current from the other strings beyond what the module takes."""
    if parallel < 2:
        return False
    if m.fuse_max_a:
        return (parallel - 1) * isc_max(m) > m.fuse_max_a
    return parallel >= FUSE_FROM_STRINGS


def fuse_rating(m: PvModule) -> Optional[float]:
    """Smallest standard gPV rating in [1.5·Isc, 2.4·Isc] and ≤ the module's maximum series fuse; None if none fits."""
    hi = FUSE_HI * m.isc if not m.fuse_max_a else min(FUSE_HI * m.isc, m.fuse_max_a)
    return next((r for r in GPV_RATINGS if FUSE_LO * m.isc <= r <= hi), None)


def string_cable_required_a(m: PvModule, parallel: int) -> float:
    """Current the string cable must carry: the fuse In when fused, else the reverse current of the others."""
    if fuses_needed(m, parallel):
        return fuse_rating(m) or FUSE_HI * m.isc
    return isc_max(m) * max(1, parallel - 1)


def dc_drop_pct(m: PvModule, s: PvString) -> Optional[float]:
    if not s.cable_m or not s.cable_mm2:
        return None
    return 100 * 2 * s.cable_m * RHO_CU_70 / s.cable_mm2 * m.imp / (s.modules * m.vmp)


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
    fuse_a: Optional[float]      # gPV string fuse In, None when the strings need no fuses
    cable_mm2: float
    cable_iz: Optional[float]
    cable_req_a: float
    du_pct: Optional[float]


def dc_rows(pv: PvArray) -> list[DcRow]:
    v = module_volts(pv.module)
    m = pv.module
    return [DcRow(inverter_of(pv, s.mppt), s.mppt, s.face, s.count, s.modules, s.modules * v.voc_cold,
                  s.modules * v.vmp_cold, s.modules * v.vmp_hot, s.count * m.imp,
                  fuse_rating(m) if fuses_needed(m, s.count) else None, s.cable_mm2, PV_CABLE_IZ.get(s.cable_mm2),
                  round(string_cable_required_a(m, s.count), 1), dc_drop_pct(m, s)) for s in pv.strings]
