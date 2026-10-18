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
from .model import Board, Busbar, Cable, Circuit, Design, Device, Enclosure, Group, Node, Supply, TitleBlock
from .panel import device_width_mm

STD_RATINGS = (10, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125)
CSA = (1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120)
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


def _connection_a(conn: str) -> int:
    m = re.search(r"(\d+)\s*[xX×]\s*(\d+)", conn or "")
    if not m:
        raise BriefError(f"גודל חיבור לא מזוהה: \"{conn}\" (לכתוב למשל 3X40A)")
    if m.group(1) != "3":
        raise BriefError("התבנית תומכת כרגע בחיבור תלת-פאזי בלבד")
    return int(m.group(2))


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


TEMPLATES = {"house-pv": house_pv}


def from_brief(brief: dict[str, Any], today: Optional[str] = None) -> Design:
    name = brief.get("template", "house-pv")
    fn = TEMPLATES.get(name)
    if fn is None:
        raise BriefError(f"תבנית לא מוכרת: {name} (קיימות: {', '.join(TEMPLATES)})")
    return fn(brief, today)
