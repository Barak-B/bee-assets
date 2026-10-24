"""Cover sheet (דף שער, E-00): project data, sheet index, revisions, open items.

The sheet index is built from the plan of the set (every sheet the engine is about to draw), so the
cover can never list a sheet that does not exist. Open items are collected from every "verify"
list in the design (drilling template, notes starting with "לאימות") so the reviewer sees in one
place what still needs a source.
"""
from __future__ import annotations

from dataclasses import dataclass

from ezdxf.enums import TextEntityAlignment as TA

from .model import Design
from .sheet import SheetContext, TB_H, TB_W


@dataclass
class SheetEntry:
    kind: str          # cover | mv | mv_schedule | sld | panel | drill
    no: str            # E-00
    title: str
    scale: str = "-"


def _wrap(s: str, max_chars: int) -> list[str]:
    words, lines, cur = s.split(), [], ""
    for w in words:
        if cur and len(cur) + 1 + len(w) > max_chars:
            lines.append(cur)
            cur = w
        else:
            cur = f"{cur} {w}".strip()
    if cur:
        lines.append(cur)
    return lines


def open_items(design: Design) -> list[str]:
    out: list[str] = []
    for part in (design.drill_template, design.site, design.earthing, design.comm):
        if part:
            out += list(part.get("verify", []))
    for n in design.notes:
        if n.startswith("לאימות"):
            out.append(n)
    for mb in design.mv_boards:
        out += [n for n in mb.notes if n.startswith("לאימות")]
    return out


def draw_cover(ctx: SheetContext, design: Design, entries: list[SheetEntry]) -> list[str]:
    tb = design.title
    warnings: list[str] = []
    x0, y0, x1, y1 = ctx.x0, ctx.y0, ctx.x1, ctx.y1
    # ---- head: project, site, client ------------------------------------------------------------
    ctx.text(tb.project, (x1 - 6.0, y1 - 22.0), 9.0, "frame_text", TA.MIDDLE_RIGHT, bold=True)
    ctx.text(tb.site, (x1 - 6.0, y1 - 33.0), 4.0, "frame_text", TA.MIDDLE_RIGHT)
    ctx.text(f"מזמין: {tb.client}", (x1 - 6.0, y1 - 40.0), 3.2, "frame_text", TA.MIDDLE_RIGHT)
    ctx.text(f"מתכנן: {tb.designer}", (x1 - 6.0, y1 - 46.0), 3.2, "frame_text", TA.MIDDLE_RIGHT)
    # status strip at the top-left: ☐ לעיון ☑ לאישור ☐ למכרז ☐ לביצוע ☐ AS-MADE
    ctx.text("מטרת ההגשה:", (x0 + 6.0, y1 - 22.0), 2.6, "frame_text", TA.MIDDLE_LEFT, bold=True)
    sx = x0 + 40.0
    for st in ("לעיון", "לאישור", "למכרז", "לביצוע", "AS-MADE"):
        ctx.rect(sx, y1 - 23.5, 3.0, 3.0, "frame")
        if st == tb.status:
            ctx.line((sx, y1 - 23.5), (sx + 3.0, y1 - 20.5), "frame")
            ctx.line((sx, y1 - 20.5), (sx + 3.0, y1 - 23.5), "frame")
        ctx.text(st, (sx + 5.0, y1 - 22.0), 2.4, "frame_text", TA.MIDDLE_LEFT, bold=(st == tb.status))
        sx += 10.0 + len(st) * 2.6
    ctx.text(f"מהדורה {tb.revision}  ·  {tb.date}", (x0 + 6.0, y1 - 30.0), 2.6, "frame_text", TA.MIDDLE_LEFT)
    ctx.line((x0 + 6.0, y1 - 52.0), (x1 - 6.0, y1 - 52.0), "frame")

    # ---- left column: project data ------------------------------------------------------------------
    n_circ = sum(len(b.all_circuits()) for b in design.boards)
    kinds = {}
    for n in design.nodes:
        kinds[n.kind] = kinds.get(n.kind, 0) + 1
    heb = {"inverter": "ממיר", "battery": "מצבר", "generator": "גנרטור", "pv": "PV", "transformer": "שנאי", "load": "צרכן",
           "bess": "BESS", "ups": "UPS", "meter": "מונה", "grid": "רשת", "pcs": "PCS", "rmu": "RMU"}
    node_txt = ", ".join(f"{v}×{heb.get(k, k)}" for k, v in kinds.items()) or "-"
    rows = [("לקוח", tb.client), ("אתר", tb.site), ("סטטוס", tb.status), ("מהדורה / תאריך", f"{tb.revision} / {tb.date}"),
            ("לוחות מתח נמוך", f"{len(design.boards)}  ({n_circ} מעגלים)"),
            ("מסדרי מתח גבוה", f"{len(design.mv_boards)}  ({sum(len(m.cells) for m in design.mv_boards)} תאים)"),
            ("צמתים (ממיר/אגירה/PV)", node_txt)]
    if design.drill_template:
        t = design.drill_template
        rows.append(("ארונות BESS / משטח", f"{len(t.get('units', []))} × {t.get('units', [{}])[0].get('model', '')}  ·  "
                                            f"{t['slab']['length_mm'] / 1000:g}×{t['slab']['width_mm'] / 1000:g} m"))
    rows += list(design.project_data)
    rows.append(("גיליונות בסט", str(len(entries))))
    lx, ly, lw, rh = x0 + 6.0, y1 - 60.0, 150.0, 5.2
    ctx.text("נתוני הפרויקט", (lx + lw, ly + 1.5), 3.2, "legend", TA.BOTTOM_RIGHT, bold=True)
    h = rh * len(rows)
    ctx.rect(lx, ly - h, lw, h, "legend")
    ctx.line((lx + lw - 50.0, ly - h), (lx + lw - 50.0, ly), "legend")
    for i, (k, v) in enumerate(rows):
        yy = ly - rh * (i + 0.5)
        if i:
            ctx.line((lx, yy + rh / 2), (lx + lw, yy + rh / 2), "legend")
        ctx.text(k, (lx + lw - 1.5, yy), 1.9, "legend", TA.MIDDLE_RIGHT, bold=True)
        ctx.text(v[:58], (lx + lw - 51.5, yy), 1.9, "legend", TA.MIDDLE_RIGHT)

    # revisions under the data table
    ry = ly - h - 12.0
    ctx.text("מהדורות", (lx + lw, ry + 1.5), 3.2, "legend", TA.BOTTOM_RIGHT, bold=True)
    revs = tb.revisions or [(tb.revision, tb.date, tb.sheet_title or "")]
    cols = [("מהד'", 12.0), ("תאריך", 24.0), ("תיאור", lw - 36.0)]
    rev_rows: list[tuple[str, str, list[str]]] = [(r, d, _wrap(txt, 58)[:2]) for r, d, txt in revs]
    hh = rh * (1 + sum(max(1, len(t)) for _, _, t in rev_rows))
    ctx.rect(lx, ry - hh, lw, hh, "legend")
    xx = lx + lw
    for name, cw in cols:
        ctx.text(name, (xx - cw / 2, ry - rh / 2), 2.0, "legend", TA.MIDDLE_CENTER, bold=True)
        xx -= cw
        if xx > lx + 0.5:
            ctx.line((xx, ry - hh), (xx, ry), "legend")
    yy = ry - rh
    for r, d, lines in rev_rows:
        ctx.line((lx, yy), (lx + lw, yy), "legend")
        n = max(1, len(lines))
        ctx.text(r, (lx + lw - cols[0][1] / 2, yy - rh * n / 2), 2.0, "legend", TA.MIDDLE_CENTER)
        ctx.text(d, (lx + lw - cols[0][1] - cols[1][1] / 2, yy - rh * n / 2), 2.0, "legend", TA.MIDDLE_CENTER)
        for j, line in enumerate(lines):
            ctx.text(line, (lx + lw - 37.5, yy - rh * (j + 0.5)), 1.9, "legend", TA.MIDDLE_RIGHT)
        yy -= rh * n

    # source documents, then open items, under the revisions (left column)
    oy = yy - 9.0
    if design.sources:
        ctx.text("מסמכי מקור", (lx + lw, oy + 1.5), 3.2, "legend", TA.BOTTOM_RIGHT, bold=True)
        src = design.sources[:8]
        ctx.mtext([f"{i + 1}. {s}" for i, s in enumerate(src)], (lx + lw, oy - 1.0), 1.7, "notes", width=lw)
        oy -= 3.0 + 2.6 * sum(1 + len(s) // 80 for s in src) + 8.0
    items = open_items(design)
    if items:
        ctx.text("נושאים לאימות", (lx + lw, oy + 1.5), 3.2, "legend", TA.BOTTOM_RIGHT, bold=True)
        ctx.mtext([f"{i + 1}. {it}" for i, it in enumerate(items[:10])], (lx + lw, oy - 1.0), 1.7, "notes", width=lw)
        if len(items) > 10:
            warnings.append(f"דף שער: {len(items) - 10} נושאים לאימות לא נכנסו")

    # ---- right column: sheet index ----------------------------------------------------------------
    sx1, sy = x1 - 6.0, y1 - 60.0
    scols = [("גיליון", 18.0), ("שם הגיליון", 140.0), ("קנ\"מ", 22.0), ("מהד'", 12.0)]
    sw = sum(c[1] for c in scols)
    sx0 = sx1 - sw
    ctx.text("רשימת גיליונות", (sx1, sy + 1.5), 3.2, "legend", TA.BOTTOM_RIGHT, bold=True)
    max_rows = int((sy - (y0 + TB_H + 24.0)) / rh) - 1
    shown = entries[:max_rows]
    if len(entries) > max_rows:
        warnings.append(f"דף שער: {len(entries) - max_rows} גיליונות לא נכנסו לרשימה")
    sh = rh * (len(shown) + 1)
    ctx.rect(sx0, sy - sh, sw, sh, "legend")
    xx = sx1
    for name, cw in scols:
        ctx.text(name, (xx - cw / 2, sy - rh / 2), 2.0, "legend", TA.MIDDLE_CENTER, bold=True)
        xx -= cw
        if xx > sx0 + 0.5:
            ctx.line((xx, sy - sh), (xx, sy), "legend")
    for i, e in enumerate(shown):
        yy = sy - rh * (i + 1.5)
        ctx.line((sx0, yy + rh / 2), (sx1, yy + rh / 2), "legend")
        ctx.text(e.no, (sx1 - scols[0][1] / 2, yy), 2.0, "legend", TA.MIDDLE_CENTER, bold=(e.kind == "cover"))
        ctx.text(e.title[:70], (sx1 - scols[0][1] - 1.5, yy), 2.0, "legend", TA.MIDDLE_RIGHT)
        ctx.text(e.scale, (sx1 - scols[0][1] - scols[1][1] - scols[2][1] / 2, yy), 1.8, "legend", TA.MIDDLE_CENTER)
        ctx.text(tb.revision, (sx0 + scols[3][1] / 2, yy), 1.8, "legend", TA.MIDDLE_CENTER)
    # footer under the sheet list (right column), well above the title block
    fy = max(sy - sh - 10.0, y0 + TB_H + 5.0 * 3 + 20.0)
    ctx.mtext(["סט זה הופק אוטומטית ממודל התכנון (bee-cad). כל ערך בגיליונות מקורו במודל או במקור המצוין בהערות; "
               "פריטים המסומנים \"לאימות\" אינם מאושרים לביצוע."], (sx1, fy), 1.8, "notes", width=sw)
    return warnings
