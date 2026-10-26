"""Grid connection rules — what the connection allows and who may sign for it (Israel).

  - connection capacity: √3·400·I (three-phase) or 230·I (single-phase) from the meter rating "3X63A";
  - the PV AC power (inverter kW × count) must fit inside it, else the connection has to be enlarged;
  - an export cap from the connection offer (supply.export_limit_kw) needs a CT-based export limiter;
  - LV generation permits on gov.il go up to 630 kW; above that the job is an MV connection;
  - the electrician licence that covers an installation, by connection current (Electricity Law
    licensing regulations; the classes are the common reading of them and should be checked
    against the current regulations before a permit goes out).
"""
from __future__ import annotations

import math
import re
from typing import Optional

from .calc import U_LL, U_PH
from .model import Board, Design

LV_PERMIT_MAX_KW = 630.0

# (max connection current A, three-phase only above single-phase sizes) → licence that may work on it
LICENCES = ((40, "חשמלאי מעשי"), (80, "חשמלאי מוסמך"), (250, "חשמלאי ראשי"), (400, "חשמלאי טכנאי"),
            (630, "חשמלאי הנדסאי"))
LICENCE_ANY = "מהנדס חשמל"


def parse_connection(text: Optional[str]) -> Optional[tuple[int, float]]:
    """"3X63A" → (3, 63); "1X40A" / "40A" → (1, 40); None when there is no current in it."""
    m = re.search(r"(?:(\d)\s*[xX×]\s*)?(\d+(?:\.\d+)?)\s*A", text or "")
    if not m:
        return None
    return int(m.group(1) or 1), float(m.group(2))


def connection_kva(phases: int, amps: float) -> float:
    return (math.sqrt(3) * U_LL if phases == 3 else U_PH) * amps / 1000


def licence_for(amps: float) -> str:
    return next((name for limit, name in LICENCES if amps <= limit), LICENCE_ANY)


def utility_board(design: Design) -> Optional[Board]:
    return next((b for b in design.boards if b.supply.kind == "utility" and b.supply.meter), None)


def pv_ac_kw(design: Design) -> Optional[float]:
    """Total inverter AC power: the structured PV array, else the inverter nodes' ratings."""
    if design.pv:
        return design.pv.inverter.kw * max(1, design.pv.inverter.count)
    from .calc import node_kw
    kws = [node_kw(n.rating) for n in design.nodes if n.kind == "inverter"]
    kws = [k for k in kws if k]
    return sum(kws) if kws else None
