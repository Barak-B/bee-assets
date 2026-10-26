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


def dc_rows(pv: PvArray) -> list[DcRow]:
    v = module_volts(pv.module)
    return [DcRow(inverter_of(pv, s.mppt), s.mppt, s.face, s.count, s.modules, s.modules * v.voc_cold,
                  s.modules * v.vmp_cold, s.modules * v.vmp_hot, s.count * pv.module.imp) for s in pv.strings]
