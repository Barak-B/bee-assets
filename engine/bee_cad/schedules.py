"""Table sheets: cable schedule (רשימת כבלים), load summary (טבלת עומסים), general notes + legend.

All rows come from the ``Design`` — every cable that appears on a single-line sheet appears here with
the same designation, so the schedule can never drift from the drawings. Long tables paginate
(E-30, E-30A, …). The general-notes sheet carries the office's standard notes (or the design's own),
the source documents and a symbol legend built from the block library.
"""
from __future__ import annotations

from dataclasses import dataclass

from ezdxf.enums import TextEntityAlignment as TA

from .layers import LAYERS
from .model import Design
from .sheet import SheetContext, TB_H, TB_W
from .symbols import device_block_name

ROW_H = 4.4
HEAD_H = 5.0

# ----------------------------------------------------------------------------- notes library
STANDARD_NOTES = [
    "כל העבודות יבוצעו בהתאם לחוק החשמל, התשי\"ד–1954, ולתקנות שהותקנו מכוחו, בהתאם לתקנים הישראליים הרלוונטיים ולהוראות יצרני הציוד.",
    "לוחות החשמל ייבנו ויבדקו לפי ת\"י 61439 חלקים 1 ו-2 ותקנות החשמל (התקנת לוחות חשמל במתח עד 1000 וולט), התשנ\"א–1991; יסופקו עם תיעוד בדיקות שגרה, חישובי חימום ותוכניות As-Made.",
    "הארקות ואמצעי הגנה בפני חשמול — לפי תקנות החשמל (הארקות ואמצעי הגנה בפני חשמול במתח עד 1000 וולט), התשנ\"א–1991; הארקת יסוד לפי תקנות החשמל (הארקות יסוד), התשמ\"א–1981.",
    "מעגלים סופיים — לפי תקנות החשמל (מעגלים סופיים הניזונים במתח עד 1000 וולט), התשמ\"ה–1984; מעגלי שקעים יוגנו במפסק פחת ≤30mA.",
    "התקנת מוליכים וכבלים — לפי תקנות החשמל (התקנת מוליכים), התש\"ל–1970, ושיטות ההתקנה של IEC 60364-5-52; חתכי הכבלים בתוכנית הם מינימום ואינם פוטרים מחישוב מפל מתח והעמסה לפי אורכי התוואי בפועל.",
    "כל הציוד יהיה חדש, תקני, ובעל אישור/סימון תקן ישראלי או אירופי מוכר; ציוד חוץ בדרגת אטימות IP65 לפחות אלא אם צוין אחרת.",
    "סימון: כל לוח, מפסק, מעגל וכבל יסומנו בשלט חרוט בר-קיימא בהתאם לתוכניות; שילוט אזהרה \"המתקן מוזן ממספר מקורות\" בכל לוח המוזן גם ממערכת סולארית/אגירה.",
    "אין לבצע מדידות על פי קנה המידה מהשרטוט; כל המידות באתר ייבדקו על ידי הקבלן לפני הביצוע, וכל אי-התאמה תדווח למתכנן.",
    "תוכנית זו משלימה את יתר מסמכי ההתקשרות (מפרט טכני, כתב כמויות, תוכניות הקונסטרוקציה והאדריכלות); במקרה של סתירה יש לפנות למתכנן לפני הביצוע.",
    "בסיום העבודה: בדיקת בודק חשמל מוסמך בהתאם לסוג המתקן, מסירת תיק מתקן (As-Made, בדיקות, תעודות ציוד) למזמין.",
]

LEGEND_ITEMS = [
    ("BEE_MCB_4P", "מפסק זרם ראשי / מא\"ז"), ("BEE_MCCB_4P", "מפסק יצוק (MCCB)"), ("BEE_MCB_1P", "מפסק זעיר (MCB)"),
    ("BEE_RCD_4P", "מפסק פחת"), ("BEE_RCBO_1P", "מפסק זעיר משולב פחת"), ("BEE_SW_3P", "מנתק / מפסק עומס"),
    ("BEE_FUSE", "נתיך"), ("BEE_SPD", "מגן ברקים (SPD)"), ("BEE_CONTACTOR_4P", "מגען"),
    ("BEE_METER_KWH", "מונה אנרגיה"), ("BEE_METER_PM", "רב-מודד (PM)"), ("BEE_CT", "משנה זרם"),
    ("BEE_INVERTER", "ממיר / PCS"), ("BEE_BATTERY", "מצבר / BESS"), ("BEE_PV", "מערך PV"),
    ("BEE_TRANSFORMER", "שנאי"), ("BEE_GENERATOR", "גנרטור"), ("BEE_EARTH", "הארקה"),
    ("BEE_SOCKET", "שקע"), ("BEE_LOAD", "צרכן / יציאה"), ("BEE_LOCK", "נעילה במצב מופסק"),
]

ABBREVIATIONS = [
    ("MDB", "לוח ראשי"), ("BUB", "לוח חיוני (Back-Up)"), ("PCS", "ממיר דו-כיווני לאגירה"), ("BESS", "מערכת אגירת אנרגיה"),
    ("EMS", "מערכת ניהול אנרגיה"), ("SPD", "מגן ברקים"), ("RCD", "מפסק פחת"), ("MCCB", "מפסק יצוק"), ("ACB", "מפסק אוויר"),
    ("CT", "משנה זרם"), ("VT", "משנה מתח"), ("PM", "רב-מודד"), ("פה\"פ", "פס השוואת פוטנציאלים"), ("ΔU", "מפל מתח"),
    ("Icu / Icw", "כושר ניתוק / זרם קצר עמידות"), ("IP", "דרגת אטימות"), ("N2XY / NA2XY", "כבל נחושת / אלומיניום XLPE"),
]


@dataclass
class Column:
    title: str
    width: float
    align: TA = TA.MIDDLE_CENTER


# ----------------------------------------------------------------------------- rows
def cable_rows(design: Design) -> list[list[str]]:
    rows: list[list[str]] = []
    n = 0
    for b in design.boards:
        if b.supply.cable:
            n += 1
            c = b.supply.cable
            src = b.supply.label if b.supply.kind != "board" else f"לוח {b.supply.from_board}"
            prot = f"{b.incomer.tag} {b.incomer.rating_a:g}A" if b.incomer and b.incomer.rating_a else ""
            rows.append([f"W{n:02d}", src, f"לוח {b.id}", c.designation, f"{c.length_m:g}" if c.length_m else "", f"{c.du_pct:.1f}" if c.du_pct is not None else "",
                         c.method or "", prot, "הזנה ראשית"])
        for f in b.feeders:
            if not f.cable:
                continue
            n += 1
            target = f"לוח {f.to_board}" if f.to_board else (f.to_node or f.load)
            prot = f"{f.device.tag} {f.device.rating_a:g}A" if f.device.rating_a else f.device.tag
            rows.append([f"W{n:02d}", f"לוח {b.id}", target, f.cable.designation, f"{f.cable.length_m:g}" if f.cable.length_m else "",
                         f"{f.cable.du_pct:.1f}" if f.cable.du_pct is not None else "", f.cable.method or "", prot, f.device.note or ""])
        for g in b.groups:
            for c in g.circuits:
                if not c.cable:
                    continue
                n += 1
                prot = f"{c.device.tag} {c.device.rating_a:g}A" if c.device.rating_a else c.device.tag
                target = f"לוח {c.to_board}" if c.to_board else c.load
                rows.append([f"W{n:02d}", f"לוח {b.id} / {g.tag}", target, c.cable.designation, f"{c.cable.length_m:g}" if c.cable.length_m else "",
                             f"{c.cable.du_pct:.1f}" if c.cable.du_pct is not None else "", c.cable.method or "", prot, c.phase])
    return rows


def load_rows(design: Design) -> tuple[list[list[str]], list[list[str]]]:
    """(rows, summary rows) — one row per circuit with rating/phase/kW, summary per board."""
    rows: list[list[str]] = []
    summary: list[list[str]] = []
    for b in design.boards:
        per_phase = {"L1": 0.0, "L2": 0.0, "L3": 0.0}
        kw_total = 0.0
        for c in b.all_circuits():
            d = c.device
            kw = c.load_kw
            if kw is None and d.rating_a:
                # screening estimate: single-phase 230 V, three-phase 400 V, pf 0.9, 0.7 utilisation
                kw = (0.4 * d.rating_a * 0.9 * 0.7 * (3 ** 0.5) if d.poles >= 3 else 0.23 * d.rating_a * 0.9 * 0.7)
                est = "*"
            else:
                est = ""
            kw_total += kw or 0
            if c.phase in per_phase and d.rating_a:
                per_phase[c.phase] += d.rating_a
            elif c.phase == "L1-3" and d.rating_a:
                for k in per_phase:
                    per_phase[k] += d.rating_a
            target = f"לוח {c.to_board}" if c.to_board else (c.to_node or c.load)
            rows.append([b.id, c.tag, target, f"{d.poles}P", f"{d.rating_a:g}" if d.rating_a else "", c.phase, f"{kw:.1f}{est}" if kw else ""])
        inc = f"{b.incomer.rating_a:g}A {b.incomer.poles}P" if b.incomer and b.incomer.rating_a else "-"
        summary.append([b.id, inc, f"{per_phase['L1']:g}", f"{per_phase['L2']:g}", f"{per_phase['L3']:g}", f"{kw_total:.1f}", f"{len(b.all_circuits())}"])
    return rows, summary


# ----------------------------------------------------------------------------- rendering
def draw_table(ctx: SheetContext, x_right: float, y_top: float, cols: list[Column], rows: list[list[str]],
               title: str = "", h_text: float = 1.6) -> float:
    tw = sum(c.width for c in cols)
    if title:
        ctx.text(title, (x_right, y_top + 1.5), 2.6, "legend", TA.BOTTOM_RIGHT, bold=True)
    h = HEAD_H + ROW_H * len(rows)
    ctx.rect(x_right - tw, y_top - h, tw, h, "legend")
    ctx.line((x_right - tw, y_top - HEAD_H), (x_right, y_top - HEAD_H), "legend")
    xx = x_right
    for c in cols:
        ctx.text(c.title, (xx - c.width / 2, y_top - HEAD_H / 2), 1.7, "legend", TA.MIDDLE_CENTER, bold=True)
        xx -= c.width
        if xx > x_right - tw + 0.5:
            ctx.line((xx, y_top - h), (xx, y_top), "legend")
    for i, row in enumerate(rows):
        yy = y_top - HEAD_H - ROW_H * (i + 0.5)
        if i:
            ctx.line((x_right - tw, yy + ROW_H / 2), (x_right, yy + ROW_H / 2), "legend")
        cx = x_right
        for c, v in zip(cols, row):
            maxc = int(c.width / (h_text * 0.62))
            v = v if len(v) <= maxc else v[:maxc - 1] + "…"
            if c.align == TA.MIDDLE_RIGHT:
                ctx.text(v, (cx - 1.2, yy), h_text, "legend", TA.MIDDLE_RIGHT)
            elif c.align == TA.MIDDLE_LEFT:
                ctx.text(v, (cx - c.width + 1.2, yy), h_text, "legend", TA.MIDDLE_LEFT)
            else:
                ctx.text(v, (cx - c.width / 2, yy), h_text, "legend", TA.MIDDLE_CENTER)
            cx -= c.width
    return y_top - h


def rows_per_page(ctx: SheetContext, y_top: float, reserve_bottom: float) -> int:
    return max(5, int((y_top - HEAD_H - (ctx.y0 + reserve_bottom)) / ROW_H))


CABLE_COLS = [Column("מס'", 12.0), Column("מ-", 44.0, TA.MIDDLE_RIGHT), Column("אל", 60.0, TA.MIDDLE_RIGHT), Column("כבל", 46.0),
              Column("אורך [m]", 16.0), Column("ΔU [%]", 14.0), Column("שיטה", 16.0), Column("הגנה", 34.0), Column("הערה", 60.0, TA.MIDDLE_RIGHT)]
LOAD_COLS = [Column("לוח", 16.0), Column("מעגל", 20.0), Column("צרכן / יעד", 92.0, TA.MIDDLE_RIGHT), Column("קטבים", 14.0),
             Column("דירוג [A]", 18.0), Column("מופע", 14.0), Column("הספק [kW]", 20.0)]
SUMMARY_COLS = [Column("לוח", 20.0), Column("מפסק ראשי", 26.0), Column("ΣA L1", 18.0), Column("ΣA L2", 18.0), Column("ΣA L3", 18.0),
                Column("Σ kW", 18.0), Column("מעגלים", 16.0)]


def draw_cable_schedule(ctx: SheetContext, design: Design, rows: list[list[str]], page: int, pages: int) -> list[str]:
    y_top = ctx.y1 - 16.0
    draw_table(ctx, ctx.x1 - 6.0, y_top, CABLE_COLS, rows, f"רשימת כבלים — דף {page}/{pages}")
    notes = ["אורכים ומפלי מתח — מהמודל / דו\"ח החישוב (eplan CalcReport) כאשר קיים; ריק = טרם חושב, לקבוע לפי מדידת תוואי באתר.",
             "שיטת התקנה לפי IEC 60364-5-52 (לדוגמה 90.7 = כבלים רב-גידיים בתעלה מחורצת); העמסה מותרת לפי טבלאות B.52 ומקדמי התיקון לטמפרטורה ולקיבוץ.",
             "סימון W-nn הוא מספר הכבל בתוכנית; יש לסמן את שני קצות הכבל בשלט בר-קיימא."]
    nx, ny = ctx.x1 - TB_W - 8.0, ctx.y0 + TB_H + 5.0 * 3 + 30.0
    ctx.text("הערות", (nx, ny), 2.4, "notes", TA.TOP_RIGHT, bold=True)
    ctx.mtext([f"{i + 1}. {n}" for i, n in enumerate(notes)], (nx, ny - 4.0), 1.6, "notes", width=200.0)
    return []


def draw_load_schedule(ctx: SheetContext, design: Design, rows: list[list[str]], summary: list[list[str]], page: int, pages: int) -> list[str]:
    y_top = ctx.y1 - 16.0
    y_after = draw_table(ctx, ctx.x1 - 6.0, y_top, LOAD_COLS, rows, f"טבלת עומסים — דף {page}/{pages}")
    if page == pages:
        xr = ctx.x1 - 6.0 - sum(c.width for c in LOAD_COLS) - 16.0
        draw_table(ctx, xr, y_top, SUMMARY_COLS, summary, "סיכום לפי לוח")
        notes = ["* הספק משוער לפי דירוג המפסק (cosφ 0.9, מקדם ניצול 0.7) כאשר לא הוזן הספק במודל — לסינון בלבד, אינו תחליף לחישוב עומסים.",
                 "ΣA לכל מופע = סכום דירוגי המפסקים החד-מופעיים במופע + המפסקים התלת-מופעיים; מקדם הבו-זמניות ייקבע בחישוב העומסים.",
                 "מפסק ראשי, חתך ההזנה והסכמת ההגנות — ראו גיליונות החד-קווי."]
        nx, ny = xr, max(y_after - 10.0, ctx.y0 + TB_H + 5.0 * 3 + 30.0)
        ny = min(ny, y_top - HEAD_H - ROW_H * (len(summary) + 1) - 10.0)
        ctx.text("הערות", (nx, ny), 2.4, "notes", TA.TOP_RIGHT, bold=True)
        ctx.mtext([f"{i + 1}. {n}" for i, n in enumerate(notes)], (nx, ny - 4.0), 1.6, "notes", width=xr - ctx.x0 - 8.0)
    return []


def draw_general_notes(ctx: SheetContext, design: Design) -> list[str]:
    warnings: list[str] = []
    notes = design.general_notes or STANDARD_NOTES
    xr = ctx.x1 - 6.0
    y = ctx.y1 - 14.0
    ctx.text("הערות כלליות", (xr, y), 3.0, "notes", TA.TOP_RIGHT, bold=True)
    ctx.mtext([f"{i + 1}. {n}" for i, n in enumerate(notes)], (xr, y - 5.0), 1.8, "notes", width=190.0)
    if design.sources:
        ys = ctx.y0 + TB_H + 5.0 * 3 + 12.0 + 4.0 * min(len(design.sources), 12) + 8.0
        ctx.text("מסמכי מקור", (xr, ys), 3.0, "notes", TA.TOP_RIGHT, bold=True)
        ctx.mtext([f"{i + 1}. {s}" for i, s in enumerate(design.sources[:12])], (xr, ys - 5.0), 1.6, "notes", width=190.0)
    # legend: two columns at the left
    lx, ly = ctx.x0 + 6.0, ctx.y1 - 14.0
    ctx.text("מקרא סמלים (IEC 60617)", (lx + 150.0, ly), 3.0, "legend", TA.TOP_RIGHT, bold=True)
    cw, rh = 75.0, 13.0
    for i, (blk, label) in enumerate(LEGEND_ITEMS):
        col, row = i % 2, i // 2
        cx = lx + col * cw
        cy = ly - 10.0 - row * rh
        if blk in ctx.doc.blocks:
            ctx.msp.add_blockref(blk, (cx + 8.0, cy - 9.0), dxfattribs={"layer": LAYERS["sld_sym"].name, "xscale": 0.75, "yscale": 0.75})
        ctx.text(label, (cx + cw - 3.0, cy - 4.5), 1.8, "legend", TA.MIDDLE_RIGHT)
    # abbreviations under the legend
    ay = ly - 10.0 - ((len(LEGEND_ITEMS) + 1) // 2) * rh - 6.0
    ctx.text("קיצורים", (lx + 150.0, ay), 3.0, "legend", TA.TOP_RIGHT, bold=True)
    cols = [Column("קיצור", 24.0), Column("משמעות", 51.0, TA.MIDDLE_RIGHT), Column("קיצור", 24.0), Column("משמעות", 51.0, TA.MIDDLE_RIGHT)]
    half = (len(ABBREVIATIONS) + 1) // 2
    left, right = ABBREVIATIONS[:half], ABBREVIATIONS[half:] + [("", "")] * (half - len(ABBREVIATIONS[half:]))
    draw_table(ctx, lx + 150.0, ay - 5.0, cols, [[a, b, c, d] for (a, b), (c, d) in zip(left, right)], h_text=1.5)
    if ay - 5.0 - HEAD_H - ROW_H * half < ctx.y0 + 6.0:
        warnings.append("הערות כלליות: טבלת הקיצורים חורגת מהגיליון")
    return warnings
