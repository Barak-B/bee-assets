"""Two sheets the PV directive's document list asks for, beside the single-line (§32(א)):

  - earthing & bonding plan (תוכנית הארקה והשוואת פוטנציאלים): the main earthing terminal, what bonds to it and
    with what conductor — schematic, not to scale;
  - schedules: the cable schedule (bee_cad.cables), the sign set (bee_cad.il.labels) and the submission list.
"""
from __future__ import annotations

from typing import Optional

from ezdxf.enums import TextEntityAlignment as TA

from .cables import cable_rows
from .il import labels, submission
from .model import Design
from .sheet import TB_H, SheetContext

ROW_H = 4.4


_CSA = (1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240)


def pe_size(designation: str) -> str:
    """Protective conductor of a supply by IEC 60364-5-54 Table 54.2, rounded up to a standard size."""
    from .calc import parse_cable
    spec = parse_cable(designation)
    if spec is None:
        return "PE לפי חתך ההזנה"
    s = spec.csa_mm2
    need = s if s <= 16 else (16 if s <= 35 else s / 2)
    size = next((c for c in _CSA if c >= need), need)
    return f"PE {size:g} ממ\"ר {'Al' if spec.material == 'Al' else 'Cu'}"


def _bonding_items(design: Design) -> list[tuple[str, str, str]]:
    """(what, conductor, why) for every connection to the main earthing terminal."""
    pv = design.pv
    kwp = pv.kwp() if pv else (design.grid.kwp if design.grid else 0.0)
    out: list[tuple[str, str, str]] = [("אלקטרודת הארקת יסוד", "פס פלדה מגולוונת / 16 ממ\"ר Cu", "הארקת יסוד, תקנות 1981")]
    feeders = {c.to_board: c.cable for b in design.boards for c in b.all_circuits() if c.to_board and c.cable}
    for b in design.boards:
        cab = b.supply.cable or feeders.get(b.id)
        out.append((f"פס הארקה — {b.title or b.id}", pe_size(cab.designation) if cab else "PE לפי חתך ההזנה",
                    "IEC 60364-5-54 טבלה 54.2"))
    inverters = [n for n in design.nodes if n.kind == "inverter"]
    for n in inverters:
        out.append((f"גוף {n.label}", "10 ממ\"ר Cu", "הנחיות PV §17"))
    if kwp:
        s = 10 if kwp <= 15 else 16
        out.append(("מבנה נושא הפאנלים ומסגרות", f"{s} ממ\"ר Cu", "הנחיות PV §17" + (" (עד 15 kWp)" if s == 10 else "")))
        out.append(("מגן מתח יתר DC", "6 ממ\"ר Cu לפחות", "הוראות היצרן"))
    if any(b.spd for b in design.boards):
        out.append(("מגני מתח יתר AC (SPD)", "6 ממ\"ר Cu לפחות, קצר ככל האפשר", "IEC 60364-5-53"))
    if any(n.kind == "battery" for n in design.nodes):
        out.append(("מעטפת מערכת האגירה", "10 ממ\"ר Cu", "הוראות היצרן"))
    out += [("צנרת מים ראשית (מתכתית)", "10 ממ\"ר Cu", "השוואת פוטנציאלים ראשית"),
            ("צנרת גז / מבנה פלדה / מעקות", "10 ממ\"ר Cu", "השוואת פוטנציאלים ראשית")]
    return out


def draw_earthing(ctx: SheetContext, design: Design) -> list[str]:
    items = _bonding_items(design)
    cx = (ctx.x0 + ctx.x1) / 2
    bar_y = ctx.y0 + TB_H + 70.0
    bar_w = min(ctx.x1 - ctx.x0 - 80.0, 30.0 * len(items))
    ctx.text("תוכנית הארקה והשוואת פוטנציאלים — סכמתית, לא בקנה מידה", (ctx.x1 - 4.0, ctx.y1 - 15.0), 3.0, "legend",
             TA.BOTTOM_RIGHT, bold=True)
    ctx.rect(cx - bar_w / 2, bar_y, bar_w, 4.0, "pe")
    ctx.text("פס השוואת פוטנציאלים ראשי (MET)", (cx, bar_y - 3.0), 2.5, "sld_text", TA.TOP_CENTER, bold=True)
    up = items[1:]
    step = bar_w / max(1, len(up))
    for i, (what, cond, why) in enumerate(up):
        x = cx + bar_w / 2 - step * (i + 0.5)
        top = bar_y + 4.0
        box_y = top + 55.0 + (i % 2) * 22.0
        ctx.line((x, top), (x, box_y), "pe")
        ctx.text(cond, (x - 1.0, top + 10.0 + (i % 2) * 22.0), 1.8, "sld_tag", TA.BOTTOM_LEFT, rotation=90.0)
        w = step - 3.0
        ctx.rect(x - w / 2, box_y, w, 14.0, "sld_board")
        ctx.mtext([what], (x + w / 2 - 1.0, box_y + 13.0), 1.9, "sld_text", width=w - 2.0)
        ctx.text(why, (x, box_y - 1.5), 1.5, "notes", TA.TOP_CENTER)
    # foundation electrode below the bar
    what, cond, why = items[0]
    ctx.line((cx, bar_y), (cx, bar_y - 25.0), "pe")
    ctx.text(cond, (cx + 2.0, bar_y - 14.0), 1.8, "sld_tag", TA.MIDDLE_LEFT)
    for k in range(3):
        w = 12.0 - 4.0 * k
        ctx.line((cx - w / 2, bar_y - 25.0 - 2.0 * k), (cx + w / 2, bar_y - 25.0 - 2.0 * k), "pe")
    ctx.text(f"{what} ({why})", (cx, bar_y - 33.0), 2.0, "sld_text", TA.TOP_CENTER)
    notes = [
        "כל מוליכי ההארקה וההשוואה מנחושת מבודדת ירוק-צהוב, מחוברים בנעלי כבל למהדקים ממוספרים בפס.",
        "מוליך PE של כבלי ההזנה בחתך מוליך הפאזה עד 16 ממ\"ר, 16 ממ\"ר עד 35 ממ\"ר, ומעל — חצי מחתך הפאזה.",
        "חיבורי המבנה של הפאנלים בכל שורה, וגישור בין מקטעי פרופיל כשאין רציפות חשמלית מוצהרת.",
        "בדיקת רציפות מוליכי ההארקה והתנגדות לולאת התקלה רשומות בטופס הבודק.",
        "המהנדס המתכנן מאשר את שיטת ההארקה (TN-C-S / TT) ואת אלקטרודת ההארקה בפועל.",
    ]
    ctx.text("הערות", (ctx.x1 - 4.0, ctx.y0 + TB_H + 36.0), 2.2, "notes", TA.TOP_RIGHT, bold=True)
    ctx.mtext(notes, (ctx.x1 - 4.0, ctx.y0 + TB_H + 32.0), 1.8, "notes", width=(ctx.x1 - ctx.x0) * 0.55)
    return []


def _table(ctx: SheetContext, title: str, cols: list[tuple[str, float]], rows: list[list[str]], x_right: float,
           y_top: float, width: float) -> float:
    k = width / sum(w for _, w in cols)
    cols = [(n, w * k) for n, w in cols]
    ctx.text(title, (x_right, y_top + 1.0), 2.6, "legend", TA.BOTTOM_RIGHT, bold=True)
    h = ROW_H * (len(rows) + 1)
    ctx.rect(x_right - width, y_top - h, width, h, "legend")
    xx = x_right
    for name, cw in cols:
        ctx.text(name, (xx - cw / 2, y_top - ROW_H / 2), 1.7, "legend", TA.MIDDLE_CENTER, bold=True)
        xx -= cw
        ctx.line((xx, y_top - h), (xx, y_top), "legend")
    for i, r in enumerate(rows):
        yy = y_top - ROW_H * (i + 1.5)
        ctx.line((x_right - width, yy + ROW_H / 2), (x_right, yy + ROW_H / 2), "legend")
        xx = x_right
        for (name, cw), v in zip(cols, r):
            max_chars = int(cw / (1.6 * 0.62))
            ctx.text(v[:max_chars], (xx - 1.2, yy), 1.6, "legend", TA.MIDDLE_RIGHT)
            xx -= cw
    return y_top - h


def _f(v: Optional[float], fmt: str = "{:g}") -> str:
    return "" if v is None else fmt.format(v)


CABLE_COLS = [("מזהה", 16.0), ("תוואי", 30.0), ("כבל", 24.0), ("שיטה", 12.0), ("אורך מ'", 10.0), ("k", 8.0),
              ("Ib A", 10.0), ("In A", 10.0), ("Iz A", 10.0), ("ΔU %", 10.0), ("Ik kA", 10.0), ("קצר", 8.0), ("תקין", 10.0)]


def schedule_rows(design: Design) -> list[list[str]]:
    rows = []
    for r in cable_rows(design):
        rows.append([r.ref, r.route, r.designation, r.method, _f(r.length_m), _f(r.k_total), _f(r.ib_a), _f(r.in_a),
                     _f(r.iz_a), _f(r.du_pct, "{:.2f}"), _f(r.ik_ka, "{:.1f}"),
                     "" if r.thermal_ok is None else ("כן" if r.thermal_ok else "לא"), "כן" if r.ok else "לבדוק"])
    return rows


def draw_schedules(ctx: SheetContext, design: Design, rows: list[list[str]], with_labels: bool) -> list[str]:
    width = ctx.x1 - ctx.x0 - 8.0
    x_right = ctx.x1 - 4.0
    y = _table(ctx, "טבלת כבלים", CABLE_COLS, rows, x_right, ctx.y1 - 16.0, width)
    if not with_labels:
        return []
    y -= 10.0
    half = width / 2 - 4.0
    sign = [[x.where, x.text, str(x.qty)] for x in labels(design)]
    if sign:
        _table(ctx, "רשימת שילוט (נוסח לאימות מול נספח 3 להנחיות)", [("מיקום", 22.0), ("נוסח", 60.0), ("כמות", 8.0)],
               sign, x_right, y, half)
    sub = [[x["name"], "מופק בסט" if x["produced"] else "חסר — להכין"] for x in submission(design)]
    _table(ctx, "מסמכים לתיק המתקן (הנחיות PV §32)", [("מסמך", 60.0), ("מצב", 20.0)], sub, x_right - half - 8.0, y, half)
    return []
