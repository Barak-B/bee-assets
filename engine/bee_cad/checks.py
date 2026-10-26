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

from .calc import (METHODS, TRIP_MULTIPLE, ampacity, design_current, ik1_min_a, ik3_max_ka, loaded_conductors,
                   node_kw, parse_cable, source_impedance, voltage_drop_pct)
from .model import Board, Circuit, Design, PvArray
from .pv import (DC_AC_MAX, DC_AC_MIN, FUSE_FROM_STRINGS, T_CELL_MAX_C, T_MIN_C, dc_ac, inverter_of, module_volts,
                 string_window, strings_per_mppt_max)

Level = Literal["error", "warn", "info"]

# IEC 60364-5-52 G.52.1, installations supplied directly from a public LV network
DU_LIMIT_LIGHTING_PCT = 3.0
DU_LIMIT_PCT = 5.0
SOCKET_WORDS = ("שקע", "בית תקע", "socket")
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
        tail = f" | תיקון: {self.fix}" if self.fix else ""
        return f"[{mark}] {self.where}: {self.message}{tail}"


def _is_socket(c: Circuit) -> bool:
    name = c.load.lower()
    return any(w in name for w in SOCKET_WORDS)


def _method(c: Circuit) -> str:
    if c.cable and c.cable.method in METHODS:
        return c.cable.method
    return "B1" if c.kind == "final" else "C"


def _check_cable_capacity(where: str, cable, rating: Optional[float], method: str, loaded: int,
                          out: list[Finding]) -> None:
    spec = parse_cable(cable.designation)
    if spec is None:
        out.append(Finding("info", "CABLE_UNPARSED", where, f"לא זוהה חתך מהכינוי \"{cable.designation}\"",
                           "לכתוב בתבנית 3X2.5 כדי שהמנוע יבדוק אותו"))
        return
    if not rating:
        return
    iz = ampacity(spec, method, loaded, cable.ambient_c)
    if iz is None:
        why = "כבל אלומיניום" if spec.material == "Al" else f"חתך {spec.csa_mm2:g} ממ\"ר או שיטה {method} מחוץ לטבלה"
        out.append(Finding("warn", "CABLE_UNCHECKED", where, f"כושר ההולכה לא נבדק ({why})", "לבדוק ידנית"))
        return
    if rating > iz:
        amb = f", {cable.ambient_c:g}°C" if cable.ambient_c else ""
        smaller = _largest_below(iz)
        fix = "להגדיל חתך כבל" + (f" או להקטין את המפסק ל-{smaller}A" if smaller else "")
        out.append(Finding("error", "CABLE_OVERLOAD", where,
                           f"מפסק {rating:g}A על כבל {spec.csa_mm2:g} ממ\"ר שמעביר {iz:g}A (שיטת התקנה {method}{amb})",
                           fix))


def _check_circuit(b: Board, c: Circuit, out: list[Finding], up_du: float = 0.0, kw: Optional[float] = None) -> None:
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
    _check_cable_capacity(where, c.cable, d.rating_a, _method(c), loaded_conductors(c.phase, d.poles), out)
    i = design_current(c, kw)
    if i and c.cable.length_m:
        du = voltage_drop_pct(c.cable, i, three or d.poles >= 3)
        if du is not None:
            if c.cable.du_pct is None:
                c.cable.du_pct = round(du, 2)
            elif abs(c.cable.du_pct - du) > 0.3:
                out.append(Finding("warn", "DU_MISMATCH", where,
                                   f"בשרטוט מפל מתח {c.cable.du_pct:g}% אבל החישוב נותן {du:.2f}%", "לעדכן את הערך או למחוק אותו"))
            out.append(Finding("info", "DU_COMPUTED", where, f"מפל מתח מחושב {du:.2f}% ({i:.0f}A, {c.cable.length_m:g} מ')"))
            total = du + (up_du if c.kind == "final" else 0.0)
            limit = DU_LIMIT_LIGHTING_PCT if "תאורה" in c.load else DU_LIMIT_PCT
            if total > limit:
                via = f" (כולל {up_du:.1f}% בכבל ההזנה)" if up_du and c.kind == "final" else ""
                out.append(Finding("warn", "DU_HIGH", where, f"מפל מתח {total:.1f}% מעל {limit:g}%{via}",
                                   "להגדיל חתך כבל או לקצר את התוואי"))


_STD_RATINGS = (6, 10, 13, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125, 160, 200, 250)


def _largest_below(iz: float) -> Optional[int]:
    ok = [r for r in _STD_RATINGS if r <= iz]
    return ok[-1] if ok and iz <= 2 * _STD_RATINGS[-1] else None


def _check_short_circuit(b: Board, out: list[Finding]) -> None:
    """Breaking capacity against the maximum fault at the board; automatic disconnection (TN) at the far end."""
    if b.supply.kind not in ("utility", "transformer"):
        return
    ik = b.supply.ik_ka
    zs = source_impedance(ik) if ik else 0.0
    up = [b.supply.cable] if b.supply.cable and b.supply.cable.length_m else []
    if ik:
        ikb = ik3_max_ka(zs, up)
        out.append(Finding("info", "IK_BOARD", b.id, f"זרם קצר מקסימלי בפסי הלוח {ikb:.1f}kA"))
        devices = [b.incomer, b.spd] + [g.device for g in b.groups] + [c.device for c in b.all_circuits()]
        for d in devices:
            if d and d.icu_ka and d.icu_ka < ikb and d.kind not in ("rcd", "spd"):
                out.append(Finding("error", "ICU_LOW", f"{b.id} / {d.tag}",
                                   f"כושר ניתוק {d.icu_ka:g}kA קטן מזרם הקצר בלוח ({ikb:.1f}kA)",
                                   f"לבחור מפסק עם כושר ניתוק של {_ka_step(ikb)}kA לפחות"))
    else:
        out.append(Finding("info", "NO_IK", b.id, "לא הוזן זרם קצר בנקודת החיבור, ולכן כושר הניתוק לא נבדק",
                           "להוסיף supply.ik_ka לפי נתוני חח\"י"))
    if b.supply.earthing not in ("TN-C-S", "TN-S"):
        return
    behind_rcd = {c.tag for g in b.groups if g.device and g.device.kind in ("rcd", "rcbo") for c in g.circuits}
    for c in b.all_circuits():
        d = c.device
        if c.kind != "final" or d.kind not in ("mcb", "rcbo") or not d.rating_a or not c.cable:
            continue
        mult = TRIP_MULTIPLE.get((d.curve or "C").upper()[:1])
        i1 = ik1_min_a(zs, up + [c.cable])
        if mult is None or i1 is None:
            continue
        if i1 < mult * d.rating_a:
            note = "" if ik else " (בלי עכבת הרשת; במציאות הזרם נמוך יותר)"
            protected = c.tag in behind_rcd or d.kind == "rcbo"
            out.append(Finding("info" if protected else "error", "DISCONNECT", f"{b.id} / {c.tag}",
                               f"זרם קצר מינימלי בקצה {i1:.0f}A קטן מ-{mult * d.rating_a:g}A שדרושים לניתוק מגנטי{note}",
                               "הניתוק מובטח על ידי הפחת" if protected else
                               "להגדיל חתך, לקצר את המעגל, לבחור עקומה B או להוסיף פחת"))


def _ka_step(ka: float) -> int:
    return next((s for s in (6, 10, 15, 25, 36, 50, 70) if s >= ka), 100)


def _supply_du(b: Board) -> float:
    cab = b.supply.cable
    if not cab:
        return 0.0
    if cab.du_pct is None and cab.length_m and b.incomer and b.incomer.rating_a:
        du = voltage_drop_pct(cab, b.incomer.rating_a, True)
        if du is not None:
            cab.du_pct = round(du, 2)
    return cab.du_pct or 0.0


def _check_board(design: Design, b: Board, out: list[Finding]) -> None:
    _check_short_circuit(b, out)
    up_du = _supply_du(b)
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
        group_30 = gd is not None and gd.kind in ("rcd", "rcbo") and (gd.idn_ma or 1000) <= 30
        for c in g.circuits:
            own_30 = c.device.kind == "rcbo" and (c.device.idn_ma or 1000) <= 30
            if _is_socket(c) and not (group_30 or own_30):
                have = f"פחת {gd.idn_ma}mA" if gd and gd.kind in ("rcd", "rcbo") and gd.idn_ma else "בלי פחת"
                out.append(Finding("error", "RCD_SOCKETS", f"{b.id} / {c.tag}",
                                   f"מעגל שקעים {have}", "מעגלי שקעים דורשים פחת 30mA (או RCBO 30mA)"))
            _check_circuit(b, c, out, up_du)
    boards = {x.id: x for x in design.boards}
    for c in b.feeders:
        node = nodes.get(c.to_node or "")
        fed = boards.get(c.to_board or "")
        is_source = (node is not None and node.kind in SOURCE_NODES) or \
            (fed is not None and fed.supply.kind in ("inverter", "generator"))
        _check_circuit(b, c, out, kw=node_kw(node.rating) if node else None)
        if inc and c.device.rating_a and c.device.rating_a >= inc and not is_source:
            out.append(Finding("warn", "SELECTIVITY", f"{b.id} / {c.tag}",
                               f"מפסק היציאה {c.device.rating_a:g}A לא קטן מהמפסק הראשי {inc:g}A, אין סלקטיביות",
                               "להקטין את מפסק היציאה או להגדיל את הראשי"))
    for g in b.groups:
        for c in g.circuits:
            if inc and c.device.rating_a and c.device.rating_a >= inc:
                out.append(Finding("warn", "SELECTIVITY", f"{b.id} / {c.tag}",
                                   f"מפסק {c.device.rating_a:g}A לא קטן מהמפסק הראשי {inc:g}A", "לבדוק סלקטיביות"))
    if b.supply.cable and b.incomer:
        _check_cable_capacity(f"{b.id} / הזנה", b.supply.cable, b.incomer.rating_a,
                              b.supply.cable.method if b.supply.cable.method in METHODS else "C", 3, out)
    load = {ph: sum(c.device.rating_a or 0 for c in b.all_circuits() if c.phase == ph and c.device.poles == 1)
            for ph in ("L1", "L2", "L3")}
    hi, lo = max(load.values()), min(load.values())
    biggest = max((c.device.rating_a or 0 for c in b.all_circuits() if c.device.poles == 1), default=0)
    if hi and (hi - lo) / hi > 0.35 and hi - lo > biggest:
        pretty = ", ".join(f"{k} {v:g}A" for k, v in load.items())
        out.append(Finding("warn", "PHASE_BALANCE", b.id, f"חלוקת מופעים לא מאוזנת ({pretty})",
                           "להעביר מעגלים מהמופע העמוס"))


def _check_pv(pv: PvArray, out: list[Finding]) -> None:
    """DC side: string length window, MPPT current and inputs, DC/AC (rules in bee_cad.pv)."""
    inv = pv.inverter
    v = module_volts(pv.module)
    short, long_ = string_window(pv)
    per_mppt = strings_per_mppt_max(pv)
    seen: dict[int, int] = {}
    for s in pv.strings:
        where = f"PV / INV{inverter_of(pv, s.mppt)} MPPT{s.mppt}" + (f" ({s.face})" if s.face else "")
        seen[s.mppt] = seen.get(s.mppt, 0) + 1
        voc = s.modules * v.voc_cold
        if inv.vdc_max and voc > inv.vdc_max:
            out.append(Finding("error", "PV_VOC_COLD", where,
                               f"מחרוזת של {s.modules} פאנלים: Voc ב-{T_MIN_C:g}°C = {voc:.0f}V, מעל {inv.vdc_max:g}V של הממיר",
                               f"לקצר את המחרוזת ל-{long_} פאנלים לכל היותר" if long_ else "לקצר את המחרוזת"))
        elif inv.mppt_max and s.modules * v.vmp_cold > inv.mppt_max:
            out.append(Finding("warn", "PV_VMP_HIGH", where,
                               f"Vmp בקור = {s.modules * v.vmp_cold:.0f}V, מעל תחום ה-MPPT ({inv.mppt_max:g}V)",
                               f"עד {long_} פאנלים במחרוזת" if long_ else "לקצר את המחרוזת"))
        if inv.mppt_min and s.modules * v.vmp_hot < inv.mppt_min:
            out.append(Finding("warn", "PV_VMP_LOW", where,
                               f"Vmp בגג חם ({T_CELL_MAX_C:g}°C) = {s.modules * v.vmp_hot:.0f}V, מתחת ל-{inv.mppt_min:g}V: הממיר יאבד ייצור בקיץ",
                               f"לפחות {short} פאנלים במחרוזת" if short else "להאריך את המחרוזת"))
        if per_mppt is not None and s.count > per_mppt:
            out.append(Finding("error", "PV_MPPT_CURRENT", where,
                               f"{s.count} מחרוזות במקביל = {s.count * pv.module.imp:.1f}A; הכניסה מקבלת עד {per_mppt} מחרוזות"
                               + (f" ({inv.imppt_max:g}A)" if inv.imppt_max else ""),
                               "לפזר את המחרוזות על כניסות MPPT נוספות"))
        elif s.count >= FUSE_FROM_STRINGS:
            out.append(Finding("info", "PV_STRING_FUSE", where,
                               f"{s.count} מחרוזות במקביל: נדרשים נתיכי מחרוזת gPV בשני הקטבים (או מאסף עם נתיכים)", ""))
    for m, n in seen.items():
        if n > 1:
            out.append(Finding("warn", "PV_MPPT_REPEAT", f"PV / MPPT{m}", f"MPPT{m} מופיע {n} פעמים ברשימת המחרוזות",
                               "לאחד לשורה אחת עם count"))
    if inv.mppts and pv.strings:
        top = max(s.mppt for s in pv.strings)
        if top > inv.mppts * max(1, inv.count):
            out.append(Finding("error", "PV_MPPT_COUNT", "PV",
                               f"המחרוזות משתמשות ב-{top} כניסות MPPT, ול-{inv.count} ממירים יש {inv.mppts * max(1, inv.count)}",
                               "להוסיף ממיר או לבחור ממיר עם יותר כניסות"))
    r = dc_ac(pv)
    if r is not None and pv.strings:
        if r > DC_AC_MAX + 1e-9:
            out.append(Finding("warn", "PV_DC_AC", "PV", f"יחס DC/AC {r:.2f}, מעל {DC_AC_MAX:g}: קיטום ייצור בצהריים",
                               "להוסיף ממיר או להגדיל את ההספק שלו"))
        elif r < DC_AC_MIN - 0.15:
            out.append(Finding("warn", "PV_DC_AC", "PV", f"יחס DC/AC {r:.2f}: הממיר גדול מדי למערך", "לשקול ממיר קטן יותר"))
        else:
            out.append(Finding("info", "PV_DC_AC", "PV", f"{pv.kwp():.2f} kWp על {inv.count}×{inv.kw:g} kW, DC/AC {r:.2f}", ""))


def check(design: Design, compute: bool = True) -> list[Finding]:
    """Run every rule. With ``compute`` the computed voltage drops are written into the model."""
    work = design if compute else design.model_copy(deep=True)
    out: list[Finding] = []
    for b in work.boards:
        _check_board(work, b, out)
    if work.pv:
        _check_pv(work.pv, out)
    order = {"error": 0, "warn": 1, "info": 2}
    out.sort(key=lambda f: (order[f.level], f.where))
    return out


def summary(findings: list[Finding]) -> str:
    n = Counter(f.level for f in findings)
    return f"בדיקות: {n['error']} שגיאות, {n['warn']} אזהרות, {n['info']} הודעות"


def as_dicts(findings: list[Finding]) -> list[dict[str, Optional[str]]]:
    return [asdict(f) for f in findings]
