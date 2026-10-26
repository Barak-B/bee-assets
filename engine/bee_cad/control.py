"""Two documents of the PV directive's §32 list that the set did not draw yet:

  - control diagram (תוכנית פיקוד): how export is limited and metered — the IEC bi-directional meter, the meter /
    CT at the connection point, the limiter link to every inverter, battery BMS and monitoring links — with the
    grid-protection settings the inverter must carry (§13, §30). Schematic, not to scale.
  - installer declaration (הצהרת מתקין): the system data from the design and the statements the licensed
    installer signs. The wording follows the directive's intent and is marked for checking against Appendix 4.
"""
from __future__ import annotations

from dataclasses import dataclass

from ezdxf.enums import TextEntityAlignment as TA

from .model import Design
from .sheet import TB_H, SheetContext

SRC_DIR = "הנחיות מינהל החשמל ל-PV"


@dataclass
class Setting:
    what: str
    value: str
    source: str


def grid_settings(d: Design) -> list[Setting]:
    """What is set in each inverter before it is energised. Values the directive gives are stated; the rest point
    to the IEC table and are flagged for checking."""
    g = d.grid
    out = [
        Setting("קוד מדינה / רשת בממיר", "Israel (לפי רשימת הממירים המאושרים בחח\"י)", f"{SRC_DIR} §13"),
        Setting("ניתוק בהיעדר רשת (anti-islanding)", "≤ 0.2 שנ'", f"{SRC_DIR} §13, §30"),
        Setting("חיבור מחדש אחרי חזרת הרשת", "≥ 5 דק' (300 שנ')", f"{SRC_DIR} §30"),
        Setting("תחום תדר", "47–51.5 Hz", f"{SRC_DIR} §13"),
        Setting("ספי מתח עליון / תחתון", "לפי טבלת הגדרות חח\"י לממיר (לאימות)", f"{SRC_DIR} §13"),
    ]
    if g and g.export_limit_kw is not None:
        out.append(Setting("מגביל הזרמה לרשת", f"{g.export_limit_kw:g} kW בנקודת החיבור, סכום כל הממירים",
                           "החלטה 70104 (לאימות)"))
        out.append(Setting("בכשל תקשורת עם המונה", "הממירים יורדים להזרמה 0 / להספק המוגבל (fail-safe)",
                           "הוראות היצרן; לבדוק בהפעלה"))
    if g and g.battery_kw:
        out.append(Setting("מערכת אגירה", "טעינה מהרשת וזמני פריקה לפי אישור חח\"י", "אישור החיבור"))
    return out


def _box(ctx: SheetContext, x: float, y: float, w: float, h: float, title: str, sub: str = "",
         layer: str = "sld_sym") -> tuple[float, float]:
    """Box centred at (x, y); returns its centre."""
    ctx.rect(x - w / 2, y - h / 2, w, h, layer)
    ctx.text(title, (x, y + (1.6 if sub else 0.0)), 2.2, "sld_text", TA.MIDDLE_CENTER, bold=True)
    if sub:
        ctx.text(sub, (x, y - 2.6), 1.7, "sld_tag", TA.MIDDLE_CENTER)
    return x, y


def draw_control(ctx: SheetContext, design: Design) -> list[str]:
    g = design.grid
    pv = design.pv
    warnings: list[str] = []
    n_inv = max(1, pv.inverter.count if pv else (g.inverter_count if g else 1))
    inv_kw = pv.inverter.kw if pv else (g.inverter_kw if g else 0.0)
    inv_model = (pv.inverter.model if pv else "") or "ממיר"
    ctx.text("תוכנית פיקוד — מדידה, הגבלת הזרמה ותקשורת (סכמתית)", (ctx.x1 - 4.0, ctx.y1 - 15.0), 3.0, "legend",
             TA.BOTTOM_RIGHT, bold=True)

    # power chain, right (grid) to left (inverters)
    y = ctx.y1 - 55.0
    bw, bh = 40.0, 14.0
    xs = [ctx.x1 - 30.0 - i * 58.0 for i in range(5)]
    conn = f"{g.phases}X{g.amps:g}A" if g else ""
    _box(ctx, xs[0], y, bw, bh, "רשת חח\"י", conn)
    _box(ctx, xs[1], y, bw, bh, "מונה דו-כיווני", "של חח\"י")
    _box(ctx, xs[2], y, bw, bh, "מפסק ראשי", "לוח ראשי")
    meter = (g.export_meter if g else "") or "מונה / CT למגביל"
    limited = bool(g and g.export_limit_kw is not None)
    _box(ctx, xs[3], y, bw, bh, "נקודת מדידה", meter if limited else "לא נדרשת", "sld_sym" if limited else "existing")
    _box(ctx, xs[4], y, bw, bh, "פס הלוח", "צרכנים + ממירים")
    for a, b in zip(xs, xs[1:]):
        ctx.line((a - bw / 2, y), (b + bw / 2, y), "sld_main")

    # inverters below the busbar box, fed from it
    iy = y - 48.0
    span = min(n_inv, 6)
    ix = [xs[4] + 20.0 - k * 46.0 for k in range(span)]
    ctx.line((xs[4], y - bh / 2), (xs[4], iy + 16.0), "sld_main")
    ctx.line((ix[0], iy + 16.0), (ix[-1], iy + 16.0), "sld_main")
    for k, x in enumerate(ix):
        label = f"INV{k + 1}" if span == n_inv or k < span - 1 else f"INV{k + 1}…{n_inv}"
        ctx.line((x, iy + 16.0), (x, iy + bh / 2), "sld_main")
        _box(ctx, x, iy, bw, bh, label, (pv.inverter.model if pv and pv.inverter.model else f"{inv_kw:g} kW")[:24])

    # communication links (dashed)
    cy = iy - 22.0
    if limited:
        ctx.line((xs[3], y - bh / 2), (xs[3], cy), "comm")
        ctx.line((xs[3], cy), (ix[-1], cy), "comm")
        for x in ix:
            ctx.line((x, cy), (x, iy - bh / 2), "comm")
        ctx.text(f"RS485 / Modbus — הגבלת הזרמה ל-{g.export_limit_kw:g} kW", ((xs[3] + ix[-1]) / 2, cy - 1.5), 1.9,
                 "sld_tag", TA.TOP_CENTER)
    else:
        ctx.text("ללא מגביל הזרמה: כל ההספק מוזרם לרשת לפי אישור החיבור", (xs[3], y - bh / 2 - 3.0), 1.9, "sld_tag",
                 TA.TOP_CENTER)
    mon = (g.monitoring if g else "") or "Wi-Fi / LAN / סלולרי"
    mx = ix[-1] - 52.0
    _box(ctx, mx, iy, bw, bh, "ניטור", mon[:22])
    ctx.line((ix[-1] - bw / 2, iy), (mx + bw / 2, iy), "comm")
    has_bat = bool(g and g.battery_kw) or any(n.kind in ("battery", "bess") for n in design.nodes)
    if has_bat:
        by = iy - 44.0
        _box(ctx, ix[0], by, bw, bh, "מערכת אגירה", f"{g.battery_kwh or ''} kWh / {g.battery_kw or ''} kW" if g else "")
        ctx.line((ix[0], iy - bh / 2), (ix[0], by + bh / 2), "comm")
        ctx.text("CAN / RS485 — BMS", (ix[0] + 1.5, (iy + by) / 2), 1.8, "sld_tag", TA.MIDDLE_LEFT)

    # settings table, bottom right
    from .sheets_il import _table
    rows = [[s.what, s.value, s.source] for s in grid_settings(design)]
    width = (ctx.x1 - ctx.x0) * 0.62
    _table(ctx, "הגדרות הגנת רשת ופיקוד בממיר", [("פרמטר", 34.0), ("ערך", 44.0), ("מקור", 26.0)], rows,
           ctx.x1 - 4.0, ctx.y0 + TB_H + 10.0 + 4.4 * (len(rows) + 1), width)
    notes = [
        "המונה של חח\"י מודד יבוא ויצוא; נקודת המדידה של המגביל אחריו, לפני כל צרכן או ממיר.",
        "המגביל מודד את סכום הפאזות; בחיבור תלת-פאזי — CT בכל פאזה, בכיוון החץ לרשת.",
        "בדיקה בהפעלה: עומס אפס במתקן ⇒ ההזרמה לא עולה על הערך המוגדר; ניתוק תקשורת ⇒ הממירים יורדים.",
        "קווי תקשורת בכבל מסוכך זוג שזור, מופרדים מכבלי הכוח או בתעלה נפרדת.",
    ]
    ctx.text("הערות", (ctx.x0 + 4.0 + (ctx.x1 - ctx.x0) * 0.33, ctx.y0 + TB_H + 46.0), 2.2, "notes", TA.TOP_RIGHT,
             bold=True)
    ctx.mtext(notes, (ctx.x0 + 4.0 + (ctx.x1 - ctx.x0) * 0.33, ctx.y0 + TB_H + 42.0), 1.8, "notes",
              width=(ctx.x1 - ctx.x0) * 0.32)
    if g and g.inverter_kw * max(1, g.inverter_count) > 15 and not limited:
        warnings.append("inverters above 15 kVA without an export limiter")
    return warnings


DECLARATION = [
    "המתקן הותקן לפי התוכניות המצורפות, לפי חוק החשמל ותקנותיו ולפי הנחיות מינהל החשמל למתקנים פוטו-וולטאיים.",
    "הפאנלים עומדים ב-IEC 61215 / IEC 61730 והממירים ב-IEC 62109-1/2, ברשימת הממירים המאושרים בחח\"י.",
    "הגדרות הגנת הרשת בממירים הוגדרו לפי טבלת חח\"י (ניתוק ≤ 0.2 שנ', חיבור מחדש ≥ 5 דק').",
    "מגביל ההזרמה, אם נדרש, הוגדר ונבדק בעומס אפס ובניתוק תקשורת.",
    "הארקת המבנה, גוף הממיר ומגני מתח היתר בוצעה לפי תוכנית ההארקה; רציפות נמדדה.",
    "השילוט הותקן לפי נספח 3 להנחיות, כולל שילוט כבלי DC וכל לוח המוזן משני מקורות.",
    "בדיקות המסירה בוצעו ותוצאותיהן מצורפות; המסמכים לפי §32 הושארו ליד הממיר.",
]


def declaration_fields(d: Design) -> list[tuple[str, str]]:
    g, pv, t, ins = d.grid, d.pv, d.title, d.installer
    inv = (f"{pv.inverter.count} × {pv.inverter.model or 'ממיר'} {pv.inverter.kw:g} kW" if pv
           else (f"{g.inverter_count} × {g.inverter_kw:g} kW" if g else ""))
    mods = f"{pv.modules_total()} × {pv.module.wp:g} Wp" if pv else ""
    kwp = pv.kwp() if pv else (g.kwp if g else 0.0)
    return [
        ("שם הלקוח", t.client), ("כתובת האתר", t.site), ("פרויקט", t.project),
        ("הספק DC", f"{kwp:.2f} kWp" if kwp else ""), ("פאנלים", mods), ("ממירים", inv),
        ("חיבור לרשת", f"{g.phases}X{g.amps:g}A" if g else ""),
        ("מגביל הזרמה", f"{g.export_limit_kw:g} kW" if g and g.export_limit_kw is not None else "ללא"),
        ("אגירה", f"{g.battery_kwh or ''} kWh / {g.battery_kw:g} kW" if g and g.battery_kw else "ללא"),
        ("שם המתקין", ins.name if ins else ""), ("מס' רישיון וסוג", " · ".join(filter(None, [ins.license_no, ins.license_type])) if ins else ""),
        ("חברה וטלפון", " · ".join(filter(None, [ins.company, ins.phone])) if ins else ""),
    ]


def draw_declaration(ctx: SheetContext, design: Design) -> list[str]:
    from .sheets_il import _table
    width = (ctx.x1 - ctx.x0) * 0.48
    ctx.text("הצהרת מתקין — מיתקן פוטו-וולטאי (נוסח לאימות מול נספח 4 להנחיות)", (ctx.x1 - 4.0, ctx.y1 - 15.0), 3.0,
             "legend", TA.BOTTOM_RIGHT, bold=True)
    fields = declaration_fields(design)
    y = _table(ctx, "נתוני המתקן", [("שדה", 30.0), ("ערך", 70.0)], [[k, v] for k, v in fields], ctx.x1 - 4.0,
               ctx.y1 - 24.0, width)
    lines = [f"{i + 1}. {s}" for i, s in enumerate(DECLARATION)]
    ctx.text("אני החתום מטה מצהיר כי:", (ctx.x1 - 4.0, y - 10.0), 2.8, "notes", TA.TOP_RIGHT, bold=True)
    ctx.mtext(lines, (ctx.x1 - 4.0, y - 16.0), 2.5, "notes", width=(ctx.x1 - ctx.x0) - 12.0)
    sy = ctx.y0 + TB_H + 22.0
    for k, who in enumerate(("המתקין", "המהנדס המתכנן", "הבודק")):
        x = ctx.x1 - 4.0 - k * ((ctx.x1 - ctx.x0) / 3)
        ctx.text(who, (x, sy + 10.0), 2.2, "notes", TA.BOTTOM_RIGHT, bold=True)
        ctx.text("שם: ______________   רישיון: ________", (x, sy + 4.0), 1.9, "notes", TA.BOTTOM_RIGHT)
        ctx.text("תאריך: __________   חתימה: __________", (x, sy - 2.0), 1.9, "notes", TA.BOTTOM_RIGHT)
    missing = [k for k, v in fields if not v and k in ("שם המתקין", "מס' רישיון וסוג")]
    return [f"declaration: missing {', '.join(missing)}"] if missing else []
