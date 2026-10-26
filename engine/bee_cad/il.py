"""Israeli rules for a PV / storage connection — what the IEC (חח"י) and the licensed tester look at.

Sources (see /docs and the capability catalog for links):
  - Electricity Administration PV directive (הנחיות מינהל החשמל למתקנים פוטו-וולטאיים, 2022): §10 DC isolators,
    §13/§30 grid protection settings, §16–17 bonding, §19 Type B RCD, §23 Class II, §24–25 DC residual / insulation
    monitoring, §32 documents kept at the inverter, §33 + Appendix 3 signage.
  - Electricity Authority decision 70104 (13 Jan 2025, standards book chapter 3, standard 35כ2): connection tracks.
Every finding names its source. Items marked "לאימות" come from a single or secondary source and must be confirmed
by the designer; they are warnings, never errors.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Optional

from .checks import Finding
from .model import Design, GridConnection

FAST_TRACK_KVA = 15.0
EXPORT_CAP_KVA = 15.0
SHARE_OF_CONNECTION = 0.70          # installed < 70 % of the connection (50 % in the first year)
SHARE_FIRST_YEAR = 0.50
LARGE_KVA = 630.0
INSTALLED_FACTOR = 0.9              # installed capacity = inverter kVA × 0.9 (one IEC approval letter — לאימות)
STD_CONNECTIONS_3P = (25, 40, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630)
SRC_70104 = "החלטה 70104 (לאימות)"
SRC_DIR = "הנחיות מינהל החשמל ל-PV"


def connection_kva(g: GridConnection) -> float:
    return g.phases * 230.0 * g.amps / 1000.0


def inverter_kva(g: GridConnection) -> float:
    return g.inverter_kw * max(1, g.inverter_count)


def _min_connection_for(kva: float, share: float) -> Optional[str]:
    for a in STD_CONNECTIONS_3P:
        if kva < share * 3 * 230.0 * a / 1000.0:
            return f"3X{a}A"
    return None


def _grid(g: GridConnection, out: list[Finding]) -> None:
    conn = connection_kva(g)
    inv = inverter_kva(g)
    where = f"חיבור {g.phases}X{g.amps:g}A"
    if inv <= FAST_TRACK_KVA:
        out.append(Finding("info", "IL_TRACK", where,
                           f"ממירים {inv:g} kVA, עד {FAST_TRACK_KVA:g} kVA: מסלול מהיר ({SRC_70104})"))
    elif inv <= LARGE_KVA:
        out.append(Finding("info", "IL_TRACK", where,
                           f"ממירים {inv:g} kVA: מסלול {FAST_TRACK_KVA:g}–{LARGE_KVA:g} kVA" +
                           (" לצריכה עצמית" if g.self_consumption else "") + f" ({SRC_70104})"))
        share = SHARE_FIRST_YEAR if g.first_year else SHARE_OF_CONNECTION
        if inv >= share * conn and not g.self_consumption:
            need = _min_connection_for(inv, share)
            out.append(Finding("warn", "IL_CONNECTION_SHARE", where,
                               f"ממירים {inv:g} kVA הם {100 * inv / conn:.0f}% מגודל החיבור ({conn:.1f} kVA); "
                               f"המסלול דורש פחות מ-{share * 100:.0f}% ({SRC_70104})",
                               f"הגדלת חיבור ל-{need}" if need else "מסלול צריכה עצמית או חיבור מתח גבוה"))
        if g.export_limit_kw is None or g.export_limit_kw > EXPORT_CAP_KVA:
            have = "אין מגביל הזרמה" if g.export_limit_kw is None else f"מגביל הזרמה {g.export_limit_kw:g} kW"
            out.append(Finding("warn", "IL_EXPORT_LIMIT", where,
                               f"ממירים {inv:g} kVA מעל {FAST_TRACK_KVA:g} kVA ו{have}: ההזרמה לרשת מוגבלת ל-"
                               f"{EXPORT_CAP_KVA:g} kVA ({SRC_70104})",
                               "להגדיר מגביל הזרמה (export limiter) ומד זרם בנקודת החיבור"))
        out.append(Finding("info", "IL_INSTALLED", where,
                           f"הספק מותקן לפי חח\"י ≈ {inv:g} × {INSTALLED_FACTOR:g} = {inv * INSTALLED_FACTOR:.1f} kVA (לאימות)"))
    else:
        out.append(Finding("warn", "IL_TRACK", where,
                           f"ממירים {inv:g} kVA מעל {LARGE_KVA:g} kVA: חיבור דרך המחלק הדומיננטי ובדיקה שלו ({SRC_DIR} §13)",
                           "לתאם עם חח\"י לפני התכנון המפורט"))
    if g.phases == 1 and g.battery_kw and g.battery_kw > 5:
        out.append(Finding("error", "IL_STORAGE_1P", "אגירה",
                           f"אגירה חד-פאזית {g.battery_kw:g} kW, מעל 5 kVA (הנחיית לשכת המהנדסים 2024, לאימות)",
                           "חיבור תלת-פאזי או מערכת אגירה קטנה יותר"))
    if g.battery_kw and g.battery_kw > 10:
        out.append(Finding("info", "IL_STORAGE_PERMIT", "אגירה",
                           f"אגירה {g.battery_kw:g} kW, מעל 10 kVA: נדרש היתר/אישור חח\"י לאגירה (לאימות); "
                           "מיקום מחוץ לחדרי מגורים, מרווח 0.6 מ'"))


def _directive(d: Design, g: Optional[GridConnection], out: list[Finding]) -> None:
    pv = d.pv
    kwp = pv.kwp() if pv else (g.kwp if g else 0.0)
    if kwp:
        structure = 10 if kwp <= 15 else 16
        out.append(Finding("info", "IL_BONDING", "הארקה",
                           f"השוואת פוטנציאלים: מבנה הפאנלים {structure} ממ\"ר נחושת לפחות"
                           f"{' (עד 15 kWp)' if structure == 10 else ''}, גוף הממיר 10 ממ\"ר, לפס השוואת הפוטנציאלים "
                           f"({SRC_DIR} §16–17)"))
    for n in d.nodes:
        if n.kind == "inverter" and n.device and n.device.kind == "rcd" and (n.device.rcd_type or "").upper() != "B":
            out.append(Finding("warn", "IL_RCD_TYPE", n.id,
                               f"פחת Type {n.device.rcd_type or '?'} לממיר; ההנחיה דורשת Type B לפי ת\"י 62423 ({SRC_DIR} §19)",
                               "Type B, או הצהרת יצרן: הפרדה גלוונית / IEC 62109-1 / Type A עם RDC-DD לפי IEC 62955"))
    if pv:
        from .pv import module_volts
        voc = max((s.modules * module_volts(pv.module).voc_cold for s in pv.strings), default=0)
        if voc > 60:
            out.append(Finding("info", "IL_CLASS_II", "PV",
                               f"Voc מקסימלי {voc:.0f}V מעל 60V: ציוד ובידוד DC בדרגה II, כבלים מבודדים כפול ({SRC_DIR} §23)"))
        inv_kva = pv.inverter.kw * max(1, pv.inverter.count)
        rdc = 300 + max(0.0, pv.inverter.kw - 30) * 10
        out.append(Finding("info", "IL_DC_MONITOR", "PV",
                           f"הממיר חייב ניטור זרם זליגה DC (סף {rdc:.0f}mA לממיר של {pv.inverter.kw:g} kVA, ניתוק תוך 0.3 שנ') "
                           f"וניטור בידוד DC עם בדיקה יומית ({SRC_DIR} §24–25); לוודא בדף הנתונים"))
        out.append(Finding("info", "IL_GRID_SETTINGS", "PV",
                           f"הגדרות הגנת רשת בממיר: ניתוק תוך 0.2 שנ' בהיעדר רשת, חיבור מחדש אחרי 5 דק' לפחות, "
                           f"תדר 47–51.5Hz ({SRC_DIR} §13, §30); סה\"כ {inv_kva:g} kVA"))


def check_il(d: Design) -> list[Finding]:
    out: list[Finding] = []
    if d.grid:
        _grid(d.grid, out)
    if d.pv or d.grid:
        _directive(d, d.grid, out)
    return out


@dataclass
class Label:
    where: str
    text: str
    qty: int


def labels(d: Design) -> list[Label]:
    """The sign set (Appendix 3 wording to confirm against the directive): what to print and where."""
    if not d.pv and not d.grid:
        return []
    out = [
        Label("מפסק ראשי בלוח הראשי", "זהירות! במתקן זה קיים מקור הזנה נוסף — מיתקן פוטו-וולטאי", 1),
        Label("מפסק/י הממיר", "מפסק ראשי של מיתקן פוטו-וולטאי", max(1, d.pv.inverter.count if d.pv else 1)),
        Label("כל לוח בדרך מהממיר לחיבור", "לוח זה מוזן משני מקורות: רשת ומיתקן פוטו-וולטאי",
              max(1, len([b for b in d.boards]))),
        Label("ממיר", "זהירות! מתח DC גם לאחר ניתוק הרשת. לנתק את צד ה-DC לפני עבודה", max(1, d.pv.inverter.count if d.pv else 1)),
    ]
    if d.pv:
        from .pv import module_volts
        voc = max((s.modules * module_volts(d.pv.module).voc_cold for s in d.pv.strings), default=0)
        out.append(Label("מנתק DC לכל כניסת MPPT", f"מנתק DC — מערך פוטו-וולטאי. מתח DC עד {math.ceil(voc / 10) * 10:.0f}V",
                         len(d.pv.strings)))
        runs = sum(2 * s.count * math.ceil((s.length_m or d.pv.dc_length_m or 0) / 3) for s in d.pv.strings)
        if runs:
            out.append(Label("כבלי DC, כל 3 מ' לכל היותר", "כבל DC סולארי — מתח גם כשהמערכת מנותקת", runs))
    if any(n.kind == "battery" for n in d.nodes):
        out.append(Label("מערכת האגירה", "מערכת אגירת אנרגיה — מקור מתח. לנתק לפני עבודה", 1))
    return out


# PV directive §32(א): kept at the inverter or its board
SUBMISSION = [
    ("sld", "תוכנית חד-קווית AC ו-DC", True),
    ("calc", "דף חישובים (כבלים, מפל מתח, זרם קצר)", True),
    ("bom", "כתב כמויות", True),
    ("cables", "טבלת כבלים", True),
    ("labels", "רשימת שילוט", True),
    ("site", "תוכנית העמדה (מיקום המערך, הממירים והלוחות)", False),
    ("earthing", "תוכנית הארקה והשוואת פוטנציאלים", False),
    ("control", "תוכנית פיקוד (מגביל הזרמה, מונה דו-כיווני)", False),
    ("tester", "טופס בודק (נספח 2) והצהרת מתקין (נספח 4)", False),
]


def submission() -> list[dict]:
    return [{"id": k, "name": name, "produced": done} for k, name, done in SUBMISSION]
