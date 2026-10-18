"""Design rule checks — every finding carries a Hebrew message and, where there is one, the fix.

Findings are what the office reads before a drawing goes out: an *error* is something the
inspector or IEC would reject, a *warning* needs the engineer's eye, *info* is a number the
engine filled in. ``compute`` writes calculated voltage drops back into the model so the
single-line prints them.
"""
from __future__ import annotations

from collections import Counter
from dataclasses import asdict, dataclass
from typing import Literal, Optional

from .calc import ampacity, design_current, loaded_conductors, parse_cable, voltage_drop_pct
from .model import Board, Circuit, Design

Level = Literal["error", "warn", "info"]

DU_LIMIT_PCT = 4.0          # IEC 60364-5-52 G.52.1, installations supplied from the LV network
SOCKET_WORDS = ("שקע", "socket")
SOURCE_NODES = ("inverter", "battery", "generator", "pv", "bess", "pcs", "ups", "grid")


@dataclass
class Finding:
    level: Level
    code: str
    where: str          # "MDB / M3"
    message: str        # Hebrew, what is wrong
    fix: str = ""       # Hebrew, what to do

    def line(self) -> str:
        mark = {"error": "שגיאה", "warn": "אזהרה", "info": "מידע"}[self.level]
        tail = f" ← {self.fix}" if self.fix else ""
        return f"[{mark}] {self.where}: {self.message}{tail}"


def _method(c: Circuit) -> str:
    if c.cable and c.cable.method in ("B1", "C"):
        return c.cable.method
    return "B1" if c.kind == "final" else "C"


def _check_circuit(b: Board, c: Circuit, out: list[Finding]) -> None:
    where = f"{b.id} / {c.tag}"
    d = c.device
    three = c.phase == "L1-3"
    if three and d.poles < 3:
        out.append(Finding("error", "POLES_PHASE", where, f"מעגל תלת-פאזי עם מפסק {d.poles} קטבים",
                           "להחליף למפסק 3P או 4P"))
    if d.poles == 1 and c.kind == "final" and not c.phase:
        out.append(Finding("warn", "NO_PHASE", where, "לא הוגדר מופע למעגל חד-פאזי", "לבחור L1, L2 או L3"))
    if not c.cable:
        if c.kind == "final":
            out.append(Finding("warn", "NO_CABLE", where, "לא הוגדר כבל למעגל", "להוסיף חתך כבל"))
        return
    spec = parse_cable(c.cable.designation)
    if spec is None:
        out.append(Finding("info", "CABLE_UNPARSED", where, f"לא זוהה חתך מהכינוי \"{c.cable.designation}\"",
                           "לכתוב בתבנית 3X2.5 כדי שהמנוע יבדוק אותו"))
        return
    if d.rating_a:
        method = _method(c)
        iz = ampacity(spec, method, loaded_conductors(c.phase, d.poles))
        if iz is not None and d.rating_a > iz:
            out.append(Finding("error", "CABLE_OVERLOAD", where,
                               f"מפסק {d.rating_a:g}A על כבל {spec.csa_mm2:g} ממ\"ר שמעביר {iz:g}A (שיטת התקנה {method})",
                               f"להגדיל חתך כבל או להקטין את המפסק ל-{_largest_below(iz)}A"))
    i = design_current(c)
    if i and c.cable.length_m:
        du = voltage_drop_pct(c.cable, i, three or d.poles >= 3)
        if du is not None:
            if c.cable.du_pct is None:
                c.cable.du_pct = round(du, 2)
                out.append(Finding("info", "DU_COMPUTED", where, f"מפל מתח מחושב {du:.2f}% ({i:.0f}A, {c.cable.length_m:g} מ')"))
            if du > DU_LIMIT_PCT:
                out.append(Finding("warn", "DU_HIGH", where, f"מפל מתח {du:.1f}% מעל {DU_LIMIT_PCT:g}%",
                                   "להגדיל חתך כבל או לקצר את התוואי"))


_STD_RATINGS = (6, 10, 13, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125, 160, 200, 250)


def _largest_below(iz: float) -> int:
    ok = [r for r in _STD_RATINGS if r <= iz]
    return ok[-1] if ok else _STD_RATINGS[0]


def _check_board(design: Design, b: Board, out: list[Finding]) -> None:
    tags = Counter(c.tag for c in b.all_circuits())
    for g in b.groups:
        if g.device:
            tags[g.device.tag] += 1
    for tag, n in tags.items():
        if n > 1:
            out.append(Finding("error", "DUP_TAG", f"{b.id} / {tag}", f"התג מופיע {n} פעמים בלוח", "לתת לכל מעגל תג ייחודי"))
    board_ids = {x.id for x in design.boards}
    nodes = {n.id: n for n in design.nodes}
    for f in b.feeders:
        if f.to_board and f.to_board not in board_ids:
            out.append(Finding("error", "BAD_REF", f"{b.id} / {f.tag}", f"היציאה מפנה ללוח \"{f.to_board}\" שלא קיים",
                               f"לוחות קיימים: {', '.join(sorted(board_ids))}"))
        if f.to_node and f.to_node not in nodes:
            out.append(Finding("error", "BAD_REF", f"{b.id} / {f.tag}", f"היציאה מפנה לרכיב \"{f.to_node}\" שלא קיים",
                               f"רכיבים קיימים: {', '.join(sorted(nodes)) or 'אין'}"))
    inc = b.incomer.rating_a if b.incomer else None
    for g in b.groups:
        gd = g.device
        biggest = max((c.device.rating_a or 0 for c in g.circuits), default=0)
        if gd and gd.kind == "rcd" and gd.rating_a and biggest > gd.rating_a:
            out.append(Finding("warn", "RCD_UNDERRATED", f"{b.id} / {gd.tag}",
                               f"מפסק הפחת {gd.rating_a:g}A קטן מהמעגל הגדול אחריו ({biggest:g}A)",
                               "להגדיל את מפסק הפחת או לוודא שהמפסק לפניו מגן עליו"))
        if gd and gd.kind == "rcd" and (gd.idn_ma or 0) > 30 and any(
                w in c.load for c in g.circuits for w in SOCKET_WORDS):
            out.append(Finding("error", "RCD_SOCKETS", f"{b.id} / {gd.tag}",
                               f"מעגלי שקעים מוגנים בפחת {gd.idn_ma}mA", "מעגלי שקעים דורשים פחת 30mA"))
        for c in g.circuits:
            _check_circuit(b, c, out)
    for c in b.feeders:
        _check_circuit(b, c, out)
        node = nodes.get(c.to_node or "")
        is_source = node is not None and node.kind in SOURCE_NODES
        if inc and c.device.rating_a and c.device.rating_a >= inc and not is_source:
            out.append(Finding("warn", "SELECTIVITY", f"{b.id} / {c.tag}",
                               f"מפסק היציאה {c.device.rating_a:g}A לא קטן מהמפסק הראשי {inc:g}A — אין סלקטיביות",
                               "להקטין את מפסק היציאה או להגדיל את הראשי"))
    for c in b.all_circuits():
        if c.kind == "final" and inc and c.device.rating_a and c.device.rating_a >= inc:
            out.append(Finding("warn", "SELECTIVITY", f"{b.id} / {c.tag}",
                               f"מפסק {c.device.rating_a:g}A לא קטן מהמפסק הראשי {inc:g}A", "לבדוק סלקטיביות"))
    load = {ph: sum(c.device.rating_a or 0 for c in b.all_circuits() if c.phase == ph and c.device.poles == 1)
            for ph in ("L1", "L2", "L3")}
    hi, lo = max(load.values()), min(load.values())
    if hi and (hi - lo) / hi > 0.35:
        pretty = ", ".join(f"{k} {v:g}A" for k, v in load.items())
        out.append(Finding("warn", "PHASE_BALANCE", b.id, f"חלוקת מופעים לא מאוזנת ({pretty})",
                           "להעביר מעגלים מהמופע העמוס"))


def check(design: Design, compute: bool = True) -> list[Finding]:
    """Run every rule. With ``compute`` the computed voltage drops are written into the model."""
    work = design if compute else design.model_copy(deep=True)
    out: list[Finding] = []
    for b in work.boards:
        _check_board(work, b, out)
    order = {"error": 0, "warn": 1, "info": 2}
    out.sort(key=lambda f: order[f.level])
    return out


def summary(findings: list[Finding]) -> str:
    n = Counter(f.level for f in findings)
    return f"בדיקות: {n['error']} שגיאות, {n['warn']} אזהרות, {n['info']} הודעות"


def as_dicts(findings: list[Finding]) -> list[dict[str, Optional[str]]]:
    return [asdict(f) for f in findings]
