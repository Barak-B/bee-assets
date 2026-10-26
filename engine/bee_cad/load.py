"""Maximum demand (חישוב עומסים) of a board and the connection size it needs.

Installed power per circuit from load_kw, else the breaker rating; a utilisation factor Ku by circuit type and
a coincidence factor Ks by the number of circuits (IEC 61439-1 Annex / common practice, as Ecodial applies them).
The factors are engineering defaults the designer may override per circuit with load_kw.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Optional

from .calc import U_LL, U_PH
from .model import Board, Circuit

KU = (("עמדת טעינה", 1.0), ("ev", 1.0), ("תאורה", 0.5), ("שקע", 0.2), ("socket", 0.2))
KU_DEFAULT = 0.6                    # dedicated loads: water heater, oven, A/C, pumps
KS = ((3, 0.9), (5, 0.8), (9, 0.7), (10**6, 0.5))
CONNECTIONS = ((1, 25), (1, 40), (3, 25), (3, 40), (3, 63), (3, 80), (3, 100), (3, 125), (3, 160), (3, 200), (3, 250),
               (3, 315), (3, 400))


def ku(c: Circuit) -> float:
    name = (c.load or "").lower()
    return next((k for w, k in KU if w in name), KU_DEFAULT)


def ks(n: int) -> float:
    return next(k for top, k in KS if n <= top)


def installed_kw(c: Circuit) -> float:
    if c.load_kw:
        return c.load_kw
    three = c.phase == "L1-3" or c.device.poles >= 3
    return (c.device.rating_a or 0) * (math.sqrt(3) * U_LL if three else U_PH) / 1000


@dataclass
class Demand:
    installed_kw: float
    demand_kw: float
    current_a: float            # three-phase equivalent, cos φ 0.9
    ks: float
    suggested: Optional[str]


def board_demand(b: Board, phases: int = 3, pf: float = 0.9) -> Optional[Demand]:
    finals = [c for g in b.groups for c in g.circuits if c.kind == "final"]
    if not finals:
        return None
    inst = sum(installed_kw(c) for c in finals)
    k = ks(len(finals))
    demand = sum(installed_kw(c) * ku(c) for c in finals) * k
    i = demand * 1000 / ((math.sqrt(3) * U_LL) if phases == 3 else U_PH) / pf
    sug = next((f"{p}X{a}A" for p, a in CONNECTIONS if p >= phases and 0.9 * a >= i), None)   # 10 % margin
    return Demand(round(inst, 1), round(demand, 1), round(i, 1), k, sug)
