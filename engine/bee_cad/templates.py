"""Job templates — a short brief (a few lines a project manager can fill in) → a full design.

The brief names the client, the connection, the PV / storage system and the house circuits by
plain Hebrew names. The template picks breakers, cables, RCD groups, phases, the PV feeder,
the backup board and the enclosure, then the rule checks review the result like any other design.

    bee-cad new examples/brief_house_pv.yaml --out design.json
"""
from __future__ import annotations

import math
import re
from datetime import date
from typing import Any, Optional

from .calc import U_LL, CableSpec, ampacity, voltage_drop_pct
from .checks import DU_LIMIT_LIGHTING_PCT, DU_LIMIT_PCT
from .model import (Board, Busbar, Cable, Circuit, Design, Device, Enclosure, Group, Node, PvArray, Supply,
                    TitleBlock)
from .panel import device_width_mm

STD_RATINGS = (10, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400)
MCB_MAX_A = 125         # above this the template draws a moulded-case breaker (mccb)
CSA = (1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240)
MAX_PER_RCD = 7          # 1P circuits behind one 4P 40A 30mA RCD
SPARE = 1.25             # enclosure spare capacity
DU_SUPPLY_PCT = 1.0      # budget for meter → main board

# (keywords, rating A, cable mm², three-phase) — first match wins
LOAD_RULES: list[tuple[tuple[str, ...], int, float, bool]] = [
    (("טעינ", "רכב חשמלי", "EV"), 32, 6, True),
    (("כיריים",), 16, 2.5, True),
    (("תאורה",), 10, 1.5, False),
    (("שקע",), 16, 2.5, False),
    (("מזגן", "מיזוג"), 16, 2.5, False),
    (("תנור", "דוד", "משאבת חום", "כביסה", "מייבש", "מדיח", "מקרר"), 16, 2.5, False),
]


class BriefError(ValueError):
    """A brief that cannot be turned into a design; Hebrew message."""


def next_rating(a: float) -> int:
    for r in STD_RATINGS:
        if r >= a:
            return r
    raise BriefError(f"זרם {a:.0f}A גדול מהדירוג הגבוה בתבנית ({STD_RATINGS[-1]}A); לתכנן ידנית")


def size_cable(rating: int, three_phase: bool, xlpe: bool, method: str) -> float:
    """Smallest copper cross-section whose IEC 60364-5-52 capacity carries the breaker rating."""
    for s in CSA:
        iz = ampacity(CableSpec(5 if three_phase else 3, s, "XLPE" if xlpe else "PVC"), method, 3 if three_phase else 2)
        if iz and iz >= rating:
            return s
    raise BriefError(f"אין חתך בטבלה שמתאים ל-{rating}A")


def upsize_for_drop(csa: float, rating: float, length: Optional[float], three: bool, budget: float,
                    prefix: str = "") -> float:
    """Grow the cross-section until the voltage drop at the breaker rating fits the budget."""
    if not length:
        return csa
    for s in CSA[CSA.index(csa):]:
        du = voltage_drop_pct(Cable(designation=f"{prefix}{5 if three else 3}X{_fmt(s)}", length_m=length), rating, three)
        if du is not None and du <= budget:
            return s
    raise BriefError(f"גם חתך {CSA[-1]} ממ\"ר לא עומד במפל המתח לאורך {length:g} מ'; לפצל את המעגל או להוסיף לוח משנה")


def _fmt(s: float) -> str:
    return f"{s:g}"


def _rule(name: str, spec: dict[str, Any]) -> tuple[int, float, bool]:
    for words, rating, csa, three in LOAD_RULES:
        if any(w in name for w in words):
            break
    else:
        rating, csa, three = 16, 2.5, False
    rating = int(spec.get("rating_a", rating))
    three = bool(spec.get("three_phase", three))
    if "rating_a" in spec and "csa_mm2" not in spec:
        csa = size_cable(rating, three, False, "B1")
    return rating, float(spec.get("csa_mm2", csa)), three


def _circuits(items: list[Any], prefix: str, du_upstream: float = 0.0) -> tuple[list[Circuit], list[Circuit]]:
    """→ (single-phase finals, three-phase finals), tagged M1… in brief order, phases balanced greedily."""
    singles: list[Circuit] = []
    threes: list[Circuit] = []
    load = {"L1": 0.0, "L2": 0.0, "L3": 0.0}
    for i, item in enumerate(items, 1):
        spec = item if isinstance(item, dict) else {"name": str(item)}
        name = spec.get("name") or spec.get("load") or ""
        if not name:
            raise BriefError(f"מעגל {i} בלי שם")
        rating, csa, three = _rule(name, spec)
        tag = f"{prefix}{i}"
        if "csa_mm2" not in spec:
            limit = DU_LIMIT_LIGHTING_PCT if "תאורה" in name else DU_LIMIT_PCT
            csa = upsize_for_drop(csa, rating, spec.get("length_m"), three, limit - du_upstream)
        cable = Cable(designation=f"{5 if three else 3}X{_fmt(csa)}", length_m=spec.get("length_m"))
        dev = Device(tag=tag, kind="mcb", poles=3 if three else 1, rating_a=rating, curve=spec.get("curve", "C"))
        c = Circuit(tag=tag, device=dev, cable=cable, load=name, load_kw=spec.get("kw"))
        if three:
            c.phase = "L1-3"
            threes.append(c)
        else:
            ph = min(load, key=lambda p: (load[p], p))
            c.phase = ph
            load[ph] += rating
            singles.append(c)
    return singles, threes


def _groups(singles: list[Circuit], threes: list[Circuit], prefix: str) -> list[Group]:
    groups: list[Group] = []
    letters = "ABCDEFGH"
    chunks = [singles[i:i + MAX_PER_RCD] for i in range(0, len(singles), MAX_PER_RCD)]
    plain_threes = [c for c in threes if c.device.rating_a <= 16]
    ev = [c for c in threes if c.device.rating_a > 16]
    if plain_threes:
        if chunks:
            chunks[-1].extend(plain_threes)
        else:
            chunks.append(plain_threes)
    for k, chunk in enumerate(chunks):
        tag = f"{prefix}RCD-{letters[k]}"
        groups.append(Group(tag=tag, device=Device(tag=tag, kind="rcd", poles=4, rating_a=40, idn_ma=30, rcd_type="A"),
                            circuits=chunk))
    for c in ev:
        tag = f"{prefix}RCD-{c.tag}"
        groups.append(Group(tag=tag, device=Device(tag=tag, kind="rcd", poles=4, rating_a=40, idn_ma=30, rcd_type="B"),
                            circuits=[c]))
    return groups


def _enclosure(b: Board) -> Enclosure:
    devices = [b.incomer, b.spd] + [g.device for g in b.groups] + [c.device for c in b.all_circuits()] + \
        [c.rcd for c in b.all_circuits()]
    modules = sum(device_width_mm(d) / 18.0 for d in devices if d)
    rows = max(2, math.ceil(modules * SPARE / 18))
    return Enclosure(model=f"ארון {rows}×18 מודולים", width_mm=500, height_mm=150 * rows + 200, depth_mm=160,
                     rows=rows, modules_per_row=18, mounting="flush", ip="IP40")


def _connection(conn: str) -> tuple[int, int]:
    """"3X40A" → (3, 40); "1X40A" → (1, 40)."""
    m = re.search(r"(\d+)\s*[xX×]\s*(\d+)", conn or "")
    if not m or m.group(1) not in ("1", "3"):
        raise BriefError(f"גודל חיבור לא מזוהה: \"{conn}\" (לכתוב למשל 3X40A או 1X40A)")
    return int(m.group(1)), int(m.group(2))


def _connection_a(conn: str) -> int:
    phases, amps = _connection(conn)
    if phases != 3:
        raise BriefError("התבנית תומכת כרגע בחיבור תלת-פאזי בלבד")
    return amps


def _breaker(tag: str, rating: int, poles: int, note: Optional[str] = None, lock: bool = True) -> Device:
    if rating > MCB_MAX_A:
        return Device(tag=tag, kind="mccb", poles=poles, rating_a=rating, lock=lock, note=note)
    return Device(tag=tag, kind="mcb", poles=poles, rating_a=rating, curve="C", lock=lock, note=note)


def house_pv(brief: dict[str, Any], today: Optional[str] = None) -> Design:
    sup = brief.get("supply") or {}
    conn = sup.get("connection", "3X40A")
    main_a = _connection_a(conn)
    s_main = upsize_for_drop(size_cable(main_a, True, True, "C"), main_a, sup.get("cable_length_m"), True,
                             DU_SUPPLY_PCT)
    du_main = voltage_drop_pct(Cable(designation=f"4X{_fmt(s_main)}", length_m=sup.get("cable_length_m")), main_a, True) or 0.0
    supply = Supply(kind="utility", meter=conn.upper(), earthing=sup.get("earthing", "TN-C-S"), ik_ka=sup.get("ik_ka"),
                    cable=Cable(designation=f"N2XY 4X{_fmt(s_main)}", length_m=sup.get("cable_length_m"), method="C"))
    singles, threes = _circuits(brief.get("circuits") or [], "M", du_main)
    if not singles and not threes:
        raise BriefError("לא הוגדרו מעגלים (circuits)")
    mdb = Board(id="MDB", title="לוח ראשי MDB", supply=supply,
                incomer=Device(tag="Q0", kind="mcb", poles=4, rating_a=main_a, curve="C", lock=True),
                busbar=Busbar(rating_a=next_rating(max(63, main_a))),
                spd=Device(tag="SPD", kind="spd", poles=4, note="T2 Up<1.5kV"),
                groups=_groups(singles, threes, ""))
    nodes: list[Node] = []
    boards = [mdb]
    notes = [f"המפסק הראשי Q0 בן ארבעה קטבים, {main_a}A לפי גודל החיבור {conn.upper()}; ניתן לנעילה במצב מופסק."]
    pv = brief.get("pv")
    if pv:
        inv = pv.get("inverter") or {}
        kw = float(inv.get("kw") or pv.get("kw") or 0)
        if not kw:
            raise BriefError("חסר הספק הממיר (pv.inverter.kw)")
        i_ac = float(inv.get("max_ac_a") or kw * 1000 / (math.sqrt(3) * U_LL))
        q = next_rating(1.25 * i_ac)
        s = size_cable(q, True, True, "C")
        cable = Cable(designation=f"5X{_fmt(s)} Cu N2XY", length_m=pv.get("cable_length_m"), method="C")
        hybrid = bool(inv.get("hybrid", bool(brief.get("battery"))))
        mdb.feeders.append(Circuit(tag="Q-INV", kind="feeder", to_node="INV", cable=cable,
                                   device=Device(tag="Q-INV", kind="mcb", poles=4, rating_a=q, curve="C", lock=True,
                                                 note="מפסק ראשי PV")))
        nodes.append(Node(id="INV", kind="inverter", label="ממיר היברידי" if hybrid else "ממיר",
                          sublabel=inv.get("model", ""), rating=f"{kw:g} kW · 400V",
                          device=Device(tag="RCD-INV", kind="rcd", poles=4, rating_a=next_rating(q), idn_ma=300,
                                        rcd_type=inv.get("rcd_type", "A"))))
        nodes.append(Node(id="PV", kind="pv", label="מערך PV", sublabel=pv.get("modules", ""),
                          rating=f"{pv['kwp']:g} kWp" if pv.get("kwp") else ""))
        notes.append(f"Q-INV {q}A לפי 1.25 × זרם הממיר ({i_ac:.1f}A); כבל {cable.designation} לפי IEC 60364-5-52 שיטה C.")
        notes.append("שילוט: \"מפסק ראשי של מיתקן פוטו-וולטאי\" על Q-INV, לבן על רקע אדום.")
        bat = brief.get("battery")
        if bat:
            nodes.append(Node(id="BAT", kind="battery", label="מערכת אגירה", sublabel=bat.get("model", ""),
                              rating=f"{bat['kwh']:g} kWh" if bat.get("kwh") else ""))
        backup = brief.get("backup")
        if backup and hybrid:
            b_single, b_three = _circuits(backup.get("circuits") or [], "B")
            bub = Board(id="BUB", title="לוח חיוני BUB",
                        supply=Supply(kind="inverter", label="מיציאת BACK-UP של הממיר", earthing="",
                                      cable=Cable(designation=f"5X{_fmt(s)} Cu", length_m=backup.get("cable_length_m"))),
                        incomer=Device(tag="Q-BU", kind="mcb", poles=4, rating_a=q, curve="C"),
                        busbar=Busbar(rating_a=next_rating(max(63, q))),
                        groups=_groups(b_single, b_three, "BU-"))
            bub.enclosure = _enclosure(bub)
            boards.append(bub)
            notes.append("הלוח החיוני מוזן מיציאת ה-BACK-UP בלבד; אין חיבור בינו לבין הרשת.")
    if any(g.device and g.device.rcd_type == "B" for g in mdb.groups):
        notes.append("עמדת הטעינה מוגנת בפחת Type B; אפשר Type A אם בעמדה מובנית הגנת 6mA DC.")
    mdb.enclosure = _enclosure(mdb)
    notes.append("נוצר מתבנית house-pv; כל הערכים לאישור מהנדס לפני הגשה.")
    title = TitleBlock(project=brief.get("project", ""), site=brief.get("site", ""), client=brief.get("client", ""),
                       sheet_no=brief.get("sheet_no", "E-01"), sheet_title="חד-קווי — לוח ראשי" +
                       (" ולוח חיוני" if len(boards) > 1 else ""),
                       date=today or date.today().isoformat(), status="לאישור")
    title.revisions = [("A", title.date, "הגשה ראשונה")]
    return Design(title=title, boards=boards, nodes=nodes, notes=notes)


def _pv_array(pv: dict[str, Any]) -> Optional[PvArray]:
    """The structured DC side from the app (module + inverter limits + strings), or None for a text-only brief."""
    if not pv.get("module") or not pv.get("strings"):
        return None
    try:
        inv = {k: v for k, v in (pv.get("inverter") or {}).items() if k in PvArray.model_fields["inverter"].annotation.model_fields}
        extra = {k: pv[k] for k in ("dc_cable_mm2", "dc_length_m") if pv.get(k) is not None}
        return PvArray(module=pv["module"], inverter=inv, strings=pv["strings"], modules_line=pv.get("modules_line", ""),
                       **extra)
    except Exception as e:  # pydantic: say which field, in Hebrew
        raise BriefError(f"נתוני המחרוזות (pv) לא תקינים: {e}") from e


def pv_connection(brief: dict[str, Any], today: Optional[str] = None) -> Design:
    """A PV (and storage) system connected to an existing main board — the job the app's quote sells.

    The existing circuits are not drawn. One inverter feeds Q-INV in the main board; several feed an AC
    combiner board PVB through Q-PV. The DC strings from the quote's string plan are checked (bee_cad.pv).
    """
    sup = brief.get("supply") or {}
    conn = str(sup.get("connection") or "3X40A").upper()
    phases, main_a = _connection(conn)
    three = phases == 3
    pv = brief.get("pv") or {}
    inv = pv.get("inverter") or {}
    kw = float(inv.get("kw") or 0)
    if not kw:
        raise BriefError("חסר הספק הממיר (pv.inverter.kw)")
    n = max(1, int(inv.get("count") or 1))
    if not three and (n > 1 or kw > 10):
        raise BriefError(f"חיבור חד-פאזי {conn}: עד ממיר אחד של 10 kW; לתכנן הגדלת חיבור לתלת-פאזי")
    poles = 4 if three else 2
    cores = 5 if three else 3
    i_ac = float(inv.get("max_ac_a") or (kw * 1000 / (math.sqrt(3) * U_LL) if three else kw * 1000 / 230))
    q = next_rating(1.25 * i_ac)
    array = _pv_array(pv)

    s_main = upsize_for_drop(size_cable(main_a, three, True, "C"), main_a, sup.get("cable_length_m"), three, DU_SUPPLY_PCT)
    supply = Supply(kind="utility", meter=conn, earthing=sup.get("earthing", "TN-C-S"), ik_ka=sup.get("ik_ka"),
                    voltage="400/230V" if three else "230V",
                    cable=Cable(designation=sup.get("cable") or f"N2XY {cores - 1}X{_fmt(s_main)}",
                                length_m=sup.get("cable_length_m"), method="C"))
    mdb = Board(id="MDB", title="לוח ראשי קיים", supply=supply, existing=True,
                incomer=_breaker("Q0", main_a, poles), busbar=Busbar(rating_a=next_rating(max(63, main_a)),
                                                                     label="L1,L2,L3,N" if three else "L,N"),
                spd=Device(tag="SPD", kind="spd", poles=poles, note="T2 Up<1.5kV"))
    hybrid = bool(inv.get("hybrid", bool(brief.get("battery"))))
    rcd_type = inv.get("rcd_type", "B")
    strings_of = {}
    if array:
        from .pv import inverter_of
        for st in array.strings:
            strings_of.setdefault(inverter_of(array, st.mppt), []).append(st)

    def inv_feeder(k: int, board: str) -> Circuit:
        tag = "Q-INV" if n == 1 else f"Q-INV{k}"
        length = (pv.get("inverter_cable_lengths_m") or [None] * n)[k - 1] if n > 1 else pv.get("cable_length_m")
        s = upsize_for_drop(size_cable(q, three, True, "C"), q, length, three, DU_SUPPLY_PCT)
        return Circuit(tag=tag, kind="feeder", to_node=f"INV{k}", device=_breaker(tag, q, poles, "מפסק ממיר"),
                       cable=Cable(designation=f"N2XY {cores}X{_fmt(s)}", length_m=length, method="C"))

    nodes: list[Node] = []
    boards = [mdb]
    notes = [f"לוח ראשי קיים: המעגלים הקיימים לא משורטטים. Q0 {main_a}A לפי גודל החיבור {conn}."]
    if n == 1:
        mdb.feeders.append(inv_feeder(1, "MDB"))
    else:
        q_pv = next_rating(1.25 * i_ac * n)
        s_pv = upsize_for_drop(size_cable(q_pv, True, True, "C"), q_pv, pv.get("cable_length_m"), True, DU_SUPPLY_PCT)
        mdb.feeders.append(Circuit(tag="Q-PV", kind="feeder", to_board="PVB", device=_breaker("Q-PV", q_pv, 4, "מפסק ראשי PV"),
                                   cable=Cable(designation=f"N2XY 5X{_fmt(s_pv)}", length_m=pv.get("cable_length_m"),
                                               method="C")))
        pvb = Board(id="PVB", title="לוח AC סולארי PVB",
                    supply=Supply(kind="board", label="מ-Q-PV בלוח הראשי", from_board="MDB", earthing=""),
                    incomer=Device(tag="Q-PVB", kind="switch", poles=4, rating_a=q_pv),
                    busbar=Busbar(rating_a=q_pv), spd=Device(tag="SPD-PV", kind="spd", poles=4, note="T2 Up<1.5kV"),
                    feeders=[inv_feeder(k, "PVB") for k in range(1, n + 1)])
        pvb.enclosure = _enclosure(pvb)
        boards.append(pvb)
        notes.append(f"Q-PV {q_pv}A לפי 1.25 × {n} ממירים × {i_ac:.1f}A.")
    for k in range(1, n + 1):
        own = strings_of.get(k, [])
        by_len: dict[int, int] = {}
        for st in own:
            by_len[st.modules] = by_len.get(st.modules, 0) + st.count
        sub = " + ".join(f"{c}×{m}" for m, c in sorted(by_len.items(), reverse=True)) + " פאנלים" if own else ""
        nodes.append(Node(id=f"INV{k}", kind="inverter", label=("ממיר היברידי" if hybrid else "ממיר") + (f" {k}" if n > 1 else ""),
                          sublabel=inv.get("model", ""), rating=f"{kw:g} kW · {'400V' if three else '230V'}",
                          device=Device(tag=f"RCD-INV{k if n > 1 else ''}", kind="rcd", poles=poles,
                                        rating_a=next_rating(q), idn_ma=300, rcd_type=rcd_type)))
        if array or pv.get("modules") or pv.get("modules_line"):
            mods = sum(st.count * st.modules for st in own) if own else None
            nodes.append(Node(id=f"PV{k}", kind="pv", label="מערך PV" + (f" {k}" if n > 1 else ""),
                              sublabel=sub or pv.get("modules_line") or pv.get("modules", ""),
                              rating=f"{mods * array.module.wp / 1000:g} kWp" if mods and array else
                              (f"{pv['kwp']:g} kWp" if pv.get("kwp") and n == 1 else "")))
    bat = brief.get("battery")
    if bat:
        nodes.append(Node(id="BAT", kind="battery", label="מערכת אגירה", sublabel=bat.get("model", ""),
                          rating=f"{bat['kwh']:g} kWh" if bat.get("kwh") else ""))
    mdb.enclosure = _enclosure(mdb)
    notes += [
        f"מפסק לכל ממיר {q}A לפי 1.25 × זרם הממיר ({i_ac:.1f}A); כבלים לפי IEC 60364-5-52 שיטה C, מפל מתח עד {DU_SUPPLY_PCT:g}%.",
        f"פחת 300mA Type {rcd_type} לכל ממיר, אלא אם יצרן הממיר מצהיר שאין זרם זליגה DC.",
        "מנתק DC דו-קוטבי לכל כניסת MPPT, ליד הממיר; מגן מתח יתר DC בממיר או בתיבת מחרוזות.",
        "הארקת מבנים ומסגרות: מוליך 16 ממ\"ר (10 ממ\"ר מותר כשמוגן מכנית).",
        "שילוט: ״מפסק ראשי של מיתקן פוטו-וולטאי״ על המפסק הראשי של ה-PV, ושלט אזהרה על כל לוח עם מקור הזנה נוסף.",
        "נוצר מתבנית pv-connection; כל הערכים לאישור מהנדס לפני הגשה.",
    ]
    title = TitleBlock(project=brief.get("project", ""), site=brief.get("site", ""), client=brief.get("client", ""),
                       sheet_no=brief.get("sheet_no", "E-01"),
                       sheet_title="חד-קווי — חיבור מערכת PV" + (" ואגירה" if bat else ""),
                       date=today or date.today().isoformat(), status="לאישור")
    title.revisions = [("A", title.date, "הגשה ראשונה")]
    return Design(title=title, boards=boards, nodes=nodes, notes=notes, pv=array)


TEMPLATES = {"house-pv": house_pv, "pv-connection": pv_connection}


def from_brief(brief: dict[str, Any], today: Optional[str] = None) -> Design:
    name = brief.get("template", "house-pv")
    fn = TEMPLATES.get(name)
    if fn is None:
        raise BriefError(f"תבנית לא מוכרת: {name} (קיימות: {', '.join(TEMPLATES)})")
    return fn(brief, today)
