"""Calculation sheet (דף חישובים) — one row per circuit with the numbers behind every rating.

The same numbers the rule checks use: design current, cable capacity at the installation
method, voltage drop of the circuit and from the meter, minimum fault current at the far end
against the magnetic trip. The sheet ends the drawing set, as the calculation page of a permit pack.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from ezdxf.enums import TextEntityAlignment as TA

from .calc import (TRIP_MULTIPLE, ampacity, design_current, ik1_min_a, ik3_max_ka, loaded_conductors, node_kw,
                   parse_cable, source_impedance, voltage_drop_pct)
from .checks import DU_LIMIT_LIGHTING_PCT, DU_LIMIT_PCT, Finding, _method, check
from .model import Board, Circuit, Design
from .sheet import TB_H, SheetContext

ROW_H = 4.4


@dataclass
class CalcRow:
    board: str
    tag: str
    load: str
    device: str
    cable: str
    method: str
    ib: Optional[float]
    iz: Optional[float]
    du: Optional[float]
    du_total: Optional[float]
    du_limit: float
    ik1: Optional[float]
    ia: Optional[float]
    ok: bool


def _row(b: Board, c: Circuit, zs: float, up: list, up_du: float, kw: Optional[float]) -> CalcRow:
    d = c.device
    three = c.phase == "L1-3" or d.poles >= 3
    method = _method(c)
    ib = design_current(c, kw)
    iz = du = ik1 = ia = None
    if c.cable:
        spec = parse_cable(c.cable.designation)
        if spec:
            iz = ampacity(spec, method, loaded_conductors(c.phase, d.poles), c.cable.ambient_c)
        if ib and c.cable.length_m:
            du = voltage_drop_pct(c.cable, ib, three)
        if c.kind == "final" and d.kind in ("mcb", "rcbo") and d.rating_a and b.supply.kind in ("utility", "transformer"):
            mult = TRIP_MULTIPLE.get((d.curve or "C").upper()[:1])
            ik1 = ik1_min_a(zs, up + [c.cable])
            ia = mult * d.rating_a if mult else None
    final = c.kind == "final"
    total = du + up_du if du is not None and final else du
    limit = DU_LIMIT_LIGHTING_PCT if "תאורה" in c.load else DU_LIMIT_PCT
    ok = not (iz is not None and d.rating_a and d.rating_a > iz) and not (total is not None and total > limit)
    return CalcRow(b.id, c.tag, c.load or (c.to_node or c.to_board or ""), " ".join(d.label_lines()[:2]),
                   c.cable.designation if c.cable else "—", method, ib, iz, du, total, limit, ik1, ia, ok)


def calc_rows(design: Design) -> list[CalcRow]:
    work = design.model_copy(deep=True)
    check(work)                                   # fills the supply-cable drop the rows build on
    nodes = {n.id: n for n in work.nodes}
    rows: list[CalcRow] = []
    for b in work.boards:
        zs = source_impedance(b.supply.ik_ka) if b.supply.ik_ka else 0.0
        up = [b.supply.cable] if b.supply.cable and b.supply.cable.length_m else []
        up_du = (b.supply.cable.du_pct or 0.0) if b.supply.cable else 0.0
        for c in b.all_circuits():
            node = nodes.get(c.to_node or "")
            rows.append(_row(b, c, zs, up, up_du, node_kw(node.rating) if node else None))
    return rows


def _f(v: Optional[float], fmt: str = "{:.0f}") -> str:
    return fmt.format(v) if v is not None else "-"


COLS = [("לוח", 12.0), ("תג", 13.0), ("צרכן", 52.0), ("הגנה", 20.0), ("כבל", 26.0), ("שיטה", 10.0),
        ("Ib [A]", 13.0), ("Iz [A]", 13.0), ("ΔU מעגל %", 17.0), ("ΔU מצטבר %", 18.0), ("גבול %", 12.0),
        ("Ik1 min [A]", 17.0), ("Ia [A]", 13.0), ("תקין", 11.0)]


def rows_per_sheet(ctx: SheetContext) -> int:
    return int((ctx.y1 - 16.0 - (ctx.y0 + TB_H + 46.0)) / ROW_H) - 1


def draw_calc(ctx: SheetContext, design: Design, rows: list[CalcRow], first: bool, findings: list[Finding]) -> list[str]:
    k = (ctx.x1 - ctx.x0 - 8.0) / sum(c[1] for c in COLS)          # stretch the columns to the frame width
    cols = [(n, w * k) for n, w in COLS]
    tw = sum(c[1] for c in cols)
    x_right = ctx.x1 - 4.0
    y_top = ctx.y1 - 16.0
    ctx.text("דף חישובים — מעגלים ויציאות", (x_right, y_top + 1.0), 3.0, "legend", TA.BOTTOM_RIGHT, bold=True)
    h = ROW_H * (len(rows) + 1)
    ctx.rect(x_right - tw, y_top - h, tw, h, "legend")
    xx = x_right
    for name, cw in cols:
        ctx.text(name, (xx - cw / 2, y_top - ROW_H / 2), 1.7, "legend", TA.MIDDLE_CENTER, bold=True)
        xx -= cw
        ctx.line((xx, y_top - h), (xx, y_top), "legend")
    for i, r in enumerate(rows):
        yy = y_top - ROW_H * (i + 1.5)
        ctx.line((x_right - tw, yy + ROW_H / 2), (x_right, yy + ROW_H / 2), "legend")
        ik_ok = r.ik1 is None or r.ia is None or r.ik1 >= r.ia
        vals = [r.board, r.tag, r.load[:48], r.device, r.cable, r.method, _f(r.ib, "{:.1f}"), _f(r.iz, "{:g}"),
                _f(r.du, "{:.2f}"), _f(r.du_total, "{:.2f}"), f"{r.du_limit:g}", _f(r.ik1), _f(r.ia),
                "כן" if r.ok and ik_ok else "לבדוק"]
        xx = x_right
        for (name, cw), v in zip(cols, vals):
            al = TA.MIDDLE_RIGHT if name == "צרכן" else TA.MIDDLE_CENTER
            pos = (xx - 1.5, yy) if al == TA.MIDDLE_RIGHT else (xx - cw / 2, yy)
            ctx.text(v, pos, 1.6, "legend", al)
            xx -= cw
    if not first:
        return []
    # assumptions and findings under the table
    y = y_top - h - 8.0
    ik = ", ".join(f"{b.id} {b.supply.ik_ka:g}kA" for b in design.boards if b.supply.ik_ka) or "לא הוזן"
    basis = [
        "Ib: מ-load_kw או מהספק הממיר (cos φ = 1), אחרת דירוג המפסק.",
        "Iz: IEC 60364-5-52 נספח B, נחושת, 30°C או לפי ambient_c, בלי מקדם קיבוץ. B1 = מוליכים בצינור בקיר, C = כבל על קיר.",
        f"ΔU: ρ = 0.0225 Ω·ממ\"ר/מ'; מצטבר = מהמונה. גבול {DU_LIMIT_LIGHTING_PCT:g}% תאורה, {DU_LIMIT_PCT:g}% אחר (G.52.1).",
        f"Ik1 min: לולאת תקלה בקצה המעגל, c = 0.95, ρ = 1.5 × ρ20; זרם קצר בחיבור: {ik}. Ia = סף מגנטי עליון (B 5In, C 10In, D 20In).",
    ]
    basis.append("הטבלאות והגבולות הם ברירות מחדל הנדסיות לפי IEC, לא דרישת חוק; המהנדס המתכנן מאשר את שיטת ההתקנה והערכים.")
    ctx.text("הנחות החישוב", (x_right, y), 2.2, "notes", TA.TOP_RIGHT, bold=True)
    ctx.mtext(basis, (x_right, y - 3.5), 1.6, "notes", width=tw / 2 - 6.0)
    serious = [f for f in findings if f.level != "info"][:8]
    xm = x_right - tw / 2
    ctx.text("ממצאי בדיקה", (xm, y), 2.2, "notes", TA.TOP_RIGHT, bold=True)
    lines = [f"{'שגיאה' if f.level == 'error' else 'אזהרה'} · {f.where}: {f.message}" for f in serious] or \
        ["אין שגיאות ואין אזהרות."]
    ctx.mtext(lines, (xm, y - 3.5), 1.6, "notes", width=tw / 2 - 6.0)
    return []
