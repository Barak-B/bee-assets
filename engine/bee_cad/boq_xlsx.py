"""Priced bill of quantities (כתב כמויות מתומחר) as an editable XLSX, in the office generator layout.

Sheets: ריכוז והצעה (chapter totals, VAT, milestones, terms), כתב כמויות (items + the internal pricing block:
material / hours / subcontract / item factor), פרמטרים (rates, overhead, risk, profit, chapter factors and the
site quantities that drive the item quantities), איך עובדים.

Price of an item = (material + hours × crew rate + subcontract) × (1+OH)(1+risk)(1+profit) × chapter factor ×
item factor — the same rule as the office generator. Quantities may be formulas over the site parameters
(e.g. ``=ROUNDUP(L_H2*(1+SPARE)+2*TAIL,0)``) so a changed route length flows through.

A second, values-only workbook (no internal columns) is written for the PDF that goes to the client;
``compute`` evaluates the same rule in Python so both agree (checked against a LibreOffice recalculation).
"""
from __future__ import annotations

import math
import re
from pathlib import Path
from typing import Optional

from pydantic import BaseModel, Field

YELLOW = "FFF2CC"


class BoqItem(BaseModel):
    code: str
    desc: str
    unit: str
    qty: str | float                 # number or formula over parameter names ("ROUNDUP(L_H2*(1+SPARE),0)")
    material: float = 0.0            # ₪ per unit, direct cost
    hours: float = 0.0               # crew hours per unit
    sub: float = 0.0                 # subcontract ₪ per unit
    factor: float = 1.0
    basis: str = ""                  # quantity basis / source
    status: str = "estimate"         # confirmed | measured | estimate | unresolved


class BoqChapter(BaseModel):
    no: str                          # "08.01"
    title: str
    factor: float = 1.0
    items: list[BoqItem] = Field(default_factory=list)


class BoqParam(BaseModel):
    key: str
    label: str
    value: float | str
    unit: str = ""
    note: str = ""


class Boq(BaseModel):
    title: str
    client: str
    site: str
    date: str
    revision: str = "A"
    header_note: str = ""
    params: list[BoqParam] = Field(default_factory=list)       # pricing params (RATE_EL, …) + site quantities
    chapters: list[BoqChapter] = Field(default_factory=list)
    milestones: list[tuple[str, float]] = Field(default_factory=list)
    terms: list[str] = Field(default_factory=list)


PRICING_DEFAULTS = [
    ("RATE_EL", "עלות שעת חשמלאי (עלות מעביד)", 100, "₪/ש'"),
    ("RATE_HLP", "עלות שעת עוזר", 55, "₪/ש'"),
    ("CREW_EL", "חשמלאים בצוות", 2, "יח'"),
    ("CREW_HLP", "עוזרים בצוות", 2, "יח'"),
    ("OH", "תקורה", 0.12, "%"),
    ("RISK", "בלתי צפוי / סיכון", 0.05, "%"),
    ("PROFIT", "רווח", 0.15, "%"),
    ("VAT", "מע\"מ", 0.18, "%"),
]


def _params(b: Boq) -> dict[str, float]:
    p: dict[str, float] = {k: v for k, _, v, _ in PRICING_DEFAULTS}
    for x in b.params:
        if isinstance(x.value, (int, float)):
            p[x.key] = float(x.value)
    p["BLEND"] = (p["RATE_EL"] * p["CREW_EL"] + p["RATE_HLP"] * p["CREW_HLP"]) / (p["CREW_EL"] + p["CREW_HLP"])
    p["MARKUP"] = (1 + p["OH"]) * (1 + p["RISK"]) * (1 + p["PROFIT"])
    return p


def _eval_qty(q: str | float, p: dict[str, float]) -> float:
    if isinstance(q, (int, float)):
        return float(q)
    expr = q.lstrip("=")
    expr = re.sub(r"ROUNDUP\(([^,]+),\s*0\)", r"_ceil(\1)", expr)
    return float(eval(expr, {"__builtins__": {}, "_ceil": math.ceil, **p}))


def xround(x: float, nd: int = 0) -> float:
    """Excel ROUND (half away from zero), so the PDF and the workbook agree to the shekel."""
    from decimal import ROUND_HALF_UP, Decimal

    q = Decimal(1).scaleb(-nd)
    return float(Decimal(repr(x)).quantize(q, rounding=ROUND_HALF_UP))


def unit_price(it: BoqItem, ch: BoqChapter, p: dict[str, float]) -> float:
    direct = it.material + it.hours * p["BLEND"] + it.sub
    return xround(direct * p["MARKUP"] * ch.factor * it.factor, 1)


def compute(b: Boq) -> dict:
    p = _params(b)
    chapters = []
    for ch in b.chapters:
        rows = []
        for it in ch.items:
            q = _eval_qty(it.qty, p)
            up = unit_price(it, ch, p)
            rows.append({"item": it, "qty": q, "price": up, "total": int(xround(q * up))})
        chapters.append({"ch": ch, "rows": rows, "total": sum(r["total"] for r in rows)})
    net = sum(c["total"] for c in chapters)
    vat = int(xround(net * p["VAT"]))
    return {"params": p, "chapters": chapters, "net": net, "vat": vat, "gross": net + vat}


def _style(ws):
    from openpyxl.styles import Alignment, Border, Font, Side

    thin = Side(style="thin", color="999999")
    return Font(bold=True), Border(left=thin, right=thin, top=thin, bottom=thin), Alignment(horizontal="right", vertical="center", wrap_text=True)


def write_xlsx(b: Boq, path: Path) -> None:
    """Editable workbook with formulas and named parameters."""
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.workbook.defined_name import DefinedName

    res = compute(b)
    wb = Workbook()
    fill = PatternFill("solid", fgColor=YELLOW)
    head = PatternFill("solid", fgColor="1F3864")
    hfont = Font(bold=True, color="FFFFFF")
    bold = Font(bold=True)
    wrap = Alignment(wrap_text=True, vertical="center", horizontal="right")

    # ---- parameters
    wp = wb.active
    wp.title = "פרמטרים"
    wp.sheet_view.rightToLeft = True
    wp.append(["פרמטרים — פרויקט, תמחור וכמויות אתר"])
    wp["A1"].font = Font(bold=True, size=13)
    wp.append(["תאים צהובים = קלט. שינוי כאן מעדכן כמויות, מחירים, ריכוז ואבני דרך."])
    wp.append(["מפתח", "פרמטר", "ערך", "יחידה", "הערה"])
    for c in wp[3]:
        c.font, c.fill = hfont, head
    rows = [(k, lab, v, u, "") for k, lab, v, u in PRICING_DEFAULTS]
    given = {x.key for x in b.params}
    rows = [r for r in rows if r[0] not in given] + [(x.key, x.label, x.value, x.unit, x.note) for x in b.params]
    for key, lab, val, unit, note in rows:
        wp.append([key, lab, val, unit, note])
        r = wp.max_row
        if isinstance(val, (int, float)):
            wp.cell(r, 3).fill = fill
            if unit == "%":
                wp.cell(r, 3).number_format = "0%"
            wb.defined_names[key] = DefinedName(key, attr_text=f"'פרמטרים'!$C${r}")
    wp.append(["BLEND", "תעריף שעתי משוקלל לצוות", "=(RATE_EL*CREW_EL+RATE_HLP*CREW_HLP)/(CREW_EL+CREW_HLP)", "₪/ש'", ""])
    wb.defined_names["BLEND"] = DefinedName("BLEND", attr_text=f"'פרמטרים'!$C${wp.max_row}")
    wp.append(["MARKUP", "מקדם העמסה = (1+תקורה)(1+סיכון)(1+רווח)", "=(1+OH)*(1+RISK)*(1+PROFIT)", "-", ""])
    wb.defined_names["MARKUP"] = DefinedName("MARKUP", attr_text=f"'פרמטרים'!$C${wp.max_row}")
    wp.append([])
    wp.append(["מקדם מחיר לפרק (1.00 = ללא שינוי)"])
    wp.cell(wp.max_row, 1).font = bold
    for ch in b.chapters:
        key = "CHF_" + ch.no.replace(".", "")
        wp.append([key, f"{ch.no} {ch.title}", ch.factor, "מכפיל", ""])
        wp.cell(wp.max_row, 3).fill = fill
        wb.defined_names[key] = DefinedName(key, attr_text=f"'פרמטרים'!$C${wp.max_row}")
    for col, w in zip("ABCDE", (14, 46, 12, 10, 60)):
        wp.column_dimensions[col].width = w

    # ---- BOQ
    ws = wb.create_sheet("כתב כמויות")
    ws.sheet_view.rightToLeft = True
    ws.append([f"B.E.E – ברק הנדסת חשמל בע\"מ | כתב כמויות מתומחר – {b.title}"])
    ws["A1"].font = Font(bold=True, size=13)
    ws.append([f"לכבוד: {b.client} | אתר: {b.site}"])
    ws.append([f"תאריך: {b.date} | מהדורה {b.revision} | מחירים בש\"ח ללא מע\"מ | אספקה והתקנה"])
    if b.header_note:
        ws.append([b.header_note])
    ws.append([])
    ws.cell(ws.max_row, 11, "← תמחור פנימי (לא מודפס בהצעה) – תאים צהובים לעריכה")
    hdr = ["סעיף", "קוד", "תאור", "יח'", "כמות", "מחיר יחידה ₪", "סה\"כ ₪", "", "", "",
           "חומר ₪/יח'", "שעות/יח'", "קבלנות ₪/יח'", "עלות ישירה ₪/יח'", "מקדם פריט", "בסיס כמות / מקור", "סטטוס"]
    chapter_total_cells = []
    for ch in b.chapters:
        ws.append([f"תת פרק {ch.no} {ch.title}"])
        ws.cell(ws.max_row, 1).font = Font(bold=True, size=12)
        ws.append(hdr)
        for c in ws[ws.max_row]:
            if c.value:
                c.font, c.fill = hfont, head
        first = ws.max_row + 1
        chf = "CHF_" + ch.no.replace(".", "")
        for i, it in enumerate(ch.items, 1):
            r = ws.max_row + 1
            q = it.qty if isinstance(it.qty, (int, float)) else ("=" + it.qty.lstrip("="))
            ws.append([f"{ch.no}.{i:03d}", it.code, it.desc, it.unit, q,
                       f"=ROUND(N{r}*MARKUP*{chf}*O{r},1)", f"=ROUND(E{r}*F{r},0)", None, None, None,
                       it.material, it.hours, it.sub, f"=K{r}+L{r}*BLEND+M{r}", it.factor, it.basis,
                       {"confirmed": "מאושר", "measured": "נמדד", "estimate": "הערכה", "unresolved": "פתוח"}.get(it.status, it.status)])
            for col in (5, 11, 12, 13, 15):
                ws.cell(r, col).fill = fill
            ws.cell(r, 3).alignment = wrap
        last = ws.max_row
        ws.append([f"סה\"כ {ch.no} {ch.title}", None, None, None, None, None, f"=SUM(G{first}:G{last})"])
        ws.cell(ws.max_row, 1).font = bold
        ws.cell(ws.max_row, 7).font = bold
        chapter_total_cells.append((ch, f"'כתב כמויות'!G{ws.max_row}"))
        ws.append([])
    ws.append(["סה\"כ כתב הכמויות לפני מע\"מ", None, None, None, None, None, "=" + "+".join(c.split("!")[1] for _, c in chapter_total_cells)])
    ws.cell(ws.max_row, 1).font = Font(bold=True, size=12)
    ws.cell(ws.max_row, 7).font = Font(bold=True, size=12)
    for col, w in zip("ABCDEFGHIJKLMNOPQ", (11, 10, 62, 7, 9, 12, 12, 2, 2, 2, 11, 9, 12, 13, 9, 46, 9)):
        ws.column_dimensions[col].width = w
    for row in ws.iter_rows(min_row=1):
        for c in row:
            if c.column in (6, 7, 14):
                c.number_format = "#,##0.0" if c.column in (6, 14) else "#,##0"

    # ---- summary
    wsum = wb.create_sheet("ריכוז והצעה", 0)
    wsum.sheet_view.rightToLeft = True
    wsum.append(["B.E.E – ברק הנדסת חשמל בע\"מ"])
    wsum["A1"].font = Font(bold=True, size=14)
    wsum.append([f"הצעת מחיר | {b.title}"])
    wsum.append([f"לכבוד: {b.client} | אתר: {b.site} | {b.date} | מהדורה {b.revision}"])
    wsum.append([])
    wsum.append(["תת פרק", "סך הכל ₪"])
    for c in wsum[wsum.max_row]:
        c.font, c.fill = hfont, head
    first = wsum.max_row + 1
    for ch, ref in chapter_total_cells:
        wsum.append([f"{ch.no} {ch.title}", f"={ref}"])
    last = wsum.max_row
    wsum.append(["סך הכל לפני מע\"מ", f"=SUM(B{first}:B{last})"])
    net_row = wsum.max_row
    wsum.append(["מע\"מ", f"=ROUND(B{net_row}*VAT,0)"])
    wsum.append(["סה\"כ כולל מע\"מ", f"=B{net_row}+B{net_row + 1}"])
    for r in (net_row, net_row + 2):
        wsum.cell(r, 1).font = bold
        wsum.cell(r, 2).font = bold
    if b.milestones:
        wsum.append([])
        wsum.append(["אבן דרך", "%", "סכום לפני מע\"מ"])
        for c in wsum[wsum.max_row]:
            c.font, c.fill = hfont, head
        for name, pct in b.milestones:
            wsum.append([name, pct, f"=ROUND(B{net_row}*B{wsum.max_row + 1},0)"])
            wsum.cell(wsum.max_row, 2).number_format = "0%"
            wsum.cell(wsum.max_row, 2).fill = fill
    if b.terms:
        wsum.append([])
        wsum.append(["תנאים והערות:"])
        wsum.cell(wsum.max_row, 1).font = bold
        for i, t in enumerate(b.terms, 1):
            wsum.append([f"{i}. {t}"])
            wsum.cell(wsum.max_row, 1).alignment = Alignment(wrap_text=True, horizontal="right", vertical="top")
            wsum.merge_cells(start_row=wsum.max_row, start_column=1, end_row=wsum.max_row, end_column=3)
            wsum.row_dimensions[wsum.max_row].height = 15 * max(1, math.ceil(len(t) / 95))
    for row in wsum.iter_rows(min_row=5):
        for c in row:
            if c.column in (2, 3) and c.row >= first:
                if c.number_format != "0%":
                    c.number_format = "#,##0"
    wsum.column_dimensions["A"].width = 70
    wsum.column_dimensions["B"].width = 16
    wsum.column_dimensions["C"].width = 18

    # ---- how to
    wh = wb.create_sheet("איך עובדים")
    wh.sheet_view.rightToLeft = True
    for line in [
        "איך עובדים עם כתב הכמויות",
        "המחיר של כל סעיף: (חומר + שעות × תעריף צוות + קבלנות) × העמסה (תקורה, סיכון, רווח) × מקדם פרק × מקדם פריט.",
        "1. גיליון 'פרמטרים': אורכי התוואים ופרמטרי האתר (צהוב) — הכמויות בכתב הכמויות מחושבות מהם.",
        "2. גיליון 'כתב כמויות': כמות (E), חומר (K), שעות (L), קבלנות (M), מקדם פריט (O). עמודות K–Q פנימיות ואינן מודפסות בהצעה.",
        "3. גיליון 'ריכוז והצעה': סה\"כ לפי פרקים, מע\"מ, אבני דרך ותנאים.",
        "4. עמודת 'סטטוס': הערכה = לא נמדד/לא אושר — לבדוק לפני הגשה.",
    ]:
        wh.append([line])
    wh.column_dimensions["A"].width = 130
    wh["A1"].font = Font(bold=True, size=13)
    path.parent.mkdir(parents=True, exist_ok=True)
    wb.save(path)


def write_client_xlsx(b: Boq, path: Path) -> None:
    """Values-only workbook for the client PDF: summary + BOQ without the internal pricing block."""
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Border, Font, PatternFill, Side

    res = compute(b)
    wb = Workbook()
    head = PatternFill("solid", fgColor="1F3864")
    sub = PatternFill("solid", fgColor="D9E1F2")
    hfont = Font(bold=True, color="FFFFFF")
    thin = Side(style="thin", color="A6A6A6")
    border = Border(left=thin, right=thin, top=thin, bottom=thin)
    wrap = Alignment(wrap_text=True, vertical="center", horizontal="right")
    ctr = Alignment(horizontal="center", vertical="center")

    ws = wb.active
    ws.title = "כתב כמויות"
    ws.sheet_view.rightToLeft = True
    ws.page_setup.orientation = "portrait"
    ws.page_setup.paperSize = ws.PAPERSIZE_A4
    ws.page_setup.fitToWidth, ws.page_setup.fitToHeight = 1, 0
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.print_options.horizontalCentered = True
    ws.page_margins.left = ws.page_margins.right = 0.4
    ws.oddFooter.center.text = "B.E.E – ברק הנדסת חשמל בע\"מ | עמוד &P מתוך &N"
    ws.append([f"כתב כמויות מתומחר – {b.title}"])
    ws["A1"].font = Font(bold=True, size=14)
    ws.append([f"לכבוד: {b.client}   |   אתר: {b.site}   |   {b.date}   |   מהדורה {b.revision}"])
    ws.append(["מחירים בש\"ח ללא מע\"מ, אספקה והתקנה. כמויות המסומנות * הן הערכה מהסיור — התמורה לפי ביצוע בפועל."])
    ws.append([])
    for c in res["chapters"]:
        ch = c["ch"]
        ws.append([f"{ch.no}  {ch.title}"])
        r = ws.max_row
        ws.merge_cells(start_row=r, start_column=1, end_row=r, end_column=6)
        ws.cell(r, 1).font = Font(bold=True, size=11)
        ws.cell(r, 1).fill = sub
        ws.append(["סעיף", "תאור", "יח'", "כמות", "מחיר יח' ₪", "סה\"כ ₪"])
        for cell in ws[ws.max_row]:
            cell.font, cell.fill, cell.alignment, cell.border = hfont, head, ctr, border
        for i, row in enumerate(c["rows"], 1):
            it = row["item"]
            star = "*" if it.status in ("estimate", "unresolved") else ""
            ws.append([f"{ch.no}.{i:03d}", it.desc, it.unit, f"{row['qty']:,.0f}{star}" if row['qty'] >= 10 else f"{row['qty']:g}{star}",
                       row["price"], row["total"]])
            rr = ws.max_row
            for col in range(1, 7):
                ws.cell(rr, col).border = border
            ws.cell(rr, 2).alignment = wrap
            for col in (1, 3, 4):
                ws.cell(rr, col).alignment = ctr
            ws.cell(rr, 5).number_format = "#,##0.0"
            ws.cell(rr, 6).number_format = "#,##0"
            ws.row_dimensions[rr].height = 15 * max(1, math.ceil(len(it.desc) / 70))
        ws.append([None, f"סה\"כ {ch.no} {ch.title}", None, None, None, c["total"]])
        rr = ws.max_row
        ws.cell(rr, 2).font = Font(bold=True)
        ws.cell(rr, 6).font = Font(bold=True)
        ws.cell(rr, 6).number_format = "#,##0"
        ws.append([])
    for label, val in (("סה\"כ לפני מע\"מ", res["net"]), ("מע\"מ", res["vat"]), ("סה\"כ כולל מע\"מ", res["gross"])):
        ws.append([None, label, None, None, None, val])
        ws.cell(ws.max_row, 2).font = Font(bold=True, size=12)
        ws.cell(ws.max_row, 6).font = Font(bold=True, size=12)
        ws.cell(ws.max_row, 6).number_format = "#,##0"
    if b.milestones:
        ws.append([])
        ws.append([None, "אבני דרך לתשלום", None, None, "%", "סכום ₪"])
        for cell in ws[ws.max_row][1:]:
            cell.font = Font(bold=True)
        for name, pct in b.milestones:
            ws.append([None, name, None, None, f"{pct:.0%}", int(xround(res["net"] * pct))])
            ws.cell(ws.max_row, 6).number_format = "#,##0"
    if b.terms:
        ws.append([])
        ws.append([None, "תנאים והערות"])
        ws.cell(ws.max_row, 2).font = Font(bold=True)
        for i, t in enumerate(b.terms, 1):
            ws.append([None, f"{i}. {t}"])
            r = ws.max_row
            ws.merge_cells(start_row=r, start_column=2, end_row=r, end_column=6)
            ws.cell(r, 2).alignment = Alignment(wrap_text=True, horizontal="right", vertical="top")
            ws.row_dimensions[r].height = 15 * max(1, math.ceil(len(t) / 95))
    for col, w in zip("ABCDEF", (10, 66, 7, 9, 12, 13)):
        ws.column_dimensions[col].width = w
    path.parent.mkdir(parents=True, exist_ok=True)
    wb.save(path)


def to_pdf(xlsx: Path, out_dir: Path) -> Optional[Path]:
    import subprocess

    out_dir.mkdir(parents=True, exist_ok=True)
    r = subprocess.run(["soffice", "--headless", "--convert-to", "pdf", "--outdir", str(out_dir), str(xlsx)],
                       capture_output=True, text=True, timeout=180)
    pdf = out_dir / (xlsx.stem + ".pdf")
    return pdf if pdf.exists() else None
