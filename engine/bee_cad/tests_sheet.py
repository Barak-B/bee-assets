"""Commissioning test sheet (טופס בדיקות מסירה) — what the installer and the licensed tester measure, with the
value each measurement must meet, computed from the design (IEC 62446-1 for the DC side, IEC 60364-6 for AC;
the tester's own form is Appendix 2 of the PV directive).

Rows leave the "measured" column blank: it is printed and filled on site, and the app's commissioning
report (string_ref per DesignString) carries the same expected values.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass

from .calc import C_MIN, TRIP_MULTIPLE, U_PH
from .model import Design
from .pv import T_CELL_MAX_C, dc_rows


@dataclass
class TestRow:
    group: str          # "DC" / "AC" / "RCD" / "כללי"
    ref: str            # what is tested
    test: str           # the measurement
    expect: str         # the pass value
    unit: str = ""


RISO_DC_MOHM = 1.0      # IEC 62446-1 Table 2: ≥ 1 MΩ at 1000 V test for arrays above 120 V
RISO_AC_MOHM = 1.0      # IEC 60364-6 Table 6.1: ≥ 1 MΩ at 500 V for circuits up to 500 V


def test_rows(design: Design) -> list[TestRow]:
    rows: list[TestRow] = [
        TestRow("כללי", "מתקן", "בדיקה חזותית: שילוט, הידוק מהדקים, מעברי כבלים, מרחקי בטיחות", "תקין"),
        TestRow("כללי", "הארקה", "רציפות מוליכי הארקה והשוואת פוטנציאלים (מבנה, ממיר, לוחות)", "< 0.5", "Ω"),
    ]
    pv = design.pv
    if pv:
        for r in dc_rows(pv):
            ref = f"INV{r.inverter} MPPT{r.mppt}" + (f" ({r.face})" if r.face else "")
            voc_stc = r.modules * pv.module.voc
            voc_hot = voc_stc * (1 + pv.module.beta_voc_pct / 100 * (T_CELL_MAX_C - 25))
            rows += [
                TestRow("DC", ref, f"קוטביות ו-Voc למחרוזת ({r.modules} פאנלים)",
                        f"מינ' {voc_hot:.0f}, מקס' {r.voc_cold:.0f}, STC {voc_stc:.0f}; הפרש בין מחרוזות זהות < 5%", "V"),
                TestRow("DC", ref, f"Isc ({r.strings} מחרוזות במקביל), לנרמל לקרינה",
                        f"עד {r.strings * pv.module.isc:.1f} ב-1000W/m²; הפרש בין מחרוזות < 5%", "A"),
                TestRow("DC", ref, "בידוד +/− מול הארקה (1000V)", f"≥ {RISO_DC_MOHM:g}", "MΩ"),
            ]
            if r.fuse_a:
                rows.append(TestRow("DC", ref, "נתיכי gPV בשני הקטבים", f"{r.fuse_a}A gPV, רציפות", ""))
        rows.append(TestRow("DC", "ממיר", "ניטור בידוד DC ומגן זרם זליגה DC פעילים (הנחיות PV §24–25)", "פעיל, נבדק בהפעלה"))
        rows.append(TestRow("AC", "ממיר", "ניתוק בהיעדר רשת וחיבור מחדש (הנחיות PV §13, §30)",
                            "ניתוק ≤ 0.2 שנ', חיבור מחדש ≥ 5 דק'"))
    for b in design.boards:
        for c in b.all_circuits():
            d = c.device
            if not c.cable:
                continue
            ref = f"{b.id} / {c.tag}"
            rows.append(TestRow("AC", ref, "בידוד בין מוליכים ומול הארקה (500V)", f"≥ {RISO_AC_MOHM:g}", "MΩ"))
            mult = TRIP_MULTIPLE.get((d.curve or "C").upper()[:1]) if d.kind in ("mcb", "rcbo") else None
            if mult and d.rating_a and c.kind == "final":
                zs_max = C_MIN * U_PH / (mult * d.rating_a)
                rows.append(TestRow("AC", ref, f"עכבת לולאת תקלה ({d.curve or 'C'}{d.rating_a:g})", f"≤ {zs_max:.2f}", "Ω"))
    seen: set[str] = set()
    for b in design.boards:
        devs = [g.device for g in b.groups if g.device] + [c.device for c in b.all_circuits()] + \
               [n.device for n in design.nodes if n.device]
        for d in devs:
            if d.kind not in ("rcd", "rcbo") or not d.idn_ma or d.tag in seen:
                continue
            seen.add(d.tag)
            t = f" Type {d.rcd_type}" if d.rcd_type else ""
            rows.append(TestRow("RCD", d.tag, f"זמן ניתוק ב-IΔn ({d.idn_ma}mA{t})", "≤ 300", "ms"))
            rows.append(TestRow("RCD", d.tag, f"זמן ניתוק ב-5×IΔn ({5 * d.idn_ma}mA)", "≤ 40", "ms"))
            if d.rcd_type == "B":
                rows.append(TestRow("RCD", d.tag, "ניתוק בזרם DC חלק (Type B)", f"≤ {2 * d.idn_ma}mA DC", ""))
    return rows


def as_dicts(rows: list[TestRow]) -> list[dict]:
    return [asdict(r) for r in rows]


TEST_COLS = [("קבוצה", 9.0), ("נבדק", 26.0), ("בדיקה", 62.0), ("ערך נדרש", 46.0), ("יחידה", 9.0), ("נמדד", 20.0), ("תקין", 10.0)]


def draw_tests(ctx, rows: list[TestRow], last: bool) -> list[str]:
    from .sheets_il import _table
    width = ctx.x1 - ctx.x0 - 8.0
    y = _table(ctx, "טופס בדיקות מסירה — ערכים נדרשים מהתכנון", TEST_COLS,
               [[r.group, r.ref, r.test, r.expect, r.unit, "", ""] for r in rows], ctx.x1 - 4.0, ctx.y1 - 16.0, width)
    if last:
        ctx.mtext(["הבודק ממלא את עמודת 'נמדד' בשטח. ערכי Voc ו-Isc לנרמל לטמפרטורת התא ולקרינה בזמן המדידה.",
                   "Zs המותר: 0.95 × 230V / סף הניתוק המגנטי. בידוד לפי IEC 62446-1 ו-IEC 60364-6.",
                   "שם הבודק: ______________   מס' רישיון: __________   תאריך: __________   חתימה: __________"],
                  (ctx.x1 - 4.0, y - 6.0), 1.9, "notes", width=width * 0.7)
    return []
