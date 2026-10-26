"""Design rule checks — every finding carries a Hebrew message and, where there is one, the fix.

Findings are what the office reads before a drawing goes out: an *error* is something the
inspector or IEC would reject, a *warning* needs the engineer's eye, *info* is a number the
engine filled in. ``compute`` writes calculated voltage drops back into the model so the
single-line prints them.
"""
from __future__ import annotations

from collections import Counter
from dataclasses import asdict, dataclass
from typing import Any, Literal, Optional

from .calc import (METHODS, TRIP_MULTIPLE, ampacity, design_current, ik1_min_a, ik3_max_ka, let_through_i2t,
                   loaded_conductors, node_kw, parse_cable, source_impedance, voltage_drop_pct, withstand_i2t)
from .grid import LV_PERMIT_MAX_KW, connection_kva, licence_for, parse_connection, pv_ac_kw, utility_board
from .model import Board, Circuit, Design, PvArray, PvString
from .pv import (DC_AC_MAX, DC_AC_MIN, DC_DU_INFO, DC_DU_WARN, FUSE_HI, FUSE_LO, PV_CABLE_IZ, T_CELL_MAX_C, T_MIN_C,
                 dc_ac, dc_drop_pct, fuse_rating, fuses_needed, inverter_of, isc_max, module_volts,
                 string_cable_required_a, string_window, strings_per_mppt_max)

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
    patch: Optional[dict[str, Any]] = None   # one-click fix on the brief: {"path": "supply.connection", "value": "3X63A"}

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
    iz = ampacity(spec, method, loaded, cable.ambient_c, cable.grouped)
    if iz is None:
        why = "כבל אלומיניום" if spec.material == "Al" else f"חתך {spec.csa_mm2:g} ממ\"ר או שיטה {method} מחוץ לטבלה"
        out.append(Finding("warn", "CABLE_UNCHECKED", where, f"כושר ההולכה לא נבדק ({why})", "לבדוק ידנית"))
        return
    if rating > iz:
        amb = (f", {cable.ambient_c:g}°C" if cable.ambient_c else "") + \
            (f", {cable.grouped} מעגלים יחד" if cable.grouped and cable.grouped > 1 else "")
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
    if i and d.rating_a and i > d.rating_a + 1e-9 and (c.load_kw or kw):
        out.append(Finding("error", "IB_OVER_IN", where, f"זרם התכנון {i:.1f}A גדול ממפסק {d.rating_a:g}A (Ib ≤ In)",
                           "להגדיל את המפסק ואת הכבל בהתאם"))
    if i and c.cable.length_m:
        du = voltage_drop_pct(c.cable, i, three or d.poles >= 3, c.cos_phi)
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
        for c in b.all_circuits():
            _check_thermal(b, c, ikb, out)
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


def _check_thermal(b: Board, c: Circuit, ik_ka: float, out: list[Finding]) -> None:
    """IEC 60364-4-43 cl. 434.5.2: the cable takes the energy the device lets through on a fault at its origin."""
    spec = parse_cable(c.cable.designation) if c.cable else None
    i2t = let_through_i2t(c.device, ik_ka)
    if spec is None or i2t is None:
        return
    k2s2 = withstand_i2t(spec)
    if i2t > k2s2:
        mcb = c.device.kind in ("mcb", "rcbo")
        basis = "EN 60898-1 class 3" if mcb else "Ik²·0.1s"
        # class 3 is the standard's ceiling; a real 10–16A MCB lets through less, so this is a check, not a verdict
        out.append(Finding("warn", "THERMAL", f"{b.id} / {c.tag}",
                           f"בקצר של {ik_ka:.1f}kA המפסק עשוי להעביר עד {i2t:,.0f}A²s ({basis}), יותר מ-k²S² = "
                           f"{k2s2:,.0f}A²s של כבל {spec.csa_mm2:g} ממ\"ר",
                           "לאשר לפי עקומת I²t של היצרן (מפסק class 3), או להגדיל חתך" if mcb else
                           "לבדוק לפי עקומת I²t של היצרן, או להגדיל חתך"))


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
        # a feeder to a source, or to a board that only collects sources (the PV AC combiner), carries generation
        is_source = (node is not None and node.kind in SOURCE_NODES) or \
            (fed is not None and fed.supply.kind in ("inverter", "generator")) or \
            (fed is not None and bool(fed.feeders) and not fed.groups and
             all(x.to_node in nodes and nodes[x.to_node].kind in SOURCE_NODES for x in fed.feeders))
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
                               f"מחרוזת של {s.modules} פאנלים: Voc בטמפרטורה {T_MIN_C:g}°C = {voc:.0f}V, מעל {inv.vdc_max:g}V של הממיר",
                               f"לקצר את המחרוזת ל-{long_} פאנלים לכל היותר" if long_ else "לקצר את המחרוזת",
                               _string_patch(s.mppt, "modules", long_)))
        elif inv.mppt_max and s.modules * v.vmp_cold > inv.mppt_max:
            out.append(Finding("warn", "PV_VMP_HIGH", where,
                               f"Vmp בקור = {s.modules * v.vmp_cold:.0f}V, מעל תחום ה-MPPT ({inv.mppt_max:g}V)",
                               f"עד {long_} פאנלים במחרוזת" if long_ else "לקצר את המחרוזת",
                               _string_patch(s.mppt, "modules", long_)))
        if inv.mppt_min and s.modules * v.vmp_hot < inv.mppt_min:
            out.append(Finding("warn", "PV_VMP_LOW", where,
                               f"Vmp בגג חם ({T_CELL_MAX_C:g}°C) = {s.modules * v.vmp_hot:.0f}V, מתחת ל-{inv.mppt_min:g}V: הממיר יאבד ייצור בקיץ",
                               f"לפחות {short} פאנלים במחרוזת" if short else "להאריך את המחרוזת",
                               _string_patch(s.mppt, "modules", short)))
        if per_mppt is not None and s.count > per_mppt:
            out.append(Finding("error", "PV_MPPT_CURRENT", where,
                               f"{s.count} מחרוזות במקביל = {s.count * pv.module.imp:.1f}A; הכניסה מקבלת עד {per_mppt} מחרוזות"
                               + (f" ({inv.imppt_max:g}A)" if inv.imppt_max else ""),
                               "לפזר את המחרוזות על כניסות MPPT נוספות"))
        elif fuses_needed(pv.module, s.count):
            m = pv.module
            rating = fuse_rating(m)
            why = (f"זרם חוזר {(s.count - 1) * isc_max(m):.1f}A מעל {m.fuse_max_a:g}A של הפאנל" if m.fuse_max_a
                   else f"{s.count} מחרוזות במקביל")
            if rating:
                out.append(Finding("info", "PV_STRING_FUSE", where,
                                   f"{why}: נדרשים נתיכי gPV {rating:g}A בשני הקטבים (IEC 62548)", ""))
            else:
                out.append(Finding("error", "PV_STRING_FUSE", where,
                                   f"{why}, ואין נתיך gPV בין {FUSE_LO * m.isc:.1f}A ל-{m.fuse_max_a or FUSE_HI * m.isc:g}A",
                                   "להפחית מחרוזות במקביל בכניסה"))
        _check_string_cable(pv, s, where, out)
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


def _string_patch(mppt: int, field: str, value: Optional[float]) -> Optional[dict[str, Any]]:
    return {"path": f"pv.strings[mppt={mppt}].{field}", "value": value} if value else None


def _check_string_cable(pv: PvArray, s: PvString, where: str, out: list[Finding]) -> None:
    need = string_cable_required_a(pv.module, s.count)
    iz = PV_CABLE_IZ.get(s.cable_mm2)
    if iz is None:
        out.append(Finding("warn", "PV_CABLE", where, f"חתך כבל מחרוזת {s.cable_mm2:g} ממ\"ר מחוץ לטבלת EN 50618", "לבדוק ידנית"))
    elif iz < need:
        bigger = next((a for a, i in sorted(PV_CABLE_IZ.items()) if i >= need), None)
        out.append(Finding("error", "PV_CABLE", where,
                           f"כבל מחרוזת {s.cable_mm2:g} ממ\"ר מעביר {iz}A, נדרש {need:.1f}A (IEC 62548)",
                           f"כבל {bigger:g} ממ\"ר או נתיכי מחרוזת" if bigger else "להוסיף נתיכי מחרוזת",
                           _string_patch(s.mppt, "cable_mm2", bigger)))
    du = dc_drop_pct(pv.module, s)
    if du is not None:
        if du > DC_DU_WARN:
            up = next((a for a in sorted(PV_CABLE_IZ) if a > s.cable_mm2), None)
            out.append(Finding("warn", "PV_DC_DU", where, f"מפל מתח DC {du:.2f}% ({s.cable_m:g} מ', {s.cable_mm2:g} ממ\"ר)",
                               f"להגדיל חתך כבל המחרוזת ל-{up:g} ממ\"ר" if up else "להגדיל חתך כבל המחרוזת",
                               _string_patch(s.mppt, "cable_mm2", up)))
        elif du > DC_DU_INFO:
            out.append(Finding("info", "PV_DC_DU", where, f"מפל מתח DC {du:.2f}%, מעל {DC_DU_INFO:g}% המומלץ", ""))


def _check_connection(design: Design, out: list[Finding]) -> None:
    """The connection: capacity against the PV AC power, the export cap, the LV permit limit and the licence."""
    b = utility_board(design)
    conn = parse_connection(b.supply.meter) if b else None
    if b is None or conn is None:
        return
    phases, amps = conn
    kva = connection_kva(phases, amps)
    ac = pv_ac_kw(design)
    label = b.supply.meter.upper()
    if ac:
        if ac > kva + 1e-6:
            need = next((a for a in (25, 40, 63, 80, 100, 125, 160, 200, 250, 400, 630)
                         if connection_kva(3, a) >= ac), None)
            out.append(Finding("error", "CONNECTION", b.id,
                               f"הספק הממירים {ac:g} kW גדול מקיבולת החיבור {label} ({kva:.1f} kVA)",
                               f"להגדיל חיבור ל-3X{need}A לפחות" if need else "חיבור מתח גבוה",
                               {"path": "supply.connection", "value": f"3X{need}A"} if need else None))
        else:
            out.append(Finding("info", "CONNECTION", b.id, f"הספק הממירים {ac:g} kW מתוך {kva:.1f} kVA של חיבור {label}"))
        if ac > LV_PERMIT_MAX_KW:
            out.append(Finding("warn", "CONNECTION_MV", b.id,
                               f"{ac:g} kW מעל {LV_PERMIT_MAX_KW:g} kW: חיבור ורישוי במתח גבוה", "לתכנן חיבור מתח גבוה"))
        cap = b.supply.export_limit_kw
        if cap is not None and ac > cap:
            what = "אפס הזרמה" if cap == 0 else f"הזרמה עד {cap:g} kW"
            out.append(Finding("info", "EXPORT_LIMIT", b.id,
                               f"הצעת החיבור מגבילה ל{what}: נדרש בקר הגבלת הזרמה עם משני זרם בנקודת החיבור", ""))
    out.append(Finding("info", "LICENCE", b.id,
                       f"חיבור {label}: העבודה דורשת רישיון {licence_for(amps)} לפחות (לאמת מול תקנות הרישוי)"))


def _check_rcd_types(design: Design, out: list[Finding]) -> None:
    """RCD type for inverters (IEC 60364-7-712 531.3) and EV chargers (IEC 60364-7-722 531.3.101)."""
    for n in design.nodes:
        if n.kind == "inverter" and n.device and n.device.kind in ("rcd", "rcbo") and (n.device.rcd_type or "").upper() == "AC":
            out.append(Finding("error", "RCD_TYPE", n.id, "פחת Type AC לממיר: לא מזהה זרמי זליגה DC או פועמים",
                               "Type B, או Type A כשהיצרן מצהיר שהממיר לא מזרים זרם DC לרשת"))
    for b in design.boards:
        for g in b.groups:
            for c in g.circuits:
                rtype = ((c.device.rcd_type if c.device.kind == "rcbo" else None) or
                         (g.device.rcd_type if g.device else None) or "").upper()
                if any(w in c.load for w in ("טעינ", "רכב חשמלי", "EV")) and rtype in ("AC", ""):
                    out.append(Finding("error", "RCD_TYPE", f"{b.id} / {c.tag}",
                                       f"עמדת טעינה עם פחת {'Type AC' if rtype else 'ללא סוג'}",
                                       "Type B, או Type A כשבעמדה הגנת 6mA DC (RDC-DD)"))


def _check_island(design: Design, out: list[Finding]) -> None:
    """A board fed by the inverter's backup output: the inverter delivers ~1.5–2·In on a fault, too little for the
    magnetic trip, so automatic disconnection rests on 30 mA RCDs."""
    pv = design.pv
    for b in design.boards:
        if b.supply.kind != "inverter":
            continue
        i_fault = pv.inverter.i_fault_a if pv and pv.inverter.i_fault_a else None
        for g in b.groups:
            behind = g.device is not None and g.device.kind in ("rcd", "rcbo") and (g.device.idn_ma or 1000) <= 30
            for c in g.circuits:
                own = c.device.kind == "rcbo" and (c.device.idn_ma or 1000) <= 30
                mult = TRIP_MULTIPLE.get((c.device.curve or "C").upper()[:1])
                if behind or own:
                    continue
                if i_fault and mult and c.device.rating_a and i_fault >= mult * c.device.rating_a:
                    continue
                out.append(Finding("error", "ISLAND_DISCONNECT", f"{b.id} / {c.tag}",
                                   "בעבודה במצב אי זרם הקצר של הממיר לא מספיק לניתוק מגנטי, והמעגל לא מוגן בפחת 30mA",
                                   "להעביר את המעגל אחרי פחת 30mA או RCBO"))


def _check_dc_spd(pv: PvArray, out: list[Finding]) -> None:
    if pv.inverter.dc_spd_internal or not pv.strings:
        return
    v = module_volts(pv.module)
    ucpv = max(s.modules * v.voc_cold for s in pv.strings)
    kind = "Type 1+2" if pv.lps else "Type 2"
    out.append(Finding("info", "PV_DC_SPD", "PV",
                       f"מגן מתח יתר DC {kind} לכל כניסת MPPT, Ucpv ≥ {ucpv:.0f}V (Voc בטמפרטורה {T_MIN_C:g}°C)"
                       + (" — יש מערכת הגנה מפני ברקים" if pv.lps else ""), ""))


def check(design: Design, compute: bool = True) -> list[Finding]:
    """Run every rule. With ``compute`` the computed voltage drops are written into the model."""
    work = design if compute else design.model_copy(deep=True)
    out: list[Finding] = []
    for b in work.boards:
        _check_board(work, b, out)
    if work.pv:
        _check_pv(work.pv, out)
        _check_dc_spd(work.pv, out)
    _check_connection(work, out)
    _check_rcd_types(work, out)
    _check_island(work, out)
    order = {"error": 0, "warn": 1, "info": 2}
    out.sort(key=lambda f: (order[f.level], f.where))
    return out


def summary(findings: list[Finding]) -> str:
    n = Counter(f.level for f in findings)
    return f"בדיקות: {n['error']} שגיאות, {n['warn']} אזהרות, {n['info']} הודעות"


# What each finding means, for someone who is not a design engineer (the studio and the app show it under the finding).
EXPLAIN: dict[str, str] = {
    "CABLE_OVERLOAD": "הכבל דק מדי למפסק: בעומס מלא הוא יתחמם לפני שהמפסק יקפוץ.",
    "CABLE_UNCHECKED": "המנוע לא יודע כמה זרם הכבל הזה מעביר, ולכן מישהו צריך לבדוק אותו ידנית.",
    "CABLE_UNPARSED": "הכינוי של הכבל לא בפורמט שהמנוע מבין (כמו 3X2.5).",
    "IB_OVER_IN": "הצרכן מושך יותר זרם ממה שהמפסק מרשה, ולכן המפסק יקפוץ בשימוש רגיל.",
    "THERMAL": "בקצר חשמלי חזק הכבל עלול להתחמם יותר מדי לפני שהמפסק מנתק.",
    "DU_HIGH": "בקצה הכבל המתח נמוך מדי (כבל ארוך או דק), ומכשירים יעבדו פחות טוב.",
    "DU_COMPUTED": "כמה מתח הולך לאיבוד בכבל — לידיעה.",
    "DU_MISMATCH": "הערך שכתוב בשרטוט לא מתאים לחישוב.",
    "ICU_LOW": "המפסק לא בנוי לנתק זרם קצר חזק כמו זה שיכול להיות בלוח הזה.",
    "IK_BOARD": "זרם הקצר הגדול ביותר שיכול להיות בלוח — לידיעה.",
    "NO_IK": "בלי נתון זרם קצר מחח\"י אי אפשר לבדוק את כושר הניתוק של המפסקים.",
    "DISCONNECT": "בקצר בקצה המעגל הזרם חלש מכדי להקפיץ את המפסק מהר, ולכן יש סכנת התחשמלות.",
    "POLES_PHASE": "מעגל תלת-פאזי חייב מפסק שמנתק את כל הפאזות.",
    "NO_PHASE": "לא נבחרה פאזה למעגל.",
    "NO_CABLE": "לא הוגדר כבל למעגל.",
    "DUP_TAG": "שני רכיבים באותו לוח עם אותו שם.",
    "BAD_REF": "יציאה שמפנה ללוח או רכיב שלא קיים בתכנון.",
    "RCD_SOCKETS": "שקעים חייבים להיות מוגנים במפסק פחת שמגן על אנשים מהתחשמלות.",
    "RCD_UNDERRATED": "מפסק הפחת קטן מהמעגלים שאחריו.",
    "RCD_TYPE": "סוג מפסק הפחת לא מתאים: ממירים ועמדות טעינה יכולים לייצר זליגה שפחת רגיל לא מזהה.",
    "SELECTIVITY": "בתקלה ייתכן שהמפסק הראשי יקפוץ במקום המפסק של המעגל, וכל הבית יישאר בלי חשמל.",
    "PHASE_BALANCE": "פאזה אחת עמוסה הרבה יותר מהאחרות.",
    "ISLAND_DISCONNECT": "בהפסקת חשמל הממיר מזין את הלוח החיוני ולא מסוגל להקפיץ מפסק רגיל בקצר, ולכן צריך פחת.",
    "CONNECTION": "הספק המערכת ביחס לגודל החיבור של חח\"י; כשהוא גדול מהחיבור צריך להגדיל את החיבור.",
    "CONNECTION_MV": "מערכת בגודל הזה מתחברת במתח גבוה, עם רישוי אחר.",
    "EXPORT_LIMIT": "חח\"י מרשים להזרים לרשת פחות מהספק המערכת, ולכן צריך בקר שמגביל את ההזרמה.",
    "LICENCE": "איזה רישיון חשמלאי צריך כדי לבצע ולחתום על העבודה.",
    "PV_VOC_COLD": "בבוקר קר המתח של המחרוזת עולה מעל מה שהממיר מסוגל לקבל, וזה עלול להרוס אותו.",
    "PV_VMP_HIGH": "בקור המחרוזת עובדת מעל טווח העבודה של הממיר ומאבדת ייצור.",
    "PV_VMP_LOW": "בקיץ חם המתח של המחרוזת יורד מתחת לטווח של הממיר והוא מפסיק לייצר.",
    "PV_MPPT_CURRENT": "יותר מדי מחרוזות על כניסה אחת של הממיר.",
    "PV_MPPT_REPEAT": "אותה כניסה מופיעה פעמיים ברשימה.",
    "PV_MPPT_COUNT": "אין לממירים מספיק כניסות לכל המחרוזות.",
    "PV_STRING_FUSE": "כשכמה מחרוזות מחוברות יחד, תקלה באחת מקבלת זרם מכל השאר; נתיך מגן עליה.",
    "PV_CABLE": "כבל המחרוזת דק מדי לזרם שעלול לעבור בו בתקלה.",
    "PV_DC_DU": "כמה ייצור הולך לאיבוד בכבלי ה-DC בדרך לממיר.",
    "PV_DC_SPD": "מגן מתח יתר שמגן על הממיר מברקים ומנחשולים בצד ה-DC.",
    "PV_DC_AC": "היחס בין הספק הפאנלים להספק הממיר.",
}


def as_dicts(findings: list[Finding]) -> list[dict[str, Any]]:
    return [{**asdict(f), "why": EXPLAIN.get(f.code, "")} for f in findings]
